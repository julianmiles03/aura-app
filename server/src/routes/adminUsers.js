// Maintain Users, in the admin portal: a table of aura's users with add, edit and delete.
// routes/admin.js mounts this router after requireAdminSession, so every route here needs a signed-in
// admin (401 ADMIN_SIGNED_OUT otherwise).
//
// What a "user" is here: a row in `users`, the aura profile (name, city, bio, age...). Logins live in
// Supabase Auth, which this doesn't touch. So someone added here has a profile but no login (like
// the seeded users before db:demo-accounts), and deleting someone removes their aura profile but not
// their Supabase login; if they sign in again, the app asks them to set up a new profile.
import { Router } from 'express';
import { pool, query, withTransaction } from '../db.js';
import { ApiError, notFound } from '../errors.js';
import { MAIN_PHOTO_SQL, randomPastel } from '../lib/format.js';
import { removeMembership } from '../lib/groups.js';
import { removePhoto } from '../lib/storage.js';
import { parseId, readInt, readText } from '../lib/validate.js';
import { RELATIONSHIP_STATUSES } from './me.js';

const router = Router();

const userNotFound = () => notFound('USER_NOT_FOUND', "That person doesn't have an aura profile (they may have been deleted).");

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------
// The same limits as the app's own profile form (PATCH /api/me) and the database's CHECKs. Unlike the
// app, every field is checked before answering, so the form can mark all the problems at once:
// 400 VALIDATION_ERROR with details.fields = { firstName: "First name is required.", age: "..." }.
// partial: true (edit) checks only the fields that were sent; create needs the required ones.
function readUserFields(body, { partial }) {
  const errors = {};
  const out = {};
  // Runs one reader and files its error message under the field's name instead of stopping.
  const field = (key, column, read) => {
    if (partial && !(key in body)) return;
    try {
      out[column] = read(body[key]);
    } catch (err) {
      if (err instanceof ApiError) errors[key] = err.message;
      else throw err;
    }
  };
  field('firstName', 'first_name', (v) => readText(v, 'First name', { max: 50, required: true }));
  field('lastName', 'last_name', (v) => readText(v, 'Last name', { max: 50, required: true }));
  field('city', 'city', (v) => readText(v, 'City', { max: 80, required: true }));
  field('bio', 'bio', (v) => readText(v ?? null, 'Bio', { max: 500 }));
  // An empty box means "no age"; anything else must be a whole number from 18 to 120.
  field('age', 'age', (v) => (v === '' || v === null || v === undefined ? null : readInt(v, 'Age', { min: 18, max: 120, required: true })));
  field('gender', 'gender', (v) => readText(v ?? null, 'Gender', { max: 30 }));
  field('relationshipStatus', 'relationship_status', (v) => {
    const status = readText(v ?? null, 'Relationship status', { max: 30 });
    if (status && !RELATIONSHIP_STATUSES.includes(status)) throw new ApiError(400, 'VALIDATION_ERROR', 'Choose a relationship status from the list.');
    return status;
  });

  const problems = Object.keys(errors);
  if (problems.length) {
    const message = problems.length === 1 ? errors[problems[0]] : `Fix the ${problems.length} highlighted fields.`;
    throw new ApiError(400, 'VALIDATION_ERROR', message, { fields: errors });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------
const LIST_COLUMNS = `
  u.id, u.first_name, u.last_name, u.city, u.age, u.gender, u.relationship_status, u.avatar_color, u.created_at,
  (u.auth_user_id IS NOT NULL) AS has_login,
  ${MAIN_PHOTO_SQL} AS photo_url,
  (SELECT count(*) FROM group_memberships m WHERE m.user_id = u.id) AS group_count`;

const listJson = (u) => ({
  id: u.id,
  firstName: u.first_name,
  lastName: u.last_name,
  city: u.city,
  age: u.age,
  gender: u.gender,
  relationshipStatus: u.relationship_status,
  avatarColor: u.avatar_color,
  photoUrl: u.photo_url,
  createdAt: u.created_at,
  hasLogin: u.has_login, // linked to a Supabase Auth login, so they can sign in to the app
  groupCount: u.group_count,
});

// One person with everything the edit form and the delete question need.
async function loadUser(db, userId) {
  const { rows: [u] } = await db.query(
    `SELECT ${LIST_COLUMNS}, u.bio,
            (SELECT count(*) FROM messages msg WHERE msg.sender_user_id = u.id) AS message_count,
            (SELECT count(*) FROM group_likes l WHERE l.liked_by_user_id = u.id) AS like_count,
            (SELECT count(*) FROM user_photos p WHERE p.user_id = u.id) AS photo_count
     FROM users u WHERE u.id = $1`,
    [userId],
  );
  if (!u) throw userNotFound();
  // Their groups, and what happens to each if they're deleted: the longest-standing other member
  // takes over as owner, or the group goes too if nobody else is in it.
  const { rows: groups } = await db.query(
    `SELECT g.id, g.name, m.role,
            (SELECT count(*) FROM group_memberships x WHERE x.group_id = g.id) AS member_count,
            nxt.first_name AS next_first_name, nxt.last_name AS next_last_name
     FROM group_memberships m
     JOIN friend_groups g ON g.id = m.group_id
     LEFT JOIN LATERAL (
       SELECT o.first_name, o.last_name FROM group_memberships x JOIN users o ON o.id = x.user_id
       WHERE x.group_id = g.id AND x.user_id <> $1
       ORDER BY x.joined_at, x.user_id LIMIT 1
     ) nxt ON true
     WHERE m.user_id = $1
     ORDER BY m.joined_at`,
    [userId],
  );
  return {
    ...listJson(u),
    bio: u.bio,
    messageCount: u.message_count,
    likeCount: u.like_count,
    photoCount: u.photo_count,
    groups: groups.map((g) => ({
      id: g.id,
      name: g.name,
      role: g.role,
      memberCount: g.member_count,
      // Who would own it after they're gone (only for groups they own that have someone else in them).
      nextOwner: g.role === 'owner' && g.next_first_name ? `${g.next_first_name} ${g.next_last_name}` : null,
    })),
  };
}

// The table: everyone A to Z (limit up to 500), or, for the people search in Maintain Groups, the
// first 20 whose name contains q (or whose id is q). With groupId, each says whether they're in
// that group (inGroup), so the search can show "In this group".
router.get('/admin/users', async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 80) : '';
  const groupId = req.query.groupId ? parseId(req.query.groupId, 'groupId') : null;
  const limit = Math.min(500, Math.max(1, Number.parseInt(req.query.limit, 10) || 20));
  // % and _ are wildcards in ILIKE; escape them so they match themselves.
  const pattern = `%${q.replace(/[\\%_]/g, '\\$&')}%`;
  const { rows } = await query(
    `SELECT ${LIST_COLUMNS},
            EXISTS (SELECT 1 FROM group_memberships m WHERE m.user_id = u.id AND m.group_id = $2) AS in_group
     FROM users u
     WHERE $1 = '' OR (u.first_name || ' ' || u.last_name) ILIKE $3 OR u.id::text = $1
     ORDER BY lower(u.first_name), lower(u.last_name), u.id
     LIMIT $4`,
    [q, groupId, pattern, limit],
  );
  res.json({ users: rows.map((u) => ({ ...listJson(u), inGroup: u.in_group })) });
});

router.get('/admin/users/:id', async (req, res) => {
  res.json({ user: await loadUser(pool, parseId(req.params.id, 'user id')) });
});

// ---------------------------------------------------------------------------
// Add, edit, delete
// ---------------------------------------------------------------------------
// Add: { firstName, lastName, city, bio?, age?, gender?, relationshipStatus? } -> 201 { user }.
router.post('/admin/users', async (req, res) => {
  const f = readUserFields(req.body, { partial: false });
  const { rows: [row] } = await query(
    `INSERT INTO users (first_name, last_name, city, bio, age, gender, relationship_status, avatar_color)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
    [f.first_name, f.last_name, f.city, f.bio ?? null, f.age ?? null, f.gender ?? null, f.relationship_status ?? null, randomPastel()],
  );
  res.status(201).json({ user: await loadUser(pool, row.id) });
});

// Edit any of the same fields; leave out the ones that don't change.
router.patch('/admin/users/:id', async (req, res) => {
  const userId = parseId(req.params.id, 'user id');
  const f = readUserFields(req.body, { partial: true });
  const columns = Object.keys(f);
  if (columns.length) {
    const { rowCount } = await query(
      `UPDATE users SET ${columns.map((c, i) => `${c} = $${i + 2}`).join(', ')} WHERE id = $1`,
      [userId, ...columns.map((c) => f[c])],
    );
    if (!rowCount) throw userNotFound();
  }
  res.json({ user: await loadUser(pool, userId) });
});

// Delete someone's aura profile. First they leave each of their groups the way the app does it
// (lib/groups.js removeMembership: out of the group's chats, ownership to the longest-standing
// member), and a group left with nobody in it is deleted, as when the last member leaves in the app.
// Then the users row goes, and the database's ON DELETE rules do the rest: their photos, interests,
// friendships and the Connects/Passes they made are deleted; their messages and meetup
// confirmations stay, without a name. Their photo files are deleted from storage afterwards.
router.delete('/admin/users/:id', async (req, res) => {
  const userId = parseId(req.params.id, 'user id');
  const files = await withTransaction(async (client) => {
    const { rows: [user] } = await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [userId]);
    if (!user) throw userNotFound();
    const leftovers = [];
    const { rows: memberships } = await client.query('SELECT group_id FROM group_memberships WHERE user_id = $1', [userId]);
    for (const { group_id: groupId } of memberships) {
      await client.query('SELECT id FROM friend_groups WHERE id = $1 FOR UPDATE', [groupId]); // one change at a time
      await removeMembership(client, groupId, userId);
      const { rows: [emptied] } = await client.query(
        `DELETE FROM friend_groups g WHERE g.id = $1 AND NOT EXISTS (SELECT 1 FROM group_memberships WHERE group_id = g.id)
         RETURNING to_jsonb(g) ->> 'photo_url' AS photo_url`,
        [groupId],
      );
      if (emptied?.photo_url) leftovers.push(emptied.photo_url);
    }
    const { rows: photos } = await client.query('SELECT image_url FROM user_photos WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM users WHERE id = $1', [userId]);
    return [...leftovers, ...photos.map((p) => p.image_url)];
  });
  for (const url of files) await removePhoto(url); // placeholders (no stored file) are skipped
  res.sendStatus(204);
});

export default router;

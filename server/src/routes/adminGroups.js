// Maintain Groups, in the admin portal: create, view, edit and delete friend groups and who's in them.
// routes/admin.js mounts this router after requireAdminSession, so every route here needs a signed-in
// admin (401 ADMIN_SIGNED_OUT otherwise).
//
// Changes go through the same helpers the app uses (lib/groups.js), so the group rules hold here too:
//   - at most 10 members: the database trigger group_member_cap refuses an 11th (409 GROUP_FULL)
//   - one owner per group, and a group always has at least one member (the owner)
//   - members sit in their group's match chats, and leave them when they leave the group
//   - someone who loses their active group switches to their oldest other group
import { Router } from 'express';
import { pool, query, withTransaction } from '../db.js';
import { badRequest, conflict, notFound } from '../errors.js';
import { groupInitials, MAIN_PHOTO_SQL } from '../lib/format.js';
import { addMember, createGroup, MAX_MEMBERS, removeMembership, setOwner } from '../lib/groups.js';
import { removePhoto } from '../lib/storage.js';
import { parseId, readText } from '../lib/validate.js';

const router = Router();

const groupNotFound = () => notFound('GROUP_NOT_FOUND', 'That friend group does not exist.');

// One group with its members and how much hangs off it (shown before deleting it).
async function loadGroup(db, groupId) {
  const { rows: [g] } = await db.query(
    `SELECT g.id, g.name, g.city, g.invite_code, g.avatar_color, to_jsonb(g) ->> 'photo_url' AS photo_url, g.created_at,
            (SELECT count(*) FROM group_memberships m WHERE m.group_id = g.id) AS member_count,
            (SELECT count(*) FROM group_matches mt WHERE g.id IN (mt.group_low_id, mt.group_high_id)) AS match_count,
            (SELECT count(*) FROM group_likes l WHERE g.id IN (l.from_group_id, l.to_group_id)) AS like_count,
            (SELECT count(*) FROM messages msg
               JOIN chats c ON c.id = msg.chat_id
               JOIN group_matches mt ON mt.id = c.match_id
             WHERE g.id IN (mt.group_low_id, mt.group_high_id)) AS message_count
     FROM friend_groups g WHERE g.id = $1`,
    [groupId],
  );
  if (!g) throw groupNotFound();
  const { rows: members } = await db.query(
    `SELECT u.id, u.first_name, u.last_name, u.city, u.avatar_color, gm.role, gm.joined_at,
            (u.active_group_id = gm.group_id) AS is_active_group, ${MAIN_PHOTO_SQL} AS photo_url
     FROM group_memberships gm JOIN users u ON u.id = gm.user_id
     WHERE gm.group_id = $1
     ORDER BY (gm.role = 'owner') DESC, gm.joined_at, u.id`,
    [groupId],
  );
  return {
    id: g.id,
    name: g.name,
    initials: groupInitials(g.name),
    city: g.city,
    inviteCode: g.invite_code,
    avatarColor: g.avatar_color,
    photoUrl: g.photo_url,
    createdAt: g.created_at,
    memberCount: g.member_count,
    maxMembers: MAX_MEMBERS,
    isFull: g.member_count >= MAX_MEMBERS,
    matchCount: g.match_count,
    likeCount: g.like_count,
    messageCount: g.message_count,
    members: members.map((m) => ({
      id: m.id,
      firstName: m.first_name,
      lastName: m.last_name,
      city: m.city,
      avatarColor: m.avatar_color,
      photoUrl: m.photo_url,
      role: m.role,
      joinedAt: m.joined_at,
      isActiveGroup: m.is_active_group, // this is the group they act as in the app
    })),
  };
}

// The group must exist; returns { id, name } for messages like "Already a member of ...".
async function findGroup(db, groupId, { lock = false } = {}) {
  const { rows: [group] } = await db.query(
    `SELECT id, name FROM friend_groups WHERE id = $1${lock ? ' FOR UPDATE' : ''}`,
    [groupId],
  );
  if (!group) throw groupNotFound();
  return group;
}

async function assertUserExists(userId, what = 'That person') {
  const { rows: [user] } = await query('SELECT id FROM users WHERE id = $1', [userId]);
  if (!user) throw notFound('USER_NOT_FOUND', `${what} doesn't have an aura account.`);
}

// ---------------------------------------------------------------------------
// Groups
// ---------------------------------------------------------------------------
// Every group, A to Z, with its member count and owner: { groups: [...] }.
router.get('/admin/groups', async (req, res) => {
  const { rows } = await query(
    `SELECT g.id, g.name, g.city, g.avatar_color, to_jsonb(g) ->> 'photo_url' AS photo_url, g.created_at,
            (SELECT count(*) FROM group_memberships m WHERE m.group_id = g.id) AS member_count,
            (SELECT count(*) FROM group_matches mt WHERE g.id IN (mt.group_low_id, mt.group_high_id)) AS match_count,
            o.id AS owner_id, o.first_name AS owner_first_name, o.last_name AS owner_last_name
     FROM friend_groups g
     LEFT JOIN LATERAL (
       SELECT u.id, u.first_name, u.last_name FROM group_memberships m JOIN users u ON u.id = m.user_id
       WHERE m.group_id = g.id AND m.role = 'owner' ORDER BY m.joined_at LIMIT 1
     ) o ON true
     ORDER BY lower(g.name), g.id
     LIMIT 500`,
  );
  res.json({
    groups: rows.map((g) => ({
      id: g.id,
      name: g.name,
      initials: groupInitials(g.name),
      city: g.city,
      avatarColor: g.avatar_color,
      photoUrl: g.photo_url,
      createdAt: g.created_at,
      memberCount: g.member_count,
      maxMembers: MAX_MEMBERS,
      isFull: g.member_count >= MAX_MEMBERS,
      matchCount: g.match_count,
      owner: g.owner_id ? { id: g.owner_id, firstName: g.owner_first_name, lastName: g.owner_last_name } : null,
    })),
  });
});

// Create: { name, city, ownerUserId }. A group can't be empty, so it starts with its owner.
router.post('/admin/groups', async (req, res) => {
  const name = readText(req.body.name, 'Group name', { max: 60, required: true });
  const city = readText(req.body.city, 'City', { max: 80, required: true });
  if (req.body.ownerUserId === undefined || req.body.ownerUserId === null) {
    throw badRequest('VALIDATION_ERROR', 'Choose who owns the group.', { field: 'ownerUserId' });
  }
  const ownerId = parseId(req.body.ownerUserId, 'ownerUserId');
  await assertUserExists(ownerId, 'The owner');
  // makeActive: false, so an admin doesn't change which group someone is acting as in the app.
  const groupId = await withTransaction((client) => createGroup(client, { name, city, ownerId, makeActive: false }));
  res.status(201).json({ group: await loadGroup(pool, groupId) });
});

router.get('/admin/groups/:id', async (req, res) => {
  res.json({ group: await loadGroup(pool, parseId(req.params.id, 'group id')) });
});

// Edit name and/or city. Either can be left out, but neither can be blanked.
router.patch('/admin/groups/:id', async (req, res) => {
  const groupId = parseId(req.params.id, 'group id');
  const name = readText(req.body.name, 'Group name', { max: 60, required: 'name' in req.body });
  const city = readText(req.body.city, 'City', { max: 80, required: 'city' in req.body });
  const { rowCount } = await query(
    'UPDATE friend_groups SET name = coalesce($2, name), city = coalesce($3, city) WHERE id = $1',
    [groupId, name ?? null, city ?? null],
  );
  if (!rowCount) throw groupNotFound();
  res.json({ group: await loadGroup(pool, groupId) });
});

// Delete a group and everything that belongs to it. The database's ON DELETE CASCADE removes its
// memberships, likes sent and received, matches, and those matches' chats (with their messages,
// conversation starters and meetups). Members who were acting as this group switch to their oldest
// other group. The group photo's file is deleted from storage afterwards.
router.delete('/admin/groups/:id', async (req, res) => {
  const groupId = parseId(req.params.id, 'group id');
  const photoUrl = await withTransaction(async (client) => {
    const { rows: [group] } = await client.query(
      `SELECT to_jsonb(g) ->> 'photo_url' AS photo_url,
              ARRAY(SELECT user_id FROM group_memberships WHERE group_id = g.id) AS member_ids
       FROM friend_groups g WHERE g.id = $1 FOR UPDATE`,
      [groupId],
    );
    if (!group) throw groupNotFound();
    await client.query('DELETE FROM friend_groups WHERE id = $1', [groupId]);
    await client.query(
      `UPDATE users u SET active_group_id = (
         SELECT group_id FROM group_memberships WHERE user_id = u.id ORDER BY joined_at LIMIT 1)
       WHERE u.id = ANY($1) AND u.active_group_id IS NULL`,
      [group.member_ids],
    );
    return group.photo_url;
  });
  await removePhoto(photoUrl);
  res.sendStatus(204);
});

// ---------------------------------------------------------------------------
// Members
// ---------------------------------------------------------------------------
// Add someone: { userId }. 409 GROUP_FULL when the group already has 10 (from the database
// trigger, so it holds even if two admins add at the same moment); 409 ALREADY_MEMBER.
router.post('/admin/groups/:id/members', async (req, res) => {
  const groupId = parseId(req.params.id, 'group id');
  const userId = parseId(req.body.userId, 'userId');
  const group = await findGroup(pool, groupId);
  await assertUserExists(userId);
  await addMember(group, userId);
  res.status(201).json({ group: await loadGroup(pool, groupId) });
});

// Make a member the owner: { role: 'owner' }. The old owner becomes a regular member.
router.patch('/admin/groups/:id/members/:userId', async (req, res) => {
  const groupId = parseId(req.params.id, 'group id');
  const userId = parseId(req.params.userId, 'user id');
  if (req.body.role !== 'owner') {
    throw badRequest('VALIDATION_ERROR', "Send role: 'owner' to make this member the owner.", { field: 'role' });
  }
  await withTransaction(async (client) => {
    await findGroup(client, groupId, { lock: true });
    await setOwner(client, groupId, userId);
  });
  res.json({ group: await loadGroup(pool, groupId) });
});

// Remove a member. The last member can't be removed (409 LAST_MEMBER): delete the group instead.
// Removing the owner hands ownership to the longest-standing member.
router.delete('/admin/groups/:id/members/:userId', async (req, res) => {
  const groupId = parseId(req.params.id, 'group id');
  const userId = parseId(req.params.userId, 'user id');
  await withTransaction(async (client) => {
    // Locking the group row means two removals at once can't empty the group between them.
    const group = await findGroup(client, groupId, { lock: true });
    const { rows: [{ n }] } = await client.query('SELECT count(*) AS n FROM group_memberships WHERE group_id = $1', [groupId]);
    const { rows: [isMember] } = await client.query(
      'SELECT 1 FROM group_memberships WHERE group_id = $1 AND user_id = $2',
      [groupId, userId],
    );
    if (!isMember) throw notFound('MEMBER_NOT_FOUND', 'That person is not a member of this group.');
    if (n <= 1) {
      throw conflict('LAST_MEMBER', `${group.name} has nobody else in it, and a group can't be empty. Delete the group instead.`);
    }
    await removeMembership(client, groupId, userId);
  });
  res.json({ group: await loadGroup(pool, groupId) });
});

// ---------------------------------------------------------------------------
// Finding people to add
// ---------------------------------------------------------------------------
// Up to 20 people whose name contains q (or whose id is q), A to Z. With groupId, each says
// whether they're already in that group, so the portal can show "Already in this group".
router.get('/admin/users', async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 80) : '';
  const groupId = req.query.groupId ? parseId(req.query.groupId, 'groupId') : null;
  // % and _ are wildcards in ILIKE; escape them so they match themselves.
  const pattern = `%${q.replace(/[\\%_]/g, '\\$&')}%`;
  const { rows } = await query(
    `SELECT u.id, u.first_name, u.last_name, u.city, u.avatar_color, ${MAIN_PHOTO_SQL} AS photo_url,
            (SELECT count(*) FROM group_memberships m WHERE m.user_id = u.id) AS group_count,
            EXISTS (SELECT 1 FROM group_memberships m WHERE m.user_id = u.id AND m.group_id = $2) AS in_group
     FROM users u
     WHERE $1 = '' OR (u.first_name || ' ' || u.last_name) ILIKE $3 OR u.id::text = $1
     ORDER BY lower(u.first_name), lower(u.last_name), u.id
     LIMIT 20`,
    [q, groupId, pattern],
  );
  res.json({
    users: rows.map((u) => ({
      id: u.id,
      firstName: u.first_name,
      lastName: u.last_name,
      city: u.city,
      avatarColor: u.avatar_color,
      photoUrl: u.photo_url,
      groupCount: u.group_count,
      inGroup: u.in_group,
    })),
  });
});

export default router;

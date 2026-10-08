import { Router } from 'express';
import { pool, query, withTransaction } from '../db.js';
import { badRequest, conflict, forbidden, notFound } from '../errors.js';
import { loadChatRows } from '../lib/chats.js';
import { userInitials } from '../lib/format.js';
import { loadGroupCards } from '../lib/groups.js';
import { getOnboarding } from '../lib/profile.js';
import { parseId, readInt, readText, readTextList } from '../lib/validate.js';

const router = Router();

export const RELATIONSHIP_STATUSES = ['single', 'in_a_relationship', 'married', 'its_complicated', 'prefer_not_to_say'];

export async function loadMe(userId) {
  const { rows: [u] } = await query('SELECT * FROM users WHERE id = $1', [userId]);
  const [photos, interests, memberships, onboarding] = await Promise.all([
    query('SELECT id, position, label, image_url FROM user_photos WHERE user_id = $1 ORDER BY position', [userId]),
    query(
      `SELECT i.id, i.name FROM user_interests ui JOIN interests i ON i.id = ui.interest_id
       WHERE ui.user_id = $1 ORDER BY ui.added_at, i.name`,
      [userId],
    ),
    query('SELECT group_id, role FROM group_memberships WHERE user_id = $1 ORDER BY joined_at', [userId]),
    getOnboarding(pool, userId),
  ]);

  const roles = new Map(memberships.rows.map((m) => [m.group_id, m.role]));
  const cards = await loadGroupCards(pool, [...roles.keys()], { includeInviteCode: true });
  const groups = cards
    .map((card) => ({ ...card, role: roles.get(card.id), isActive: card.id === u.active_group_id }))
    .sort((a, b) => Number(b.isActive) - Number(a.isActive));

  let unreadMessages = 0;
  if (u.active_group_id) {
    const chats = await loadChatRows(pool, userId, u.active_group_id);
    unreadMessages = chats.reduce((sum, c) => sum + c.unreadCount, 0);
  }

  return {
    user: {
      id: u.id,
      firstName: u.first_name,
      lastName: u.last_name,
      initials: userInitials(u.first_name, u.last_name),
      city: u.city,
      bio: u.bio,
      age: u.age,
      gender: u.gender,
      relationshipStatus: u.relationship_status,
      personalityTraits: u.personality_traits,
      avatarColor: u.avatar_color,
    },
    photos: photos.rows.map((p) => ({ id: p.id, position: p.position, label: p.label, imageUrl: p.image_url })),
    interests: interests.rows,
    activeGroupId: u.active_group_id,
    groups,
    onboarding,
    unreadMessages,
  };
}

router.get('/me', async (req, res) => {
  res.json(await loadMe(req.user.id));
});

// Update any profile fields. `interests` replaces the full list (names; new ones are created).
router.patch('/me', async (req, res) => {
  const b = req.body;
  const fields = {
    first_name: readText(b.firstName, 'First name', { max: 50, required: 'firstName' in b }),
    last_name: readText(b.lastName, 'Last name', { max: 50, required: 'lastName' in b }),
    city: readText(b.city, 'City', { max: 80, required: 'city' in b }),
    bio: readText(b.bio, 'Bio', { max: 500 }),
    age: readInt(b.age, 'Age', { min: 18, max: 120 }),
    gender: readText(b.gender, 'Gender', { max: 30 }),
    relationship_status: readText(b.relationshipStatus, 'Relationship status', { max: 30 }),
    personality_traits: readTextList(b.personalityTraits, 'Personality traits', { maxItems: 5, maxLength: 24 }),
  };
  if (fields.relationship_status && !RELATIONSHIP_STATUSES.includes(fields.relationship_status)) {
    throw badRequest('VALIDATION_ERROR', `Relationship status must be one of: ${RELATIONSHIP_STATUSES.join(', ')}.`);
  }
  const interests = readTextList(b.interests, 'Interests', { minItems: 1, maxItems: 15, maxLength: 40 });

  const columns = Object.keys(fields).filter((k) => fields[k] !== undefined);
  await withTransaction(async (client) => {
    if (columns.length) {
      await client.query(
        `UPDATE users SET ${columns.map((c, i) => `${c} = $${i + 2}`).join(', ')} WHERE id = $1`,
        [req.user.id, ...columns.map((c) => fields[c])],
      );
    }
    if (interests) await replaceInterests(client, req.user.id, interests);
  });
  res.json(await loadMe(req.user.id));
});

async function replaceInterests(client, userId, names) {
  const ids = [];
  for (const name of names) {
    // Reuse an existing interest regardless of capitalisation.
    const { rows: [row] } = await client.query(
      `INSERT INTO interests (name) VALUES ($1)
       ON CONFLICT ((lower(name))) DO UPDATE SET name = interests.name
       RETURNING id`,
      [name],
    );
    ids.push(row.id);
  }
  await client.query('DELETE FROM user_interests WHERE user_id = $1 AND NOT (interest_id = ANY($2))', [userId, ids]);
  // Existing interests keep their original added_at (so "top 2" stays stable); new ones go last, in order.
  await client.query(
    `INSERT INTO user_interests (user_id, interest_id, added_at)
     SELECT $1, t.id, clock_timestamp() + t.ord * interval '1 millisecond'
     FROM unnest($2::bigint[]) WITH ORDINALITY AS t(id, ord)
     ON CONFLICT (user_id, interest_id) DO NOTHING`,
    [userId, ids],
  );
}

router.patch('/me/active-group', async (req, res) => {
  const groupId = parseId(req.body.groupId, 'groupId');
  const { rows } = await query(
    `UPDATE users SET active_group_id = $2
     WHERE id = $1 AND EXISTS (SELECT 1 FROM group_memberships WHERE user_id = $1 AND group_id = $2)
     RETURNING active_group_id`,
    [req.user.id, groupId],
  );
  if (!rows[0]) throw forbidden('NOT_A_MEMBER', 'You can only switch to a group you belong to.');
  res.json({ activeGroupId: rows[0].active_group_id });
});

// Photos are labeled placeholders in the prototype: adding one fills the next free slot (max 3).
router.post('/me/photos', async (req, res) => {
  const label = readText(req.body.label, 'Label', { max: 60 });
  const { rows: [photo] } = await query(
    `INSERT INTO user_photos (user_id, position, label)
     SELECT $1, p, coalesce($2, 'Photo ' || p)
     FROM generate_series(1, 3) AS p
     WHERE NOT EXISTS (SELECT 1 FROM user_photos WHERE user_id = $1 AND position = p)
     ORDER BY p LIMIT 1
     RETURNING id, position, label, image_url`,
    [req.user.id, label ?? null],
  );
  if (!photo) throw conflict('PHOTO_LIMIT', 'You can have at most 3 photos.');
  res.status(201).json({ photo: { id: photo.id, position: photo.position, label: photo.label, imageUrl: photo.image_url } });
});

router.delete('/me/photos/:id', async (req, res) => {
  const photoId = parseId(req.params.id, 'photo id');
  const { rows: [counts] } = await query(
    `SELECT count(*) AS total, count(*) FILTER (WHERE id = $2) AS mine
     FROM user_photos WHERE user_id = $1`,
    [req.user.id, photoId],
  );
  if (!counts.mine) throw notFound('PHOTO_NOT_FOUND', 'That photo does not exist.');
  if (counts.total <= 1) throw conflict('PHOTO_REQUIRED', 'Keep at least one photo on your profile.');
  await query('DELETE FROM user_photos WHERE id = $1 AND user_id = $2', [photoId, req.user.id]);
  res.status(204).end();
});

// Friends, for "Invite friends".
router.get('/me/friends', async (req, res) => {
  const { rows } = await query(
    `SELECT u.id, u.first_name, u.last_name, u.avatar_color,
            ARRAY(SELECT group_id FROM group_memberships WHERE user_id = u.id) AS group_ids
     FROM friendships f
     JOIN users u ON u.id = CASE WHEN f.user_low_id = $1 THEN f.user_high_id ELSE f.user_low_id END
     WHERE $1 IN (f.user_low_id, f.user_high_id)
     ORDER BY u.first_name, u.last_name`,
    [req.user.id],
  );
  res.json({
    friends: rows.map((u) => ({
      id: u.id,
      firstName: u.first_name,
      lastName: u.last_name,
      initials: userInitials(u.first_name, u.last_name),
      avatarColor: u.avatar_color,
      groupIds: u.group_ids,
    })),
  });
});

export default router;

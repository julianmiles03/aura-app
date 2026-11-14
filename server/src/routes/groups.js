import express, { Router } from 'express';
import { pool, query, withTransaction } from '../db.js';
import { badRequest, conflict, forbidden, notFound } from '../errors.js';
import {
  addMember, assertMember, createGroup, loadGroupCards, loadRelationshipStats, removeMembership,
} from '../lib/groups.js';
import { requireCompleteProfile } from '../lib/profile.js';
import { PHOTO_MAX_BYTES, PHOTO_TYPES, removePhoto, savePhoto } from '../lib/storage.js';
import { parseId, readText } from '../lib/validate.js';

const router = Router();

async function groupCard(groupId, viewer) {
  const [card] = await loadGroupCards(pool, [groupId], viewer);
  if (!card) throw notFound('GROUP_NOT_FOUND', 'That friend group does not exist.');
  return card;
}

router.post('/groups', async (req, res) => {
  await requireCompleteProfile(pool, req.user.id);
  const name = readText(req.body.name, 'Group name', { max: 60, required: true });
  const city = readText(req.body.city, 'City', { max: 80 }) ?? req.user.city;
  // The creator is the owner and starts acting as the new group.
  const groupId = await withTransaction((client) => createGroup(client, { name, city, ownerId: req.user.id, makeActive: true }));
  res.status(201).json({ group: await groupCard(groupId, { includeInviteCode: true }) });
});

// Join with an invite code. The group_member_cap trigger rejects an 11th member (409 GROUP_FULL).
router.post('/groups/join', async (req, res) => {
  await requireCompleteProfile(pool, req.user.id);
  // Codes are letters and numbers; spaces and dashes people type or paste ("SUMMIT 77") are ignored.
  const raw = typeof req.body.inviteCode === 'string' ? req.body.inviteCode.replace(/[\s-]/g, '') : req.body.inviteCode;
  const code = readText(raw, 'Invite code', { required: true }).toUpperCase();
  if (!/^[A-Z0-9]{4,12}$/.test(code)) {
    throw badRequest('INVALID_INVITE_CODE', 'Invite codes are 4 to 12 letters and numbers, like SUMMIT77. Check the code your friend sent.');
  }
  const { rows: [group] } = await query('SELECT id, name FROM friend_groups WHERE invite_code = $1', [code]);
  if (!group) {
    throw notFound('INVITE_NOT_FOUND', `No group has the invite code ${code}. Check it with your friend, or create your own group.`);
  }
  const { rows: [membership] } = await query(
    'SELECT 1 FROM group_memberships WHERE group_id = $1 AND user_id = $2',
    [group.id, req.user.id],
  );
  if (membership) {
    await query('UPDATE users SET active_group_id = $2 WHERE id = $1', [req.user.id, group.id]);
    return res.json({ group: await groupCard(group.id, { includeInviteCode: true }) });
  }
  await addMember(group, req.user.id);
  res.status(201).json({ group: await groupCard(group.id, { includeInviteCode: true }) });
});

router.get('/groups/:id', async (req, res) => {
  const groupId = parseId(req.params.id, 'group id');
  const viewerGroupId = req.user.active_group_id;
  const card = await groupCard(groupId, { viewerGroupId });
  const [stats] = viewerGroupId && viewerGroupId !== groupId
    ? await loadRelationshipStats(pool, viewerGroupId, [groupId])
    : [];
  res.json({ group: { ...card, stats: stats ?? null } });
});

router.get('/groups/:groupId/members/:userId/profile', async (req, res) => {
  const groupId = parseId(req.params.groupId, 'group id');
  const userId = parseId(req.params.userId, 'user id');
  const { rows: [profile] } = await query(
    `SELECT u.id, u.first_name, u.last_name, u.city, u.bio, u.age, u.gender,
            u.relationship_status, u.personality_traits, u.avatar_color,
            COALESCE((SELECT json_agg(json_build_object('id', p.id, 'label', p.label, 'imageUrl', p.image_url)
                      ORDER BY p.position) FROM user_photos p WHERE p.user_id = u.id), '[]') AS photos,
            COALESCE((SELECT array_agg(i.name ORDER BY i.name) FROM user_interests ui
                      JOIN interests i ON i.id = ui.interest_id WHERE ui.user_id = u.id), '{}') AS interests
     FROM users u JOIN group_memberships gm ON gm.user_id = u.id
     WHERE gm.group_id = $1 AND u.id = $2`,
    [groupId, userId],
  );
  if (!profile) throw notFound('MEMBER_NOT_FOUND', 'That group member could not be found.');
  res.json({ profile: {
    id: profile.id, firstName: profile.first_name, lastName: profile.last_name,
    city: profile.city, bio: profile.bio, age: profile.age, gender: profile.gender,
    relationshipStatus: profile.relationship_status, personalityTraits: profile.personality_traits,
    avatarColor: profile.avatar_color, photos: profile.photos, interests: profile.interests,
  } });
});

router.patch('/groups/:id', async (req, res) => {
  const groupId = parseId(req.params.id, 'group id');
  await assertMember(pool, groupId, req.user.id);
  // Name and city are both optional in the body, but can't be blanked when sent.
  const name = readText(req.body.name, 'Group name', { max: 60, required: 'name' in req.body });
  const city = readText(req.body.city, 'City', { max: 80, required: 'city' in req.body });
  await query(
    `UPDATE friend_groups
     SET name = coalesce($2, name), city = coalesce($3, city)
     WHERE id = $1`,
    [groupId, name ?? null, city ?? null],
  );
  res.json({ group: await groupCard(groupId, { includeInviteCode: true }) });
});

// A member adds a friend to the group.
router.post('/groups/:id/members', async (req, res) => {
  const groupId = parseId(req.params.id, 'group id');
  const userId = parseId(req.body.userId, 'userId');
  await assertMember(pool, groupId, req.user.id);
  const { rows: [user] } = await query('SELECT id FROM users WHERE id = $1', [userId]);
  if (!user) throw notFound('USER_NOT_FOUND', 'That person does not exist.');
  const { rows: [group] } = await query('SELECT id, name FROM friend_groups WHERE id = $1', [groupId]);
  await addMember(group, userId);
  res.status(201).json({ group: await groupCard(groupId, { includeInviteCode: true }) });
});

async function assertOwner(db, groupId, userId, message = 'Only the group owner can remove members.') {
  const { rows: [membership] } = await db.query(
    'SELECT role FROM group_memberships WHERE group_id = $1 AND user_id = $2',
    [groupId, userId],
  );
  if (!membership) throw notFound('GROUP_NOT_FOUND', 'That friend group does not exist.');
  if (membership.role !== 'owner') throw forbidden('OWNER_REQUIRED', message);
}

// Group photo: the owner uploads (or replaces) it. The body is the image itself, like profile photos.
// It's stored under groups/<group id>/ in the same bucket; a replaced photo's file is deleted.
router.put('/groups/:id/photo', express.raw({ type: Object.keys(PHOTO_TYPES), limit: PHOTO_MAX_BYTES }), async (req, res) => {
  const groupId = parseId(req.params.id, 'group id');
  await assertOwner(pool, groupId, req.user.id, 'Only the group owner can change the group photo.');
  const contentType = req.get('Content-Type')?.split(';')[0].trim().toLowerCase();
  if (!PHOTO_TYPES[contentType] || !Buffer.isBuffer(req.body) || req.body.length === 0) {
    throw badRequest('INVALID_PHOTO', 'Choose a JPEG, PNG or WebP image.');
  }
  const photoUrl = await savePhoto(`groups/${groupId}`, req.body, contentType);
  const { rows: [old] } = await query(
    `UPDATE friend_groups g SET photo_url = $2 FROM (SELECT photo_url FROM friend_groups WHERE id = $1) old
     WHERE g.id = $1 RETURNING old.photo_url`,
    [groupId, photoUrl],
  );
  await removePhoto(old?.photo_url);
  res.json({ group: await groupCard(groupId, { includeInviteCode: true }) });
});

router.delete('/groups/:id/photo', async (req, res) => {
  const groupId = parseId(req.params.id, 'group id');
  await assertOwner(pool, groupId, req.user.id, 'Only the group owner can change the group photo.');
  const { rows: [old] } = await query(
    `UPDATE friend_groups g SET photo_url = NULL FROM (SELECT photo_url FROM friend_groups WHERE id = $1) old
     WHERE g.id = $1 RETURNING old.photo_url`,
    [groupId],
  );
  await removePhoto(old?.photo_url);
  res.json({ group: await groupCard(groupId, { includeInviteCode: true }) });
});

router.delete('/groups/:id/members/me', async (req, res) => {
  const groupId = parseId(req.params.id, 'group id');
  await assertMember(pool, groupId, req.user.id);
  await withTransaction(async (client) => {
    // Leaves the group's chats too, switches the active group if needed, and hands over
    // ownership if the owner is the one leaving (lib/groups.js).
    await removeMembership(client, groupId, req.user.id);
    // The last member left: the empty group goes.
    await client.query(
      'DELETE FROM friend_groups g WHERE g.id = $1 AND NOT EXISTS (SELECT 1 FROM group_memberships WHERE group_id = g.id)',
      [groupId],
    );
  });
  res.status(204).end();
});

router.delete('/groups/:id/members/:userId', async (req, res) => {
  const groupId = parseId(req.params.id, 'group id');
  const userId = parseId(req.params.userId, 'user id');
  await assertOwner(pool, groupId, req.user.id);
  if (userId === req.user.id) throw conflict('OWNER_CANNOT_REMOVE_SELF', 'Use Leave group to leave your own group.');
  await withTransaction(async (client) => {
    if (!(await removeMembership(client, groupId, userId))) {
      throw notFound('MEMBER_NOT_FOUND', 'That person is not a member of this group.');
    }
  });
  res.json({ group: await groupCard(groupId, { includeInviteCode: true }) });
});

export default router;

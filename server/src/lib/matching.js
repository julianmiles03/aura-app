import { badRequest, conflict, notFound } from '../errors.js';

// Records one group's decision about another. When both groups have said
// "connect", creates the match, its chat and the chat's participants.
// Must run inside a transaction (pass the transaction's client).
export async function recordDecision(client, { fromGroupId, toGroupId, userId, decision }) {
  if (!['connect', 'pass'].includes(decision)) {
    throw badRequest('VALIDATION_ERROR', 'decision must be "connect" or "pass".');
  }
  if (fromGroupId === toGroupId) throw badRequest('SAME_GROUP', "A group can't like itself.");

  // Lock both groups (in id order, so two groups liking each other at once can't deadlock
  // or both miss the other's like).
  const { rows: groups } = await client.query(
    'SELECT id, name FROM friend_groups WHERE id = ANY($1) ORDER BY id FOR UPDATE',
    [[fromGroupId, toGroupId]],
  );
  if (groups.length < 2) throw notFound('GROUP_NOT_FOUND', 'That friend group does not exist.');
  const from = groups.find((g) => g.id === fromGroupId);
  const to = groups.find((g) => g.id === toGroupId);

  const { rows: own } = await client.query(
    'SELECT 1 FROM group_memberships WHERE group_id = $1 AND user_id = $2',
    [toGroupId, userId],
  );
  if (own.length) throw badRequest('OWN_GROUP', "You're in that group already.");

  const low = Math.min(fromGroupId, toGroupId);
  const high = Math.max(fromGroupId, toGroupId);
  const { rows: existing } = await client.query(
    'SELECT id FROM group_matches WHERE group_low_id = $1 AND group_high_id = $2',
    [low, high],
  );
  if (existing.length) throw conflict('ALREADY_MATCHED', `You've already matched with ${to.name}.`);

  const { rows: [like] } = await client.query(
    `INSERT INTO group_likes (from_group_id, to_group_id, liked_by_user_id, decision)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (from_group_id, to_group_id) DO NOTHING
     RETURNING id, from_group_id, to_group_id, decision, created_at`,
    [fromGroupId, toGroupId, userId, decision],
  );
  if (!like) throw conflict('ALREADY_DECIDED', `${from.name} already responded to ${to.name}.`);

  const result = { like, match: null, chatId: null };
  if (decision !== 'connect') return result;

  const { rows: reciprocal } = await client.query(
    `SELECT id FROM group_likes WHERE from_group_id = $1 AND to_group_id = $2 AND decision = 'connect'`,
    [toGroupId, fromGroupId],
  );
  if (!reciprocal.length) return result;

  const { rows: [match] } = await client.query(
    'INSERT INTO group_matches (group_low_id, group_high_id) VALUES ($1, $2) RETURNING id, matched_at',
    [low, high],
  );
  const { rows: [chat] } = await client.query(
    'INSERT INTO chats (match_id, name) VALUES ($1, $2) RETURNING id',
    [match.id, `${from.name} + ${to.name}`],
  );
  // Everyone in both groups joins. Someone in both groups joins once, on the deciding group's side.
  // The chat_participant_cap trigger enforces the 30-person limit.
  await client.query(
    `INSERT INTO chat_participants (chat_id, user_id, group_id)
     SELECT DISTINCT ON (gm.user_id) $1::bigint, gm.user_id, gm.group_id
     FROM group_memberships gm
     WHERE gm.group_id IN ($2, $3)
     ORDER BY gm.user_id, (gm.group_id = $2) DESC`,
    [chat.id, fromGroupId, toGroupId],
  );
  return { ...result, match, chatId: chat.id };
}

import crypto from 'node:crypto';
import { withTransaction } from '../db.js';
import { conflict, forbidden, notFound } from '../errors.js';
import { groupInitials, MAIN_PHOTO_SQL, randomPastel, userInitials } from './format.js';

// The most people a Friend Group can have. The database enforces it (trigger group_member_cap,
// which the API turns into 409 GROUP_FULL); this copy is for the numbers the API returns.
export const MAX_MEMBERS = 10;

export async function assertMember(db, groupId, userId) {
  const { rows } = await db.query(
    `SELECT g.id, EXISTS (SELECT 1 FROM group_memberships m WHERE m.group_id = g.id AND m.user_id = $2) AS is_member
     FROM friend_groups g WHERE g.id = $1`,
    [groupId, userId],
  );
  if (!rows[0]) throw notFound('GROUP_NOT_FOUND', 'That friend group does not exist.');
  if (!rows[0].is_member) throw forbidden('NOT_A_MEMBER', 'You are not a member of that group.');
}

// Everything a group card shows: header, members with top 2 interests,
// and interests (flagged "shared" when the viewer group has them too).
export async function loadGroupCards(db, groupIds, { viewerGroupId = null, includeInviteCode = false } = {}) {
  if (!groupIds.length) return [];
  const [groups, members, interests] = await Promise.all([
    db.query(
      `SELECT g.id, g.name, g.city, g.photo_label, to_jsonb(g) ->> 'photo_url' AS photo_url, g.avatar_color, g.invite_code,
              (SELECT count(*) FROM group_memberships m WHERE m.group_id = g.id) AS member_count
       FROM friend_groups g WHERE g.id = ANY($1)`,
      [groupIds],
    ),
    db.query(
      `SELECT gm.group_id, gm.role, u.id, u.first_name, u.last_name, u.avatar_color,
              ARRAY(SELECT i.name FROM user_interests ui JOIN interests i ON i.id = ui.interest_id
                    WHERE ui.user_id = u.id ORDER BY ui.added_at, i.name LIMIT 2) AS top_interests,
              ${MAIN_PHOTO_SQL} AS photo_url
       FROM group_memberships gm JOIN users u ON u.id = gm.user_id
       WHERE gm.group_id = ANY($1)
       ORDER BY gm.joined_at, u.id`,
      [groupIds],
    ),
    db.query(
      `SELECT s.group_id, s.interest_id, s.interest_name, s.member_count, (v.interest_id IS NOT NULL) AS shared
       FROM group_shared_interests s
       LEFT JOIN group_shared_interests v ON v.group_id = $2::bigint AND v.interest_id = s.interest_id
       WHERE s.group_id = ANY($1)
       ORDER BY shared DESC, s.member_count DESC, s.interest_name`,
      [groupIds, viewerGroupId],
    ),
  ]);

  const byGroup = (rows) => {
    const map = new Map();
    for (const row of rows) map.set(row.group_id, [...(map.get(row.group_id) ?? []), row]);
    return map;
  };
  const membersBy = byGroup(members.rows);
  const interestsBy = byGroup(interests.rows);

  const cards = new Map(groups.rows.map((g) => [g.id, {
    id: g.id,
    name: g.name,
    initials: groupInitials(g.name),
    avatarColor: g.avatar_color,
    city: g.city,
    photoLabel: g.photo_label,
    photoUrl: g.photo_url, // the group photo, or null (read via to_jsonb so cards still load before migration 007 runs)
    ...(includeInviteCode && { inviteCode: g.invite_code }),
    memberCount: g.member_count,
    maxMembers: MAX_MEMBERS,
    isFull: g.member_count >= MAX_MEMBERS,
    members: (membersBy.get(g.id) ?? []).map((m) => ({
      id: m.id,
      firstName: m.first_name,
      lastName: m.last_name,
      initials: userInitials(m.first_name, m.last_name),
      avatarColor: m.avatar_color,
      role: m.role,
      topInterests: m.top_interests,
      photoUrl: m.photo_url, // their main photo, or null (seed photos are labels only)
    })),
    interests: (interestsBy.get(g.id) ?? []).map((i) => ({
      id: i.interest_id, name: i.interest_name, memberCount: i.member_count, shared: i.shared,
    })),
  }]));
  // Keep the caller's order (recommendations arrive ranked).
  return groupIds.map((id) => cards.get(id)).filter(Boolean);
}

// How each candidate group relates to the viewer group, ranked:
// (1) shared interests, (2) mutual friends: 1st-degree then 2nd-degree, (3) same city, then distance.
// A candidate member counts as a 1st-degree mutual friend if they're friends with anyone in the
// viewer group; 2nd-degree if they're a friend of one of those friends.
export async function loadRelationshipStats(db, viewerGroupId, candidateIds) {
  if (!candidateIds.length) return [];
  const { rows } = await db.query(
    `WITH viewer AS (SELECT id, city, latitude, longitude FROM friend_groups WHERE id = $1),
     viewer_members   AS (SELECT user_id FROM group_memberships WHERE group_id = $1),
     viewer_interests AS (SELECT interest_id FROM group_shared_interests WHERE group_id = $1),
     friend_edges AS (
       SELECT user_low_id AS a, user_high_id AS b FROM friendships
       UNION ALL
       SELECT user_high_id, user_low_id FROM friendships),
     first_degree  AS (SELECT DISTINCT e.b AS user_id FROM friend_edges e JOIN viewer_members vm ON vm.user_id = e.a),
     second_degree AS (SELECT DISTINCT e.b AS user_id FROM friend_edges e JOIN first_degree f ON f.user_id = e.a)
     SELECT c.id AS group_id,
       (SELECT count(*) FROM group_shared_interests s
         WHERE s.group_id = c.id AND s.interest_id IN (SELECT interest_id FROM viewer_interests)) AS shared_interest_count,
       (SELECT count(*) FROM group_memberships m
         WHERE m.group_id = c.id
           AND m.user_id IN (SELECT user_id FROM first_degree)
           AND m.user_id NOT IN (SELECT user_id FROM viewer_members)) AS mutual_friends,
       (SELECT count(*) FROM group_memberships m
         WHERE m.group_id = c.id
           AND m.user_id IN (SELECT user_id FROM second_degree)
           AND m.user_id NOT IN (SELECT user_id FROM first_degree)
           AND m.user_id NOT IN (SELECT user_id FROM viewer_members)) AS second_degree_friends,
       (c.city = v.city) AS same_city,
       round((3958.8 * 2 * asin(sqrt(
         power(sin(radians(c.latitude - v.latitude) / 2), 2) +
         cos(radians(v.latitude)) * cos(radians(c.latitude)) *
         power(sin(radians(c.longitude - v.longitude) / 2), 2))))::numeric, 1) AS distance_miles,
       EXISTS (SELECT 1 FROM group_likes l
               WHERE l.from_group_id = c.id AND l.to_group_id = $1 AND l.decision = 'connect') AS likes_you
     FROM friend_groups c CROSS JOIN viewer v
     WHERE c.id = ANY($2)
     ORDER BY shared_interest_count DESC, mutual_friends DESC, second_degree_friends DESC,
              same_city DESC, distance_miles ASC NULLS LAST, c.id`,
    [viewerGroupId, candidateIds],
  );
  return rows.map((r) => ({
    groupId: r.group_id,
    sharedInterestCount: r.shared_interest_count,
    mutualFriends: r.mutual_friends,
    secondDegreeFriends: r.second_degree_friends,
    sameCity: r.same_city,
    distanceMiles: r.distance_miles,
    likesYou: r.likes_you,
  }));
}

// ---------------------------------------------------------------------------
// Changing who's in a group. The app (routes/groups.js) and the admin portal's Maintain Groups
// (routes/adminGroups.js) both go through these, so a group follows the same rules either way:
// at most 10 members, one owner, members sit in the group's match chats, and everyone in a group
// has an active group.
// ---------------------------------------------------------------------------

// Creates a group with its owner as the first member, inside the caller's transaction, and returns
// its id. In the app the creator starts acting as the new group (makeActive: true); when an admin
// creates a group for someone, it only becomes their active group if they had none.
export async function createGroup(client, { name, city, ownerId, makeActive }) {
  const inviteCode = crypto.randomBytes(8).toString('hex').slice(0, 12).toUpperCase();
  const { rows: [group] } = await client.query(
    `INSERT INTO friend_groups (name, city, invite_code, avatar_color, created_by)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [name, city, inviteCode, randomPastel(), ownerId],
  );
  await client.query(
    `INSERT INTO group_memberships (group_id, user_id, role) VALUES ($1, $2, 'owner')`,
    [group.id, ownerId],
  );
  await client.query(
    `UPDATE users SET active_group_id = $2 WHERE id = $1${makeActive ? '' : ' AND active_group_id IS NULL'}`,
    [ownerId, group.id],
  );
  return group.id;
}

// Adds someone to a group (its own transaction). An 11th member is stopped by the database
// trigger (409 GROUP_FULL); someone already in the group gets 409 ALREADY_MEMBER.
export async function addMember(group, userId) {
  await withTransaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO group_memberships (group_id, user_id) VALUES ($1, $2)
       ON CONFLICT (group_id, user_id) DO NOTHING RETURNING user_id`,
      [group.id, userId],
    );
    if (!rows.length) throw conflict('ALREADY_MEMBER', `Already a member of ${group.name}.`);
    // A match's chat holds both groups' members, so new members join the group's chats too
    // (skipping any chat that's already at the 30-person cap).
    await client.query(
      `INSERT INTO chat_participants (chat_id, user_id, group_id)
       SELECT c.id, $2, $1
       FROM chats c JOIN group_matches mt ON mt.id = c.match_id
       WHERE $1 IN (mt.group_low_id, mt.group_high_id)
         AND (SELECT count(*) FROM chat_participants x WHERE x.chat_id = c.id) < 30
       ON CONFLICT (chat_id, user_id) DO NOTHING`,
      [group.id, userId],
    );
    // Someone with no group yet gets this one as their active group.
    await client.query(
      'UPDATE users SET active_group_id = $2 WHERE id = $1 AND active_group_id IS NULL',
      [userId, group.id],
    );
  });
}

// Takes someone out of a group, inside the caller's transaction: their membership, their place in
// the group's match chats, and, if this was their active group, a switch to their oldest other
// group. If they were the owner, the longest-standing member becomes the owner, so someone can
// still manage the group. Returns false if they weren't a member. A group left with nobody in it
// is the caller's to delete (the app does; Maintain Groups doesn't let the last member go).
export async function removeMembership(client, groupId, userId) {
  const { rowCount } = await client.query(
    'DELETE FROM group_memberships WHERE group_id = $1 AND user_id = $2',
    [groupId, userId],
  );
  if (!rowCount) return false;
  await client.query('DELETE FROM chat_participants WHERE group_id = $1 AND user_id = $2', [groupId, userId]);
  // If this was their active group, the composite FK has just cleared active_group_id.
  await client.query(
    `UPDATE users SET active_group_id = (
       SELECT group_id FROM group_memberships WHERE user_id = $1 ORDER BY joined_at LIMIT 1)
     WHERE id = $1 AND active_group_id IS NULL`,
    [userId],
  );
  await client.query(
    `UPDATE group_memberships SET role = 'owner'
     WHERE group_id = $1
       AND NOT EXISTS (SELECT 1 FROM group_memberships WHERE group_id = $1 AND role = 'owner')
       AND user_id = (SELECT user_id FROM group_memberships WHERE group_id = $1 ORDER BY joined_at, user_id LIMIT 1)`,
    [groupId],
  );
  return true;
}

// Makes one member the owner, inside the caller's transaction. A group has one owner, so the
// previous owner stays on as a regular member. One UPDATE changes both rows at once.
export async function setOwner(client, groupId, userId) {
  const { rows: [membership] } = await client.query(
    'SELECT role FROM group_memberships WHERE group_id = $1 AND user_id = $2',
    [groupId, userId],
  );
  if (!membership) throw notFound('MEMBER_NOT_FOUND', 'That person is not a member of this group.');
  await client.query(
    `UPDATE group_memberships
     SET role = CASE WHEN user_id = $2 THEN 'owner'::group_role ELSE 'member'::group_role END
     WHERE group_id = $1 AND (user_id = $2 OR role = 'owner')`,
    [groupId, userId],
  );
}

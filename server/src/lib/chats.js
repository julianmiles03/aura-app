import { groupBadge } from './format.js';

const VIEW_FILTER = {
  inbox: 'cp.archived_at IS NULL AND cp.deleted_at IS NULL',
  archived: 'cp.archived_at IS NOT NULL AND cp.deleted_at IS NULL',
  deleted: 'cp.deleted_at IS NOT NULL',
  any: 'true',
};

// Chat-list rows for one user, seen from one of their groups (`myGroupId`).
export async function loadChatRows(db, userId, myGroupId, { view = 'inbox', chatIds = null } = {}) {
  const { rows } = await db.query(
    `SELECT c.id, c.created_at, cp.archived_at, cp.deleted_at,
            mine.id AS my_id, mine.name AS my_name, mine.avatar_color AS my_color,
            other.id AS other_id, other.name AS other_name, other.avatar_color AS other_color,
            (SELECT count(*) FROM chat_participants x WHERE x.chat_id = c.id) AS people_count,
            (SELECT count(*) FROM messages m
              WHERE m.chat_id = c.id AND m.created_at > cp.last_read_at
                AND m.sender_user_id IS DISTINCT FROM $1) AS unread_count,
            lm.body AS last_body, lm.created_at AS last_at, lm.sender_user_id AS last_sender_id,
            su.first_name AS last_sender_first_name
     FROM chat_participants cp
     JOIN chats c           ON c.id = cp.chat_id
     JOIN group_matches gmt ON gmt.id = c.match_id
     JOIN friend_groups mine  ON mine.id = $2
     JOIN friend_groups other ON other.id = CASE WHEN gmt.group_low_id = $2 THEN gmt.group_high_id
                                                 ELSE gmt.group_low_id END
     LEFT JOIN LATERAL (
       SELECT body, created_at, sender_user_id FROM messages
       WHERE chat_id = c.id ORDER BY created_at DESC, id DESC LIMIT 1
     ) lm ON true
     LEFT JOIN users su ON su.id = lm.sender_user_id
     WHERE cp.user_id = $1
       AND $2 IN (gmt.group_low_id, gmt.group_high_id)
       AND ($3::bigint[] IS NULL OR c.id = ANY($3))
       AND ${VIEW_FILTER[view] ?? VIEW_FILTER.inbox}
     ORDER BY coalesce(lm.created_at, c.created_at) DESC, c.id DESC`,
    [userId, myGroupId, chatIds],
  );
  return rows.map((r) => ({
    id: r.id,
    name: `${r.my_name} + ${r.other_name}`,
    myGroup: groupBadge({ id: r.my_id, name: r.my_name, avatar_color: r.my_color }),
    otherGroup: groupBadge({ id: r.other_id, name: r.other_name, avatar_color: r.other_color }),
    peopleCount: r.people_count,
    unreadCount: r.unread_count,
    lastMessage: r.last_at
      ? {
          body: r.last_body,
          createdAt: r.last_at,
          senderId: r.last_sender_id,
          senderFirstName: r.last_sender_first_name,
          mine: r.last_sender_id === userId,
        }
      : null,
    lastActivityAt: r.last_at ?? r.created_at,
    createdAt: r.created_at,
    archived: Boolean(r.archived_at),
    deleted: Boolean(r.deleted_at),
  }));
}

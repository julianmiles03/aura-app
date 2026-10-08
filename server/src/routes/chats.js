import { Router } from 'express';
import { pool, query } from '../db.js';
import { badRequest, forbidden, notFound } from '../errors.js';
import { actingGroupId, requireGroup } from '../middleware/auth.js';
import { loadChatRows } from '../lib/chats.js';
import { userInitials } from '../lib/format.js';
import { parseId, readText } from '../lib/validate.js';

const router = Router();

// Chat list for the active group. ?view=inbox (default) | archived | deleted
router.get('/groups/:id/chats', requireGroup, async (req, res) => {
  const groupId = actingGroupId(req, req.params.id);
  const view = req.query.view ?? 'inbox';
  if (!['inbox', 'archived', 'deleted'].includes(view)) {
    throw badRequest('VALIDATION_ERROR', 'view must be inbox, archived or deleted.');
  }
  res.json({ groupId, view, chats: await loadChatRows(pool, req.user.id, groupId, { view }) });
});

async function participantGroup(chatId, userId) {
  const { rows: [row] } = await query(
    `SELECT c.id, cp.group_id FROM chats c
     LEFT JOIN chat_participants cp ON cp.chat_id = c.id AND cp.user_id = $2
     WHERE c.id = $1`,
    [chatId, userId],
  );
  if (!row) throw notFound('CHAT_NOT_FOUND', 'That chat does not exist.');
  if (!row.group_id) throw forbidden('NOT_IN_CHAT', "You're not in that chat.");
  return row.group_id;
}

const formatMessage = (m, userId) => ({
  id: m.id,
  body: m.body,
  createdAt: m.created_at,
  mine: m.sender_user_id === userId,
  sender: m.sender_user_id
    ? {
        id: m.sender_user_id,
        firstName: m.first_name,
        initials: userInitials(m.first_name, m.last_name),
        avatarColor: m.avatar_color,
      }
    : null,
});

// Opening a chat returns its latest 200 messages and marks it read.
router.get('/chats/:id/messages', requireGroup, async (req, res) => {
  const chatId = parseId(req.params.id, 'chat id');
  const myGroupId = await participantGroup(chatId, req.user.id);
  const [[chat], messages, participants] = await Promise.all([
    loadChatRows(pool, req.user.id, myGroupId, { chatIds: [chatId], view: 'any' }),
    query(
      `SELECT * FROM (
         SELECT m.id, m.body, m.created_at, m.sender_user_id, u.first_name, u.last_name, u.avatar_color
         FROM messages m LEFT JOIN users u ON u.id = m.sender_user_id
         WHERE m.chat_id = $1 ORDER BY m.created_at DESC, m.id DESC LIMIT 200) recent
       ORDER BY created_at, id`,
      [chatId],
    ),
    query(
      `SELECT u.id, u.first_name, u.last_name, u.avatar_color, cp.group_id
       FROM chat_participants cp JOIN users u ON u.id = cp.user_id
       WHERE cp.chat_id = $1 ORDER BY cp.group_id = $2 DESC, u.first_name`,
      [chatId, myGroupId],
    ),
  ]);
  await query('UPDATE chat_participants SET last_read_at = now() WHERE chat_id = $1 AND user_id = $2', [chatId, req.user.id]);
  res.json({
    chat: { ...chat, unreadCount: 0 },
    participants: participants.rows.map((p) => ({
      id: p.id,
      firstName: p.first_name,
      lastName: p.last_name,
      initials: userInitials(p.first_name, p.last_name),
      avatarColor: p.avatar_color,
      groupId: p.group_id,
    })),
    messages: messages.rows.map((m) => formatMessage(m, req.user.id)),
  });
});

router.post('/chats/:id/messages', requireGroup, async (req, res) => {
  const chatId = parseId(req.params.id, 'chat id');
  const body = readText(req.body.body, 'Message', { max: 2000, required: true });
  await participantGroup(chatId, req.user.id);
  const { rows: [m] } = await query(
    `WITH inserted AS (
       INSERT INTO messages (chat_id, sender_user_id, body) VALUES ($1, $2, $3)
       RETURNING id, body, created_at, sender_user_id)
     SELECT i.*, u.first_name, u.last_name, u.avatar_color
     FROM inserted i JOIN users u ON u.id = i.sender_user_id`,
    [chatId, req.user.id, body],
  );
  await query('UPDATE chat_participants SET last_read_at = now() WHERE chat_id = $1 AND user_id = $2', [chatId, req.user.id]);
  res.status(201).json({ message: formatMessage(m, req.user.id) });
});

// Select all / Archive / Recently deleted. Flags are per person, so archiving
// a chat only hides it for you.
const BULK_ACTIONS = {
  archive: 'archived_at = now()',
  unarchive: 'archived_at = NULL',
  delete: 'deleted_at = now()',
  restore: 'deleted_at = NULL',
};

router.post('/chats/bulk', requireGroup, async (req, res) => {
  const { action, chatIds } = req.body;
  if (!BULK_ACTIONS[action]) throw badRequest('VALIDATION_ERROR', `action must be one of: ${Object.keys(BULK_ACTIONS).join(', ')}.`);
  if (!Array.isArray(chatIds) || !chatIds.length || chatIds.length > 100) {
    throw badRequest('VALIDATION_ERROR', 'chatIds must be a list of 1 to 100 chat ids.');
  }
  const ids = chatIds.map((id) => parseId(id, 'chat id'));
  const { rows } = await query(
    `UPDATE chat_participants SET ${BULK_ACTIONS[action]}
     WHERE user_id = $1 AND chat_id = ANY($2) RETURNING chat_id`,
    [req.user.id, ids],
  );
  res.json({ action, updatedChatIds: rows.map((r) => r.chat_id) });
});

export default router;

// Maintain Meetups, in the admin portal: create, list, edit and delete rows in `meetups` ("We met up!").
// routes/admin.js mounts this router after requireAdminSession, so every route here needs a signed-in
// admin (401 ADMIN_SIGNED_OUT otherwise).
//
// A meetup says two matched groups met in person. The rules are the app's (POST /api/chats/:id/meetup):
//   - one meetup per match: the match row is locked while checking, so two creates can't both add one
//     (409 MEETUP_EXISTS)
//   - "confirmed by" is someone in that match's chat, or nobody recorded
//   - its created_at is the date both groups see in the chat ("You met up on Nov 12")
// Meetups are what KR4 counts (okr_metrics), so adding or deleting one moves the OKR Dashboard.
import { Router } from 'express';
import { query, withTransaction } from '../db.js';
import { ApiError, conflict, notFound } from '../errors.js';
import { groupInitials } from '../lib/format.js';
import { parseId } from '../lib/validate.js';

const router = Router();

const meetupNotFound = () => notFound('MEETUP_NOT_FOUND', "That meetup doesn't exist (it may have been deleted).");

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------
// The admin picks a day ("2026-11-12"), not a time. It's saved at noon UTC, which is the same
// calendar day from UTC-11 to UTC+11, so the chat shows the day that was picked.
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const isRealDay = (s) => DAY.test(s) && new Date(`${s}T00:00:00Z`).toISOString().startsWith(s);
const noonUtc = (day) => `${day}T12:00:00Z`;
const dayOf = (date) => new Date(date).toISOString().slice(0, 10);
const shiftDays = (day, n) => dayOf(new Date(`${day}T00:00:00Z`).getTime() + n * 86400000);
// "Not in the future" has to allow for time zones: it's already tomorrow in Kiribati (UTC+14).
const latestToday = () => dayOf(Date.now() + 14 * 3600000);
const pretty = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const prettyDay = (day) => pretty.format(new Date(`${day}T12:00:00Z`));

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------
const GROUP_COLUMNS = (alias, prefix) => `${alias}.id AS ${prefix}_id, ${alias}.name AS ${prefix}_name,
  ${alias}.avatar_color AS ${prefix}_color, to_jsonb(${alias}) ->> 'photo_url' AS ${prefix}_photo`;
const groupJson = (r, prefix) => ({
  id: r[`${prefix}_id`],
  name: r[`${prefix}_name`],
  initials: groupInitials(r[`${prefix}_name`]),
  avatarColor: r[`${prefix}_color`],
  photoUrl: r[`${prefix}_photo`],
});

const SELECT_MEETUPS = `
  SELECT mu.id, mu.match_id, mu.created_at AS met_at, mt.matched_at,
         ${GROUP_COLUMNS('gl', 'low')}, ${GROUP_COLUMNS('gh', 'high')},
         u.id AS by_id, u.first_name AS by_first_name, u.last_name AS by_last_name
  FROM meetups mu
  JOIN group_matches mt ON mt.id = mu.match_id
  JOIN friend_groups gl ON gl.id = mt.group_low_id
  JOIN friend_groups gh ON gh.id = mt.group_high_id
  LEFT JOIN users u ON u.id = mu.confirmed_by_user_id`;
const meetupJson = (r) => ({
  id: r.id,
  matchId: r.match_id,
  metAt: r.met_at,
  matchedAt: r.matched_at,
  groups: [groupJson(r, 'low'), groupJson(r, 'high')],
  confirmedBy: r.by_id ? { id: r.by_id, firstName: r.by_first_name, lastName: r.by_last_name } : null,
});
async function loadMeetup(id) {
  const { rows: [row] } = await query(`${SELECT_MEETUPS} WHERE mu.id = $1`, [id]);
  if (!row) throw meetupNotFound();
  return meetupJson(row);
}

// Every meetup, newest first: { meetups: [...] }.
router.get('/admin/meetups', async (req, res) => {
  const { rows } = await query(`${SELECT_MEETUPS} ORDER BY mu.created_at DESC, mu.id DESC`);
  res.json({ meetups: rows.map(meetupJson) });
});

// Every match, for the form: which ones already have a meetup, and who's in each match's chat (the
// people who can be "confirmed by"). Defined before /:id so "matches" isn't read as an id.
router.get('/admin/meetups/matches', async (req, res) => {
  const { rows: matches } = await query(
    `SELECT mt.id, mt.matched_at, ${GROUP_COLUMNS('gl', 'low')}, ${GROUP_COLUMNS('gh', 'high')},
            EXISTS (SELECT 1 FROM meetups WHERE match_id = mt.id) AS has_meetup
     FROM group_matches mt
     JOIN friend_groups gl ON gl.id = mt.group_low_id
     JOIN friend_groups gh ON gh.id = mt.group_high_id
     ORDER BY mt.matched_at DESC, mt.id DESC`,
  );
  const { rows: people } = await query(
    `SELECT c.match_id, u.id, u.first_name, u.last_name, g.name AS group_name
     FROM chat_participants cp
     JOIN chats c ON c.id = cp.chat_id
     JOIN users u ON u.id = cp.user_id
     JOIN friend_groups g ON g.id = cp.group_id
     ORDER BY lower(g.name), lower(u.first_name), lower(u.last_name)`,
  );
  res.json({
    matches: matches.map((m) => ({
      id: m.id,
      matchedAt: m.matched_at,
      hasMeetup: m.has_meetup,
      groups: [groupJson(m, 'low'), groupJson(m, 'high')],
      people: people.filter((p) => p.match_id === m.id)
        .map((p) => ({ id: p.id, firstName: p.first_name, lastName: p.last_name, groupName: p.group_name })),
    })),
  });
});

router.get('/admin/meetups/:id', async (req, res) => {
  res.json({ meetup: await loadMeetup(parseId(req.params.id, 'meetup id')) });
});

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------
// Checks metOn and confirmedByUserId against their match, collecting every problem so the form can
// mark them all at once: 400 VALIDATION_ERROR with details.fields, like Maintain Users.
//   metOn: a real day, not in the future, and not before the two groups matched
//   confirmedByUserId: someone in the match's chat, or null for "not recorded"
async function readMeetupFields(db, body, match, { partial }) {
  const errors = {};
  const out = {};
  if (!partial || 'metOn' in body) {
    const day = typeof body.metOn === 'string' ? body.metOn.trim() : '';
    const earliest = shiftDays(dayOf(match.matched_at), -1); // a day of slack for time zones
    if (!day) errors.metOn = 'Choose the day they met up.';
    else if (!isRealDay(day)) errors.metOn = 'Enter a real date, like 2026-11-12.';
    else if (day > latestToday()) errors.metOn = "The meetup can't be in the future.";
    else if (day < earliest) errors.metOn = `They matched on ${prettyDay(dayOf(match.matched_at))}, so they can't have met up before that.`;
    else out.created_at = noonUtc(day);
  }
  if (!partial || 'confirmedByUserId' in body) {
    const raw = body.confirmedByUserId;
    if (raw === null || raw === undefined || raw === '') out.confirmed_by_user_id = null;
    else {
      const userId = Number(raw);
      const { rows: [inChat] } = Number.isSafeInteger(userId) && userId > 0
        ? await db.query(
          'SELECT 1 FROM chat_participants cp JOIN chats c ON c.id = cp.chat_id WHERE c.match_id = $1 AND cp.user_id = $2',
          [match.id, userId],
        )
        : { rows: [] };
      if (inChat) out.confirmed_by_user_id = userId;
      else errors.confirmedByUserId = "Choose someone from the two groups' chat, or “Not recorded”.";
    }
  }
  const problems = Object.keys(errors);
  if (problems.length) {
    throw new ApiError(400, 'VALIDATION_ERROR', problems.length === 1 ? errors[problems[0]] : `Fix the ${problems.length} highlighted fields.`, { fields: errors });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Create, edit, delete
// ---------------------------------------------------------------------------
// Create: { matchId, metOn: "YYYY-MM-DD", confirmedByUserId? } -> 201 { meetup }.
router.post('/admin/meetups', async (req, res) => {
  if (req.body.matchId === undefined || req.body.matchId === null || req.body.matchId === '') {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Choose which two groups met up.', { fields: { matchId: 'Choose which two groups met up.' } });
  }
  const matchId = parseId(req.body.matchId, 'matchId');
  const id = await withTransaction(async (db) => {
    // Locking the match row, as the app does, means two creates at once can't both add a meetup.
    const { rows: [match] } = await db.query('SELECT id, matched_at FROM group_matches WHERE id = $1 FOR UPDATE', [matchId]);
    if (!match) throw notFound('MATCH_NOT_FOUND', "Those two groups aren't matched anymore.");
    const { rows: [existing] } = await db.query('SELECT 1 FROM meetups WHERE match_id = $1', [matchId]);
    if (existing) {
      const message = 'Those two groups already have a meetup. Edit that one instead.';
      throw conflict('MEETUP_EXISTS', message, { fields: { matchId: message } });
    }
    const f = await readMeetupFields(db, req.body, match, { partial: false });
    const { rows: [row] } = await db.query(
      'INSERT INTO meetups (match_id, confirmed_by_user_id, created_at) VALUES ($1, $2, $3) RETURNING id',
      [matchId, f.confirmed_by_user_id, f.created_at],
    );
    return row.id;
  });
  res.status(201).json({ meetup: await loadMeetup(id) });
});

// Edit the day and/or who confirmed it: { metOn?, confirmedByUserId? }. Which match it's for doesn't
// change; delete it and add one for the other match instead.
router.patch('/admin/meetups/:id', async (req, res) => {
  const id = parseId(req.params.id, 'meetup id');
  await withTransaction(async (db) => {
    const { rows: [m] } = await db.query(
      `SELECT mt.id, mt.matched_at FROM meetups mu JOIN group_matches mt ON mt.id = mu.match_id
       WHERE mu.id = $1 FOR UPDATE OF mu`,
      [id],
    );
    if (!m) throw meetupNotFound();
    const f = await readMeetupFields(db, req.body, m, { partial: true });
    const columns = Object.keys(f);
    if (columns.length) {
      await db.query(
        `UPDATE meetups SET ${columns.map((c, i) => `${c} = $${i + 2}`).join(', ')} WHERE id = $1`,
        [id, ...columns.map((c) => f[c])],
      );
    }
  });
  res.json({ meetup: await loadMeetup(id) });
});

// Delete: KR4 stops counting it, and both groups see "We met up!" in their chat again.
router.delete('/admin/meetups/:id', async (req, res) => {
  const { rowCount } = await query('DELETE FROM meetups WHERE id = $1', [parseId(req.params.id, 'meetup id')]);
  if (!rowCount) throw meetupNotFound();
  res.sendStatus(204);
});

export default router;

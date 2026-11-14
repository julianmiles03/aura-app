// End-to-end check of Maintain Meetups (admin portal) against the running API and the database:
//   1. without an admin session, the meetup routes answer 401 and change nothing
//   2. create checks every field at once (no match, no day, a future day, a day before the match,
//      someone who isn't in the match's chat) and saves nothing
//   3. create for a match without a meetup, then a second one for the same match -> 409 MEETUP_EXISTS
//   4. edit the day and "confirmed by" (and edit's checks); the KR4 count goes up and back down
//   5. delete, and two creates at the same moment leave exactly one
// Usage: npm run dev (in another terminal), then npm run verify:admin-meetups
// It needs a match that has no meetup yet. It adds a meetup for it and deletes it again, so the data
// ends up as it was, but KR4 on the OKR Dashboard goes up for a few seconds: ask the team before
// running it on the shared database.
import pg from 'pg';
import { call, check, code, fields, finish, preflight, signIn, signOut } from './lib/admin-client.js';

await preflight();
const db = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const meetupCount = async () => (await db.query('SELECT count(*)::int AS n FROM meetups')).rows[0].n;
const kr4 = async () => (await db.query('SELECT meetup_groups::int AS n FROM okr_metrics')).rows[0].n;
const day = (offsetDays) => new Date(Date.now() + offsetDays * 86400000).toISOString().slice(0, 10);
let created = null;

try {
  await db.connect();

  // 1. No session.
  for (const [method, path] of [['GET', '/admin/meetups'], ['GET', '/admin/meetups/matches'], ['POST', '/admin/meetups'], ['PATCH', '/admin/meetups/1'], ['DELETE', '/admin/meetups/1']]) {
    const r = await call(path, { method, body: ['POST', 'PATCH'].includes(method) ? { matchId: 1, metOn: day(0) } : undefined, signedIn: false });
    check(`${method} ${path} without a session -> 401`, r.status === 401 && code(r) === 'ADMIN_SIGNED_OUT', `${r.status} ${code(r)}`);
  }
  await signIn();
  const before = await meetupCount();
  const kr4Before = await kr4();

  const { matches } = (await call('/admin/meetups/matches')).body;
  const open = matches.find((m) => !m.hasMeetup);
  if (!open) throw new Error('Every match already has a meetup, so there is nothing to add one to. Run this where some match has none.');
  check('GET /admin/meetups/matches lists matches with who can confirm', open.groups.length === 2 && Array.isArray(open.people));
  const confirmer = open.people[0] ?? null;
  const { rows: [outsider] } = await db.query(
    `SELECT u.id::int AS id FROM users u WHERE NOT EXISTS (
       SELECT 1 FROM chat_participants cp JOIN chats c ON c.id = cp.chat_id WHERE c.match_id = $1 AND cp.user_id = u.id)
     ORDER BY u.id LIMIT 1`,
    [open.id],
  );
  const { rows: [{ matched }] } = await db.query("SELECT to_char(matched_at AT TIME ZONE 'UTC' - interval '3 days', 'YYYY-MM-DD') AS matched FROM group_matches WHERE id = $1", [open.id]);

  // 2. Validation.
  const none = await call('/admin/meetups', { method: 'POST', body: {} });
  check('create with no match -> 400 naming matchId', none.status === 400 && !!fields(none).matchId);
  const bad = await call('/admin/meetups', { method: 'POST', body: { matchId: open.id, metOn: day(3), confirmedByUserId: outsider?.id ?? 99999999 } });
  check('a future day and someone outside the chat -> 400 naming both', bad.status === 400 && fields(bad).metOn?.includes('future')
    && !!fields(bad).confirmedByUserId, JSON.stringify(fields(bad)));
  const early = await call('/admin/meetups', { method: 'POST', body: { matchId: open.id, metOn: matched } });
  check('a day before they matched -> 400 "can\'t have met up before that"', early.status === 400 && fields(early).metOn?.includes('before'));
  const notDay = await call('/admin/meetups', { method: 'POST', body: { matchId: open.id, metOn: '2026-02-30' } });
  check('a date that doesn\'t exist -> 400', notDay.status === 400 && !!fields(notDay).metOn);
  const ghost = await call('/admin/meetups', { method: 'POST', body: { matchId: 99999999, metOn: day(0) } });
  check('a match that doesn\'t exist -> 404', ghost.status === 404 && code(ghost) === 'MATCH_NOT_FOUND');
  check('...and none of those saved anything', (await meetupCount()) === before);

  // 3. Create, then a second for the same match.
  const made = await call('/admin/meetups', { method: 'POST', body: { matchId: open.id, metOn: day(-1), confirmedByUserId: confirmer?.id ?? null } });
  created = made.body?.meetup;
  check('create -> 201 for that match, on that day', made.status === 201 && created.matchId === open.id && created.metAt.startsWith(day(-1))
    && (confirmer ? created.confirmedBy?.id === confirmer.id : created.confirmedBy === null), String(made.status));
  check('...KR4 counts it (both groups)', (await kr4()) >= kr4Before + 1, `${kr4Before} -> ${await kr4()}`);
  const second = await call('/admin/meetups', { method: 'POST', body: { matchId: open.id, metOn: day(0) } });
  check('a second meetup for the same match -> 409 MEETUP_EXISTS', second.status === 409 && code(second) === 'MEETUP_EXISTS');
  check('...still one meetup for that match', (await db.query('SELECT count(*)::int AS n FROM meetups WHERE match_id = $1', [open.id])).rows[0].n === 1);
  const list = await call('/admin/meetups');
  check('GET /admin/meetups lists it with both groups', list.body.meetups.some((m) => m.id === created.id && m.groups.length === 2));

  // 4. Edit.
  const edit = await call(`/admin/meetups/${created.id}`, { method: 'PATCH', body: { metOn: day(0), confirmedByUserId: null } });
  check('edit the day and clear "confirmed by" -> 200', edit.status === 200 && edit.body.meetup.metAt.startsWith(day(0)) && edit.body.meetup.confirmedBy === null);
  const badEdit = await call(`/admin/meetups/${created.id}`, { method: 'PATCH', body: { metOn: 'soon' } });
  check('edit to a day that isn\'t a date -> 400, nothing changed', badEdit.status === 400 && !!fields(badEdit).metOn
    && (await call(`/admin/meetups/${created.id}`)).body.meetup.metAt.startsWith(day(0)));
  const missing = await call('/admin/meetups/99999999', { method: 'PATCH', body: { metOn: day(0) } });
  check('edit one that doesn\'t exist -> 404', missing.status === 404 && code(missing) === 'MEETUP_NOT_FOUND');

  // 5. Delete, then two creates at the same moment: the match-row lock lets exactly one through.
  const del = await call(`/admin/meetups/${created.id}`, { method: 'DELETE' });
  check('delete -> 204', del.status === 204, String(del.status));
  created = null;
  const race = await Promise.all([0, 1].map(() => call('/admin/meetups', { method: 'POST', body: { matchId: open.id, metOn: day(0) } })));
  const winner = race.find((r) => r.status === 201)?.body?.meetup;
  if (winner) created = winner;
  check('two creates at the same moment -> one 201 and one 409', race.map((r) => r.status).sort().join(',') === '201,409', race.map((r) => r.status).join(','));
  if (created) await call(`/admin/meetups/${created.id}`, { method: 'DELETE' });
  created = null;
  check('...meetups and KR4 are back where they started', (await meetupCount()) === before && (await kr4()) === kr4Before);
} catch (err) {
  check(`unexpected error: ${err.message}`, false);
} finally {
  if (created) await call(`/admin/meetups/${created.id}`, { method: 'DELETE' }).catch(() => {});
  await signOut();
  await db.end();
}
finish();

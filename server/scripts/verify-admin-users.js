// End-to-end check of Maintain Users (admin portal) against the running API and the database:
//   1. without an admin session, the user routes answer 401 and change nothing
//   2. add checks every field at once and names each problem (details.fields); nothing is saved
//   3. add, list, search, edit (and edit's checks), 404 for someone who doesn't exist
//   4. delete: their groups are handled like the app (owner hand-over, an emptied group deleted)
// Usage: npm run dev (in another terminal), then npm run verify:admin-users
// Needs ADMIN_EMAIL and ADMIN_PASSWORD in server/.env for an existing admin (npm run db:admin-account).
// It adds two test people ("Verify Users ...") and two test groups, puts one existing user who
// already has an active group into a test group for a few seconds, then deletes all of it. Others
// could see the test groups in Find meanwhile, so ask the team before running it on the shared database.
import pg from 'pg';
import '../src/env.js';

const API = `${process.env.API_URL ?? `http://localhost:${process.env.API_PORT || 4000}`}/api`;
const { ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
const results = [];
const check = (label, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` (${detail})` : ''}`);
};

let cookie = null;
async function call(path, { method = 'GET', body, signedIn = true } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      ...(body && { 'Content-Type': 'application/json' }),
      ...(signedIn && cookie && { Cookie: `aura_admin=${cookie}` }),
    },
    body: body && JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null, setCookie: res.headers.getSetCookie() };
}
const code = (r) => r.body?.error?.code;
const fields = (r) => r.body?.error?.details?.fields ?? {};

if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error('Set ADMIN_EMAIL and ADMIN_PASSWORD in server/.env for an admin account (npm run db:admin-account makes one).');
  process.exit(1);
}
// The checks talk to a running API. If there isn't one, say so instead of failing on the first request.
try {
  await fetch(`${API}/health`);
} catch {
  console.error(`Can't reach the API at ${API}. Start it with npm run dev in another terminal, then run this again.`);
  process.exit(1);
}

const db = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const userCount = async () => (await db.query('SELECT count(*)::int AS n FROM users')).rows[0].n;
const createdUsers = [];
const createdGroups = [];

try {
  await db.connect();
  const tag = `Verify ${Date.now().toString(36)}`;

  // 1. No session.
  for (const [method, path] of [['GET', '/admin/users'], ['POST', '/admin/users'], ['PATCH', '/admin/users/1'], ['DELETE', '/admin/users/1']]) {
    const r = await call(path, { method, body: ['POST', 'PATCH'].includes(method) ? { firstName: tag, lastName: 'X', city: 'Y' } : undefined, signedIn: false });
    check(`${method} ${path} without a session -> 401`, r.status === 401 && code(r) === 'ADMIN_SIGNED_OUT', `${r.status} ${code(r)}`);
  }
  check('...and user 1 is untouched', (await db.query('SELECT first_name FROM users WHERE id = 1')).rows[0]?.first_name !== tag);

  const login = await call('/admin/login', { method: 'POST', body: { user_email: ADMIN_EMAIL, user_password: ADMIN_PASSWORD }, signedIn: false });
  cookie = login.setCookie.find((c) => c.startsWith('aura_admin='))?.match(/^aura_admin=([^;]+)/)?.[1];
  check('admin signs in', login.status === 200 && !!cookie, String(login.status));

  // 2. Validation: every problem at once, nothing saved.
  const before = await userCount();
  const empty = await call('/admin/users', { method: 'POST', body: {} });
  check('add with nothing -> 400 naming first name, last name and city', empty.status === 400 && code(empty) === 'VALIDATION_ERROR'
    && ['firstName', 'lastName', 'city'].every((f) => fields(empty)[f]), Object.keys(fields(empty)).join(','));
  check('...with a plain message', empty.body?.error?.message === 'Fix the 3 highlighted fields.', empty.body?.error?.message);
  const bad = await call('/admin/users', { method: 'POST', body: {
    firstName: 'x'.repeat(51), lastName: '   ', city: 'Provo, UT', age: 17, bio: 'b'.repeat(501), relationshipStatus: 'dating',
  } });
  const f = fields(bad);
  check('too long, blank, too young, bio too long, unknown status -> each named', bad.status === 400
    && f.firstName?.includes('50') && f.lastName && f.age?.includes('18') && f.bio?.includes('500') && f.relationshipStatus, JSON.stringify(f));
  const word = await call('/admin/users', { method: 'POST', body: { firstName: 'A', lastName: 'B', city: 'C', age: 'twenty' } });
  check('age that isn\'t a number -> named', word.status === 400 && !!fields(word).age);
  check('...and none of those saved anyone', (await userCount()) === before);

  // 3. Add, list, search, edit.
  const add = await call('/admin/users', { method: 'POST', body: {
    firstName: `  ${tag}  `, lastName: 'Person', city: 'Provo, UT', age: '23', gender: 'Female', relationshipStatus: 'single', bio: '  Likes hikes.  ',
  } });
  const u = add.body?.user;
  if (u) createdUsers.push(u.id);
  check('add -> 201, trimmed, no login, no groups', add.status === 201 && u.firstName === tag && u.age === 23 && u.bio === 'Likes hikes.'
    && u.hasLogin === false && u.groupCount === 0, String(add.status));
  check('...and it\'s in the database', (await db.query('SELECT city FROM users WHERE id = $1', [u.id])).rows[0]?.city === 'Provo, UT');
  const list = await call('/admin/users?limit=500');
  check('GET /admin/users?limit=500 lists everyone, including them', list.body.users.length === (await userCount()) && list.body.users.some((x) => x.id === u.id));
  const search = await call(`/admin/users?q=${encodeURIComponent(tag)}`);
  check('search by name finds them', search.body.users.length === 1 && search.body.users[0].id === u.id);
  const edit = await call(`/admin/users/${u.id}`, { method: 'PATCH', body: { city: 'Orem, UT', age: '' } });
  check('edit city and clear age -> 200', edit.status === 200 && edit.body.user.city === 'Orem, UT' && edit.body.user.age === null);
  check('...other fields unchanged', edit.body.user.firstName === tag && edit.body.user.relationshipStatus === 'single');
  const blank = await call(`/admin/users/${u.id}`, { method: 'PATCH', body: { firstName: '', age: 121 } });
  check('edit to a blank name and age 121 -> 400 naming both', blank.status === 400 && fields(blank).firstName && fields(blank).age);
  check('...and nothing changed', (await db.query('SELECT first_name FROM users WHERE id = $1', [u.id])).rows[0].first_name === tag);
  const ghost = await call('/admin/users/99999999', { method: 'PATCH', body: { city: 'X' } });
  check('edit someone who doesn\'t exist -> 404', ghost.status === 404 && code(ghost) === 'USER_NOT_FOUND');

  // 4. Delete someone who owns two groups: one shared (ownership passes on), one only theirs (deleted).
  const { rows: [other] } = await db.query('SELECT id::int AS id, active_group_id::int AS active FROM users WHERE active_group_id IS NOT NULL ORDER BY id LIMIT 1');
  const shared = (await call('/admin/groups', { method: 'POST', body: { name: `${tag} shared`, city: 'Provo, UT', ownerUserId: u.id } })).body.group;
  const solo = (await call('/admin/groups', { method: 'POST', body: { name: `${tag} solo`, city: 'Provo, UT', ownerUserId: u.id } })).body.group;
  createdGroups.push(shared.id, solo.id);
  await call(`/admin/groups/${shared.id}/members`, { method: 'POST', body: { userId: other.id } });
  const detail = await call(`/admin/users/${u.id}`);
  const dShared = detail.body.user.groups.find((g) => g.id === shared.id);
  const dSolo = detail.body.user.groups.find((g) => g.id === solo.id);
  check('their details say who takes over and which group would be emptied', detail.body.user.groupCount === 2
    && dShared?.nextOwner && dSolo?.memberCount === 1 && dSolo.nextOwner === null);
  const del = await call(`/admin/users/${u.id}`, { method: 'DELETE' });
  check('delete -> 204', del.status === 204, String(del.status));
  createdUsers.splice(createdUsers.indexOf(u.id), 1);
  check('...they\'re gone (404)', (await call(`/admin/users/${u.id}`)).status === 404);
  const owners = (await db.query("SELECT user_id::int AS id FROM group_memberships WHERE group_id = $1 AND role = 'owner'", [shared.id])).rows;
  check('...the shared group lives on, owned by the other member', owners.length === 1 && owners[0].id === other.id);
  check('...the group only they were in is deleted', (await db.query('SELECT 1 FROM friend_groups WHERE id = $1', [solo.id])).rows.length === 0);
  createdGroups.splice(createdGroups.indexOf(solo.id), 1);
  const again = await call(`/admin/users/${u.id}`, { method: 'DELETE' });
  check('deleting them again -> 404', again.status === 404 && code(again) === 'USER_NOT_FOUND');

  // Clean up the shared group; the other member's active group should be what it was.
  await call(`/admin/groups/${shared.id}`, { method: 'DELETE' });
  createdGroups.splice(createdGroups.indexOf(shared.id), 1);
  check('the other member\'s active group is what it was', (await db.query('SELECT active_group_id::int AS a FROM users WHERE id = $1', [other.id])).rows[0].a === other.active);
  check('the number of users is back to where it started', (await userCount()) === before);
} catch (err) {
  check(`unexpected error: ${err.message}`, false);
} finally {
  for (const id of createdGroups) await call(`/admin/groups/${id}`, { method: 'DELETE' }).catch(() => {});
  for (const id of createdUsers) await call(`/admin/users/${id}`, { method: 'DELETE' }).catch(() => {});
  if (cookie) await call('/admin/logout', { method: 'POST' }).catch(() => {});
  await db.end();
}

const failed = results.filter((ok) => !ok).length;
console.log(failed ? `\n${failed} of ${results.length} checks failed.` : `\nAll ${results.length} checks passed.`);
process.exitCode = failed ? 1 : 0;

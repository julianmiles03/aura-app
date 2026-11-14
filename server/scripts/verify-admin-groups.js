// End-to-end check of Maintain Groups (admin portal) against the running API and the database:
//   1. without an admin session, the group routes answer 401 and change nothing
//   2. create checks its input and starts the group with its owner as the only member
//   3. members can be added up to 10; the 11th gets 409 GROUP_FULL and isn't saved
//   4. edit name and city; blanks are refused
//   5. make owner leaves exactly one owner; removing the owner hands it to the longest-standing member
//   6. a group's last member can't be removed (409 LAST_MEMBER)
//   7. delete removes the group and its memberships, and nobody's active group is left pointing at it
// Usage: npm run dev (in another terminal), then npm run verify:admin-groups
// Needs ADMIN_EMAIL and ADMIN_PASSWORD in server/.env for an existing admin (npm run db:admin-account).
// It creates two test groups ("verify-admin-groups ..."), adds 11 existing users who already have an
// active group to one of them for a few seconds, then deletes both, so the data ends up as it was.
// Other people can see the test groups in Find for those seconds, so ask the team before running it
// on the shared database.
import pg from 'pg';
import '../src/env.js';

const API = `${process.env.API_URL ?? `http://localhost:${process.env.API_PORT || 4000}`}/api`;
const { ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
const results = [];
const check = (label, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` (${detail})` : ''}`);
};

let cookie = null; // the aura_admin session token once signed in
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

if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error('Set ADMIN_EMAIL and ADMIN_PASSWORD in server/.env for an admin account (npm run db:admin-account makes one).');
  process.exit(1);
}

const db = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const owners = async (groupId) => (await db.query(
  "SELECT user_id::int AS id FROM group_memberships WHERE group_id = $1 AND role = 'owner'", [groupId])).rows.map((r) => r.id);
const memberCount = async (groupId) => (await db.query(
  'SELECT count(*)::int AS n FROM group_memberships WHERE group_id = $1', [groupId])).rows[0].n;
const created = []; // test groups to clean up, even if a check throws

try {
  await db.connect();
  const tag = `verify-admin-groups ${Date.now().toString(36)}`;

  // 1. No session.
  for (const [method, path] of [['GET', '/admin/groups'], ['POST', '/admin/groups'], ['GET', '/admin/users']]) {
    const r = await call(path, { method, body: method === 'POST' ? { name: tag, city: 'Nowhere', ownerUserId: 1 } : undefined, signedIn: false });
    check(`${method} ${path} without a session -> 401`, r.status === 401 && code(r) === 'ADMIN_SIGNED_OUT', `${r.status} ${code(r)}`);
  }
  const { rows: [{ n: leaked }] } = await db.query('SELECT count(*)::int AS n FROM friend_groups WHERE name = $1', [tag]);
  check('...and nothing was created', leaked === 0);

  const login = await call('/admin/login', { method: 'POST', body: { user_email: ADMIN_EMAIL, user_password: ADMIN_PASSWORD }, signedIn: false });
  cookie = login.setCookie.find((c) => c.startsWith('aura_admin='))?.match(/^aura_admin=([^;]+)/)?.[1];
  check('admin signs in', login.status === 200 && !!cookie, String(login.status));

  // People who already have an active group, so adding them here doesn't change it.
  const { rows: people } = await db.query(
    'SELECT id::int AS id, first_name, active_group_id::int AS active FROM users WHERE active_group_id IS NOT NULL ORDER BY id LIMIT 11',
  );
  if (people.length < 11) throw new Error(`Need 11 users who have an active group; found ${people.length}.`);
  const [owner, ...others] = people;

  // 2. Create.
  const blank = await call('/admin/groups', { method: 'POST', body: { name: '  ', city: 'Provo, UT', ownerUserId: owner.id } });
  check('create with a blank name -> 400', blank.status === 400 && code(blank) === 'VALIDATION_ERROR');
  const noOwner = await call('/admin/groups', { method: 'POST', body: { name: tag, city: 'Provo, UT' } });
  check('create without an owner -> 400', noOwner.status === 400 && noOwner.body?.error?.details?.field === 'ownerUserId');
  const ghost = await call('/admin/groups', { method: 'POST', body: { name: tag, city: 'Provo, UT', ownerUserId: 99999999 } });
  check('create with an owner who does not exist -> 404', ghost.status === 404 && code(ghost) === 'USER_NOT_FOUND');
  const made = await call('/admin/groups', { method: 'POST', body: { name: ` ${tag} `, city: 'Provo, UT', ownerUserId: owner.id } });
  const group = made.body?.group;
  if (group) created.push(group.id);
  check('create -> 201 with the owner as its only member', made.status === 201 && group.name === tag && group.memberCount === 1
    && group.members[0].id === owner.id && group.members[0].role === 'owner', String(made.status));
  check('...and it did not become the owner\'s active group', (await db.query('SELECT active_group_id::int AS a FROM users WHERE id = $1', [owner.id])).rows[0].a === owner.active);
  const list = await call('/admin/groups');
  check('GET /admin/groups lists it with its owner', list.body.groups.some((g) => g.id === group.id && g.owner?.id === owner.id && g.memberCount === 1));

  // 3. Members, up to 10.
  const dup = await call(`/admin/groups/${group.id}/members`, { method: 'POST', body: { userId: owner.id } });
  check('adding someone already in it -> 409 ALREADY_MEMBER', dup.status === 409 && code(dup) === 'ALREADY_MEMBER');
  const noUser = await call(`/admin/groups/${group.id}/members`, { method: 'POST', body: { userId: 99999999 } });
  check('adding someone who does not exist -> 404', noUser.status === 404 && code(noUser) === 'USER_NOT_FOUND');
  const statuses = [];
  for (const p of others.slice(0, 9)) statuses.push((await call(`/admin/groups/${group.id}/members`, { method: 'POST', body: { userId: p.id } })).status);
  check('9 more members -> 201 each', statuses.every((s) => s === 201), statuses.join(','));
  const full = await call(`/admin/groups/${group.id}`);
  check('the group is now 10 of 10 and full', full.body.group.memberCount === 10 && full.body.group.isFull === true);
  const eleventh = await call(`/admin/groups/${group.id}/members`, { method: 'POST', body: { userId: others[9].id } });
  check('the 11th member -> 409 GROUP_FULL', eleventh.status === 409 && code(eleventh) === 'GROUP_FULL', `${eleventh.status} ${code(eleventh)}`);
  check('...and the database still has 10', (await memberCount(group.id)) === 10);
  const search = await call(`/admin/users?q=${encodeURIComponent(others[0].first_name)}&groupId=${group.id}`);
  check('GET /admin/users finds people and flags who is in the group', search.status === 200
    && search.body.users.some((u) => u.id === others[0].id && u.inGroup === true));

  // 4. Edit.
  const edit = await call(`/admin/groups/${group.id}`, { method: 'PATCH', body: { name: `${tag} renamed`, city: 'Orem, UT' } });
  check('edit name and city -> 200', edit.status === 200 && edit.body.group.name === `${tag} renamed` && edit.body.group.city === 'Orem, UT');
  const blankEdit = await call(`/admin/groups/${group.id}`, { method: 'PATCH', body: { city: '' } });
  check('blanking the city -> 400', blankEdit.status === 400 && code(blankEdit) === 'VALIDATION_ERROR');
  const missing = await call('/admin/groups/99999999', { method: 'PATCH', body: { name: 'x' } });
  check('editing a group that does not exist -> 404', missing.status === 404 && code(missing) === 'GROUP_NOT_FOUND');

  // 5. Owners.
  const promote = await call(`/admin/groups/${group.id}/members/${others[0].id}`, { method: 'PATCH', body: { role: 'owner' } });
  const afterPromote = await owners(group.id);
  check('make owner -> exactly one owner, the new one', promote.status === 200 && afterPromote.length === 1 && afterPromote[0] === others[0].id, afterPromote.join(','));
  const dropOwner = await call(`/admin/groups/${group.id}/members/${others[0].id}`, { method: 'DELETE' });
  const afterDrop = await owners(group.id);
  check('removing the owner hands it to the longest-standing member', dropOwner.status === 200 && afterDrop.length === 1 && afterDrop[0] === owner.id, afterDrop.join(','));
  check('...and the group has 9, so it is no longer full', dropOwner.body.group.memberCount === 9 && dropOwner.body.group.isFull === false);
  const refill = await call(`/admin/groups/${group.id}/members`, { method: 'POST', body: { userId: others[9].id } });
  check('a 10th member fits again -> 201', refill.status === 201 && refill.body.group.memberCount === 10);

  // 6. The last member stays.
  const solo = await call('/admin/groups', { method: 'POST', body: { name: `${tag} solo`, city: 'Provo, UT', ownerUserId: owner.id } });
  if (solo.body?.group) created.push(solo.body.group.id);
  const last = await call(`/admin/groups/${solo.body.group.id}/members/${owner.id}`, { method: 'DELETE' });
  check('removing a group\'s last member -> 409 LAST_MEMBER', last.status === 409 && code(last) === 'LAST_MEMBER');
  check('...and they are still in it', (await memberCount(solo.body.group.id)) === 1);

  // 7. Delete.
  for (const id of [...created]) {
    const del = await call(`/admin/groups/${id}`, { method: 'DELETE' });
    check(`delete group ${id} -> 204`, del.status === 204, String(del.status));
    created.splice(created.indexOf(id), 1);
  }
  const gone = await call(`/admin/groups/${group.id}`);
  check('the deleted group is 404', gone.status === 404 && code(gone) === 'GROUP_NOT_FOUND');
  check('...and its memberships are gone', (await memberCount(group.id)) === 0);
  const { rows: now } = await db.query('SELECT id::int AS id, active_group_id::int AS active FROM users WHERE id = ANY($1)', [people.map((p) => p.id)]);
  check('everyone\'s active group is what it was before', now.every((u) => u.active === people.find((p) => p.id === u.id).active));
} catch (err) {
  check(`unexpected error: ${err.message}`, false);
} finally {
  // Clean up any test group a failed check left behind.
  for (const id of created) await call(`/admin/groups/${id}`, { method: 'DELETE' }).catch(() => {});
  if (cookie) await call('/admin/logout', { method: 'POST' }).catch(() => {});
  await db.end();
}

const failed = results.filter((ok) => !ok).length;
console.log(failed ? `\n${failed} of ${results.length} checks failed.` : `\nAll ${results.length} checks passed.`);
process.exitCode = failed ? 1 : 0;

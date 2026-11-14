// End-to-end check of Maintain Interests (admin portal) against the running API and the database:
//   1. without an admin session, the interest routes answer 401 and change nothing
//   2. create checks the name (blank, too long) and refuses a name that exists in any capitalization
//   3. create, list, rename (including a capitalization-only rename), 404s
//   4. delete takes it off every profile that had it
// Usage: npm run dev (in another terminal), then npm run verify:admin-interests
// It adds two test interests (one on a test person's profile, added through Maintain Users) and
// deletes them again, so it leaves the data as it was.
import pg from 'pg';
import { call, check, code, fields, finish, preflight, signIn, signOut } from './lib/admin-client.js';

await preflight();
const db = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const count = async () => (await db.query('SELECT count(*)::int AS n FROM interests')).rows[0].n;
const madeInterests = [];
let testUser = null;

try {
  await db.connect();
  const tag = `zz verify ${Date.now().toString(36)}`;

  // 1. No session.
  for (const [method, path] of [['GET', '/admin/interests'], ['POST', '/admin/interests'], ['PATCH', '/admin/interests/1'], ['DELETE', '/admin/interests/1']]) {
    const r = await call(path, { method, body: ['POST', 'PATCH'].includes(method) ? { name: tag } : undefined, signedIn: false });
    check(`${method} ${path} without a session -> 401`, r.status === 401 && code(r) === 'ADMIN_SIGNED_OUT', `${r.status} ${code(r)}`);
  }
  check('...and nothing was created', (await db.query('SELECT 1 FROM interests WHERE name = $1', [tag])).rows.length === 0);
  await signIn();

  // 2. Validation and duplicates.
  const before = await count();
  const blank = await call('/admin/interests', { method: 'POST', body: { name: '   ' } });
  check('blank name -> 400 naming the field', blank.status === 400 && code(blank) === 'VALIDATION_ERROR' && !!fields(blank).name);
  const long = await call('/admin/interests', { method: 'POST', body: { name: 'x'.repeat(41) } });
  check('41 characters -> 400 "40 characters or fewer"', long.status === 400 && fields(long).name?.includes('40'));
  const { rows: [existing] } = await db.query('SELECT name FROM interests ORDER BY id LIMIT 1');
  const dupe = await call('/admin/interests', { method: 'POST', body: { name: existing.name.toUpperCase() } });
  check(`"${existing.name.toUpperCase()}" when "${existing.name}" exists -> 409 INTEREST_EXISTS`, dupe.status === 409 && code(dupe) === 'INTEREST_EXISTS'
    && fields(dupe).name?.includes(existing.name), fields(dupe).name);
  check('...and none of those saved anything', (await count()) === before);

  // 3. Create, list, rename.
  const made = await call('/admin/interests', { method: 'POST', body: { name: `  ${tag}  ` } });
  const interest = made.body?.interest;
  if (interest) madeInterests.push(interest.id);
  check('create -> 201, trimmed, used by nobody yet', made.status === 201 && interest.name === tag && interest.userCount === 0, String(made.status));
  const list = await call('/admin/interests');
  check('GET /admin/interests lists every interest, with it', list.body.interests.length === before + 1 && list.body.interests.some((i) => i.id === interest.id));
  const renamed = await call(`/admin/interests/${interest.id}`, { method: 'PATCH', body: { name: tag.toUpperCase() } });
  check('rename to the same name in capitals -> 200', renamed.status === 200 && renamed.body.interest.name === tag.toUpperCase());
  const clash = await call(`/admin/interests/${interest.id}`, { method: 'PATCH', body: { name: existing.name } });
  check('rename to another interest\'s name -> 409', clash.status === 409 && code(clash) === 'INTEREST_EXISTS');
  const ghost = await call('/admin/interests/99999999', { method: 'PATCH', body: { name: `${tag} x` } });
  check('rename one that doesn\'t exist -> 404', ghost.status === 404 && code(ghost) === 'INTEREST_NOT_FOUND');

  // 4. Delete one that's on a profile. The test person comes from Maintain Users; the interest is
  // put on their profile directly, as the app would.
  testUser = (await call('/admin/users', { method: 'POST', body: { firstName: 'Verify', lastName: tag, city: 'Provo, UT' } })).body?.user;
  await db.query('INSERT INTO user_interests (user_id, interest_id) VALUES ($1, $2)', [testUser.id, interest.id]);
  const used = (await call('/admin/interests')).body.interests.find((i) => i.id === interest.id);
  check('the list counts who picked it, and who has no other interest', used.userCount === 1 && used.onlyInterestCount === 1);
  const del = await call(`/admin/interests/${interest.id}`, { method: 'DELETE' });
  check('delete -> 204', del.status === 204, String(del.status));
  madeInterests.splice(madeInterests.indexOf(interest.id), 1);
  check('...it\'s gone, and off the profile that had it', (await db.query('SELECT 1 FROM interests WHERE id = $1', [interest.id])).rows.length === 0
    && (await db.query('SELECT 1 FROM user_interests WHERE user_id = $1', [testUser.id])).rows.length === 0);
  const again = await call(`/admin/interests/${interest.id}`, { method: 'DELETE' });
  check('deleting it again -> 404', again.status === 404);
  check('the number of interests is back where it started', (await count()) === before);
} catch (err) {
  check(`unexpected error: ${err.message}`, false);
} finally {
  for (const id of madeInterests) await call(`/admin/interests/${id}`, { method: 'DELETE' }).catch(() => {});
  if (testUser) await call(`/admin/users/${testUser.id}`, { method: 'DELETE' }).catch(() => {});
  await signOut();
  await db.end();
}
finish();

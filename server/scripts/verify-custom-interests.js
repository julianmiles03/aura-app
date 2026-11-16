// End-to-end check of custom interests (README "Custom Interests"), through the API:
//   1. a name nobody has yet goes on the person's profile at once, as a custom interest that the
//      interest picker (GET /api/interests) doesn't offer anyone
//   2. the same name in other capitals and spacing reuses that interest: one row, first spelling kept
//   3. it's still out of the picker with 9 people, and in it once the 10th person adds it
//   4. two spellings of one name in the same save count once
//   5. bad names (blank, invisible only, too long, not text) and an empty list get 400 VALIDATION_ERROR
//      and change nothing
// Usage: npm run dev (in another terminal), then npm run verify:custom-interests
// It signs in as demo accounts 1-11 and adds a test interest to their profiles, then puts back each
// person's interests and deletes the test interest, so the data ends up as it was. For the few
// seconds it runs, the test interest is on those profiles, and at the end in everyone's picker.
import pg from 'pg';
import '../src/env.js';
import { PICKER_THRESHOLD } from '../src/lib/interests.js';
import { authHeaders } from './lib/session.js';

const API = `http://localhost:${process.env.API_PORT || 4000}/api`;
const results = [];
const check = (label, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` (${detail})` : ''}`);
};
async function call(userId, path, { method = 'GET', body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { ...(userId && await authHeaders(userId)), ...(body !== undefined && { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}
const save = (userId, interests) => call(userId, '/me', { method: 'PATCH', body: { interests } });
const namesOf = (me) => me.interests.map((i) => i.name);
const picker = async () => (await call(null, '/interests')).body.interests.map((i) => i.name);

const tag = `Test hobby ${Date.now().toString(36)}`; // a name nobody has, e.g. "Test hobby mi1x9k2a"
// The same name as people might type it: other capitals, spaces at the ends, several spaces, a
// non-breaking space, a tab.
const spellings = [
  tag,
  `  ${tag.toLowerCase()}  `,
  tag.toUpperCase().replaceAll(' ', '   '),
  tag.replaceAll(' ', ' '),
  `${tag}\t`,
];
const people = Array.from({ length: PICKER_THRESHOLD }, (_, i) => i + 1); // demo accounts 1-10
const viewer = PICKER_THRESHOLD + 1; // demo account 11, who doesn't type it
const original = new Map(); // user id -> their interest names before the test

const db = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
let connected = false;
const rowsFor = async () => (await db.query(
  `SELECT i.id, i.name, i.in_picker, (SELECT count(*)::int FROM user_interests ui WHERE ui.interest_id = i.id) AS people
   FROM interests i WHERE lower(i.name) = lower($1)`,
  [tag],
)).rows;

try {
  try {
    await fetch(`${API}/health`);
  } catch {
    throw new Error(`Can't reach the API at ${API}. Start it with npm run dev in another terminal, then run this again.`);
  }
  await db.connect();
  connected = true;
  for (const id of [...people, viewer]) {
    const me = await call(id, '/me');
    if (me.status !== 200) throw new Error(`Demo account #${id} can't load its profile (${me.status}). Run npm run db:demo-accounts first.`);
    original.set(id, namesOf(me.body));
  }

  // 1. The first person types it.
  const first = await save(people[0], [...original.get(people[0]), spellings[0]]);
  check('a new interest saves (200)', first.status === 200, `got ${first.status}`);
  check('...and is on that person\'s profile at once', namesOf(first.body).includes(tag));
  let [row] = await rowsFor();
  check('...as a custom interest (in_picker false)', row?.in_picker === false);
  check('...that the interest picker doesn\'t offer anyone', !(await picker()).includes(tag));

  // 2 and 3. People 2-9 type it in other capitals and spacing.
  let sameSpelling = true;
  for (const [n, id] of people.slice(1, -1).entries()) {
    const typed = spellings[(n + 1) % spellings.length];
    const r = await save(id, [...original.get(id), typed]);
    if (r.status !== 200 || !namesOf(r.body).includes(tag)) sameSpelling = false;
  }
  check(`${PICKER_THRESHOLD - 1} people typed it in other capitals and spacing; each profile shows "${tag}"`, sameSpelling);
  const rows = await rowsFor();
  check('...and it\'s still one interest', rows.length === 1, `${rows.length} rows`);
  [row] = rows;
  check(`...on ${PICKER_THRESHOLD - 1} profiles`, row?.people === PICKER_THRESHOLD - 1, `${row?.people}`);
  check(`...and still not in the picker with ${PICKER_THRESHOLD - 1} people`, !(await picker()).includes(tag) && row?.in_picker === false);

  const last = await save(people.at(-1), [...original.get(people.at(-1)), spellings[2]]);
  check(`the ${PICKER_THRESHOLD}th person adds it`, last.status === 200 && namesOf(last.body).includes(tag));
  [row] = await rowsFor();
  check('...and now it\'s in the picker for everyone', (await picker()).includes(tag) && row?.in_picker === true);

  // 4. Two spellings of it in one save.
  const both = await save(viewer, [...original.get(viewer), tag, ` ${tag.toLowerCase()} `]);
  check('two spellings of one interest in the same save count once',
    both.status === 200 && namesOf(both.body).filter((n) => n.toLowerCase() === tag.toLowerCase()).length === 1);
  await save(viewer, original.get(viewer));

  // 5. Bad input.
  const before = (await db.query('SELECT count(*)::int AS n FROM interests')).rows[0].n;
  for (const [label, interests] of [
    ['a blank name', [...original.get(viewer), '   ']],
    ['an invisible-only name', [...original.get(viewer), '​​']],
    ['a 41-character name', [...original.get(viewer), 'x'.repeat(41)]],
    ['a name that isn\'t text', [...original.get(viewer), 42]],
    ['an empty list', []],
    ['a list that isn\'t a list', 'Hiking'],
  ]) {
    const r = await save(viewer, interests);
    check(`${label} gets 400 VALIDATION_ERROR`, r.status === 400 && r.body?.error?.code === 'VALIDATION_ERROR', `${r.status} ${r.body?.error?.message ?? ''}`);
  }
  const after = (await db.query('SELECT count(*)::int AS n FROM interests')).rows[0].n;
  const viewerNow = namesOf((await call(viewer, '/me')).body);
  check('...and none of them saved anything', after === before && viewerNow.join('|') === original.get(viewer).join('|'));
} catch (err) {
  console.error(`\nStopped: ${err.message}`);
  results.push(false);
} finally {
  // Put everyone's interests back, then delete the test interest.
  let restored = true;
  for (const [id, names] of original) {
    const r = await save(id, names).catch(() => null);
    if (r?.status !== 200 || namesOf(r.body).join('|') !== names.join('|')) restored = false;
  }
  if (original.size) check('everyone\'s interests are back as they were', restored);
  if (connected) {
    await db.query('DELETE FROM interests WHERE lower(name) = lower($1)', [tag]);
    check('the test interest is deleted', (await rowsFor()).length === 0);
    await db.end();
  }
  const failed = results.filter((ok) => !ok).length;
  console.log(failed ? `\n${failed} of ${results.length} checks failed.` : `\nAll ${results.length} checks passed.`);
  process.exitCode = failed ? 1 : 0;
}

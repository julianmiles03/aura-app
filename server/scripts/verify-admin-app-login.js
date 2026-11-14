// End-to-end check of signing in to the admin portal from the app (POST /api/admin/session/app):
//   1. no app session, or a made-up one -> 401, no cookie
//   2. an app account that isn't an admin -> 403 NOT_ADMIN, no cookie, no admin login made
//   3. an app admin (users.is_admin) -> 200 and the httpOnly cookie; their admin login (admin_users,
//      by their email) is made the first time, with a random password, and reused after that
//   4. the session works for admin routes; the made-up password doesn't work on the sign-in form
// Usage: npm run dev (in another terminal), then npm run verify:admin-app-login
// Signs in as the demo accounts, so it needs SUPABASE_PUBLISHABLE_KEY and DEMO_PASSWORD in
// server/.env, and one demo account that's an app admin (on Find Friends App that's Avery, user 1).
// If it had to make that admin login, it deletes it again at the end, so the data ends up as it was.
import { createHash } from 'node:crypto';
import pg from 'pg';
import { API, call, check, code, finish } from './lib/admin-client.js';
import { authHeaders, DEMO_ACCOUNTS } from './lib/session.js';

try {
  await fetch(`${API}/health`);
} catch {
  console.error(`Can't reach the API at ${API}. Start it with npm run dev in another terminal, then run this again.`);
  process.exit(1);
}

// POST /admin/session/app with the given headers; returns the response and the cookie it set.
async function fromApp(headers) {
  const res = await fetch(`${API}/admin/session/app`, { method: 'POST', headers });
  const body = await res.json().catch(() => null);
  const cookie = res.headers.getSetCookie().find((c) => c.startsWith('aura_admin=')) ?? '';
  return { status: res.status, body, cookie, token: cookie.match(/^aura_admin=([^;]+)/)?.[1] };
}

const db = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
let madeAdminLogin = null; // the admin_users id this run created, to delete at the end

try {
  await db.connect();
  const demoIds = Object.keys(DEMO_ACCOUNTS).map(Number);
  const { rows: [adminUser] } = await db.query('SELECT id::int AS id FROM users WHERE is_admin AND id = ANY($1) ORDER BY id LIMIT 1', [demoIds]);
  const { rows: [plainUser] } = await db.query('SELECT id::int AS id FROM users WHERE NOT is_admin AND id = ANY($1) ORDER BY id LIMIT 1', [demoIds]);
  if (!adminUser) throw new Error('No demo account is an app admin. Make one in the SQL Editor: UPDATE users SET is_admin = true WHERE id = 1;');
  const adminEmail = DEMO_ACCOUNTS[adminUser.id];
  const plainEmail = DEMO_ACCOUNTS[plainUser.id];

  // 1. No app session.
  const none = await fromApp({});
  check('no app session -> 401, no cookie', none.status === 401 && !none.cookie, `${none.status} ${none.body?.error?.code}`);
  const fake = await fromApp({ Authorization: 'Bearer not-a-real-token' });
  check('a made-up app session -> 401, no cookie', fake.status === 401 && !fake.cookie, String(fake.status));

  // 2. An app account that isn't an admin.
  const plain = await fromApp(await authHeaders(plainUser.id));
  check(`${plainEmail} (not an admin) -> 403 NOT_ADMIN, no cookie`, plain.status === 403 && plain.body?.error?.code === 'NOT_ADMIN' && !plain.cookie, String(plain.status));
  check('...and no admin login was made for them', (await db.query('SELECT 1 FROM admin_users WHERE user_email = $1', [plainEmail])).rows.length === 0);

  // 3. An app admin.
  const { rows: [existing] } = await db.query('SELECT id::int AS id FROM admin_users WHERE user_email = $1', [adminEmail]);
  const first = await fromApp(await authHeaders(adminUser.id));
  check(`${adminEmail} (app admin) -> 200, signed in as that email`, first.status === 200 && first.body?.admin?.email === adminEmail, String(first.status));
  check('...with the httpOnly, SameSite=Strict cookie', /;\s*HttpOnly/i.test(first.cookie) && /;\s*SameSite=Strict/i.test(first.cookie));
  const { rows: [login] } = await db.query('SELECT id::int AS id, user_password FROM admin_users WHERE user_email = $1', [adminEmail]);
  if (!existing && login) madeAdminLogin = login.id;
  check(existing ? '...using their existing admin login' : '...and their admin login was made, with a bcrypt hash',
    !!login && /^\$2[aby]\$/.test(login.user_password) && (!existing || existing.id === login.id));
  const { rows: sessions } = await db.query('SELECT token_hash FROM admin_sessions WHERE admin_user_id = $1', [login.id]);
  check('...and only the token\'s hash is stored', sessions.some((x) => x.token_hash === createHash('sha256').update(first.token).digest('hex')));

  // 4. The session works; doing it again reuses the same admin login.
  const okrs = await fetch(`${API}/admin/okrs`, { headers: { Cookie: `aura_admin=${first.token}` } });
  check('the session opens admin routes (GET /admin/okrs -> 200)', okrs.status === 200, String(okrs.status));
  const second = await fromApp(await authHeaders(adminUser.id));
  const { rows: [{ n }] } = await db.query('SELECT count(*)::int AS n FROM admin_users WHERE user_email = $1', [adminEmail]);
  check('signing in from the app again reuses the same admin login', second.status === 200 && n === 1);
  if (madeAdminLogin) {
    const guess = await call('/admin/login', { method: 'POST', body: { user_email: adminEmail, user_password: process.env.DEMO_PASSWORD }, signedIn: false });
    check('the made-up password is nobody\'s: the app password doesn\'t work on the sign-in form', guess.status === 401 && code(guess) === 'ADMIN_LOGIN_FAILED');
  }
  for (const t of [first.token, second.token]) {
    await fetch(`${API}/admin/logout`, { method: 'POST', headers: { Cookie: `aura_admin=${t}` } });
  }
  const after = await fetch(`${API}/admin/okrs`, { headers: { Cookie: `aura_admin=${first.token}` } });
  check('after logging out, that cookie no longer works', after.status === 401);
} catch (err) {
  check(`unexpected error: ${err.message}`, false);
} finally {
  // Leave the data as it was: an admin login this run made goes again (its sessions go with it).
  if (madeAdminLogin) await db.query('DELETE FROM admin_users WHERE id = $1', [madeAdminLogin]).catch(() => {});
  await db.end();
}
finish();

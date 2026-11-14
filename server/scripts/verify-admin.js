// End-to-end check of the admin portal's sign-in against the running API and the database:
//   1. without a session, every admin data route answers 401 ADMIN_SIGNED_OUT (a made-up cookie too)
//   2. a wrong password is 401 ADMIN_LOGIN_FAILED with no cookie, and 5 misses lock that email for 15 min
//   3. the right email + password sets an httpOnly, SameSite=Strict cookie scoped to /api/admin
//   4. the database keeps only hashes: bcrypt for the password, SHA-256 for the session token
//   5. with the cookie, the OKRs and the tables load; the admin tables can't be opened
//   6. log out clears the cookie and deletes the session, so the old cookie stops working
// Usage: npm run dev (in another terminal), then npm run verify:admin
// Needs ADMIN_EMAIL and ADMIN_PASSWORD in server/.env for an existing admin (npm run db:admin-account).
// It signs in once and logs out again: that adds and then removes one admin_sessions row and sets the
// account's last_login_at, and changes nothing else, so it's fine on the shared database.
import { createHash, randomBytes } from 'node:crypto';
import pg from 'pg';
import '../src/env.js';

const API = `${process.env.API_URL ?? `http://localhost:${process.env.API_PORT || 4000}`}/api`;
const { ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
const results = [];

const check = (label, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` (${detail})` : ''}`);
};

// Calls the API like the portal does; `cookie` is the aura_admin token to send, if any.
async function call(path, { method = 'GET', body, cookie } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      ...(body && { 'Content-Type': 'application/json' }),
      ...(cookie && { Cookie: `aura_admin=${cookie}` }),
    },
    body: body && JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null, setCookie: res.headers.getSetCookie() };
}

if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error('Set ADMIN_EMAIL and ADMIN_PASSWORD in server/.env for an admin account (npm run db:admin-account makes one).');
  process.exit(1);
}

const db = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const sha256 = (s) => createHash('sha256').update(s).digest('hex');

try {
  await db.connect();

  // 1. No session (or a fake one): no admin data.
  for (const path of ['/admin/okrs', '/admin/tables', '/admin/tables/users']) {
    const r = await call(path);
    check(`GET ${path} without a session -> 401`, r.status === 401 && r.body?.error?.code === 'ADMIN_SIGNED_OUT', `${r.status} ${r.body?.error?.code}`);
  }
  const fake = await call('/admin/okrs', { cookie: randomBytes(32).toString('base64url') });
  check('a made-up session cookie -> 401', fake.status === 401, String(fake.status));
  const anon = await call('/admin/session');
  check('GET /admin/session without a session -> { admin: null }', anon.status === 200 && anon.body.admin === null);

  // 2. Wrong passwords.
  const wrong = await call('/admin/login', { method: 'POST', body: { user_email: ADMIN_EMAIL, user_password: `${ADMIN_PASSWORD}x` } });
  check('wrong password -> 401 ADMIN_LOGIN_FAILED', wrong.status === 401 && wrong.body?.error?.code === 'ADMIN_LOGIN_FAILED');
  check('...and no cookie is set', wrong.setCookie.length === 0);
  // Uses a made-up email, so the real admin is never locked out by this check.
  const stranger = `nobody-${randomBytes(4).toString('hex')}@example.com`;
  const misses = [];
  for (let i = 0; i < 6; i += 1) {
    misses.push((await call('/admin/login', { method: 'POST', body: { user_email: stranger, user_password: 'not-the-password' } })).status);
  }
  check('5 wrong tries for one email, then 429 TOO_MANY_ATTEMPTS', misses.slice(0, 5).every((s) => s === 401) && misses[5] === 429, misses.join(','));

  // 3. The right password: an httpOnly cookie for /api/admin only. The email is matched without case.
  const login = await call('/admin/login', { method: 'POST', body: { user_email: ` ${ADMIN_EMAIL.toUpperCase()} `, user_password: ADMIN_PASSWORD } });
  check('right email + password -> 200', login.status === 200 && login.body?.admin?.email === ADMIN_EMAIL.trim().toLowerCase(), String(login.status));
  const setCookie = login.setCookie.find((c) => c.startsWith('aura_admin=')) ?? '';
  const token = setCookie.match(/^aura_admin=([^;]+)/)?.[1];
  check('Set-Cookie aura_admin is HttpOnly', /;\s*HttpOnly/i.test(setCookie));
  check('...SameSite=Strict', /;\s*SameSite=Strict/i.test(setCookie));
  check('...Path=/api/admin', /;\s*Path=\/api\/admin(;|$)/i.test(setCookie));
  check('...and expires (Max-Age)', /;\s*Max-Age=\d+/i.test(setCookie));

  // 4. Only hashes in the database.
  const { rows: [admin] } = await db.query('SELECT id, user_password FROM admin_users WHERE user_email = $1', [ADMIN_EMAIL.trim().toLowerCase()]);
  check('admin_users.user_password is a bcrypt hash, not the password', /^\$2[aby]\$\d{2}\$/.test(admin.user_password) && admin.user_password !== ADMIN_PASSWORD);
  const { rows: sessions } = await db.query('SELECT token_hash FROM admin_sessions WHERE admin_user_id = $1', [admin.id]);
  check('admin_sessions has the SHA-256 of the cookie token', sessions.some((s) => s.token_hash === sha256(token)));
  check('...and never the token itself', !sessions.some((s) => s.token_hash.includes(token)));

  // 5. Signed in.
  const me = await call('/admin/session', { cookie: token });
  check('GET /admin/session -> the admin', me.body?.admin?.email === ADMIN_EMAIL.trim().toLowerCase());
  const okrs = await call('/admin/okrs', { cookie: token });
  check('GET /admin/okrs -> 200 with 4 KRs', okrs.status === 200 && okrs.body.keyResults?.length === 4, String(okrs.status));
  const tables = await call('/admin/tables', { cookie: token });
  check('GET /admin/tables -> 200 with row counts', tables.status === 200 && tables.body.tables?.every((t) => Number.isInteger(t.rowCount)), String(tables.status));
  check('...and the admin tables aren\'t listed', !tables.body.tables?.some((t) => t.name.startsWith('admin_')));
  const users = await call('/admin/tables/users', { cookie: token });
  const { rows: [{ n }] } = await db.query('SELECT count(*)::int AS n FROM users');
  check('GET /admin/tables/users -> the users table', users.status === 200 && users.body.columns.includes('first_name') && users.body.rowCount === n, `${users.body.rowCount} of ${n}`);
  const secret = await call('/admin/tables/admin_users', { cookie: token });
  check('GET /admin/tables/admin_users -> 404', secret.status === 404 && secret.body?.error?.code === 'TABLE_NOT_FOUND');
  const appRoute = await call('/me', { cookie: token });
  check('the admin cookie is no way into the app (GET /me -> 401)', appRoute.status === 401, String(appRoute.status));

  // 6. Log out.
  const logout = await call('/admin/logout', { method: 'POST', cookie: token });
  check('POST /admin/logout -> 204', logout.status === 204, String(logout.status));
  check('...tells the browser to delete the cookie', logout.setCookie.some((c) => /^aura_admin=;/.test(c) && /Expires=Thu, 01 Jan 1970/i.test(c)));
  const { rows: [{ left }] } = await db.query('SELECT count(*)::int AS left FROM admin_sessions WHERE token_hash = $1', [sha256(token)]);
  check('...and deletes the session row', left === 0);
  const after = await call('/admin/okrs', { cookie: token });
  check('the old cookie no longer works (401)', after.status === 401, String(after.status));
} catch (err) {
  check(`unexpected error: ${err.message}`, false);
} finally {
  await db.end();
}

const failed = results.filter((ok) => !ok).length;
console.log(failed ? `\n${failed} of ${results.length} checks failed.` : `\nAll ${results.length} checks passed.`);
process.exitCode = failed ? 1 : 0;

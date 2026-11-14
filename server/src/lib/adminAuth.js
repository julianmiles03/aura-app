// Sign-in for the admin portal (#/admin). It's separate from the app's Supabase Auth: admins are
// rows in admin_users, and a signed-in admin is a row in admin_sessions plus an httpOnly cookie.
//
//   1. POST /api/admin/login sends user_email + user_password. The password is checked against
//      admin_users.user_password, which only ever holds a bcrypt hash of it.
//   2. If it matches, we make a random session token, save the token's SHA-256 hash in
//      admin_sessions, and give the browser the token itself in the httpOnly cookie aura_admin.
//      Page JavaScript can't read an httpOnly cookie, so a script injected into the page can't
//      steal the session; the browser just sends it back on every /api/admin request.
//   3. Every other /api/admin route runs requireAdminSession, which looks the token up and
//      answers 401 ADMIN_SIGNED_OUT when it's missing, unknown or expired.
//   4. POST /api/admin/logout deletes the session row and tells the browser to delete the cookie.
import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { query } from '../db.js';
import { ApiError, badRequest } from '../errors.js';

export const COOKIE_NAME = 'aura_admin';
const SESSION_HOURS = 8; // a session ends 8 hours after sign-in, even if it's still being used

// bcrypt cost 12 takes about a quarter of a second per check: unnoticeable for one sign-in,
// but it makes guessing passwords (or cracking a leaked hash) thousands of times slower.
export const BCRYPT_COST = 12;
export const MIN_PASSWORD = 12; // for admin accounts (npm run db:admin-account)
export const hashPassword = (password) => bcrypt.hash(password, BCRYPT_COST);

// Compared against when the email isn't an admin, so a wrong email takes as long to answer as a
// wrong password. Otherwise the response time would tell an attacker which emails are admins.
const NO_SUCH_ADMIN_HASH = bcrypt.hashSync(randomBytes(16).toString('hex'), BCRYPT_COST);

// 32 random bytes, written as 43 base64url characters. Anything else in the cookie is ignored.
const TOKEN_FORMAT = /^[A-Za-z0-9_-]{43}$/;
const hashToken = (token) => createHash('sha256').update(token).digest('hex');

export const normalizeEmail = (email) => String(email).trim().toLowerCase();

// ---------------------------------------------------------------------------
// The cookie
// ---------------------------------------------------------------------------
// The live site sits behind Render's proxy, which says in X-Forwarded-Proto that the browser used HTTPS.
const usesHttps = (req) => req.secure || req.get('X-Forwarded-Proto')?.split(',')[0].trim() === 'https';

function cookieOptions(req) {
  return {
    httpOnly: true, // invisible to document.cookie and any other page script
    secure: usesHttps(req), // HTTPS only on the live site (plain http is fine on localhost)
    sameSite: 'strict', // never sent with a request that starts on another site, which stops CSRF
    path: '/api/admin', // only the admin API gets it, not the rest of the app
  };
}

// Express has no cookie parser built in; this reads one cookie from the Cookie header.
function readSessionToken(req) {
  for (const part of (req.get('Cookie') ?? '').split(';')) {
    const [name, value] = part.trim().split('=');
    if (name === COOKIE_NAME) return TOKEN_FORMAT.test(value ?? '') ? value : null;
  }
  return null;
}
const hasSessionCookie = (req) => (req.get('Cookie') ?? '').split(';').some((p) => p.trim().startsWith(`${COOKIE_NAME}=`));

const clearSessionCookie = (req, res) => res.clearCookie(COOKIE_NAME, cookieOptions(req));

// ---------------------------------------------------------------------------
// Slowing down password guessing
// ---------------------------------------------------------------------------
// After 5 wrong passwords for one email within 15 minutes, that email can't sign in until the
// 15 minutes are up (429 TOO_MANY_ATTEMPTS). Kept in memory, so a server restart forgets it,
// which is fine for our single small API instance.
const MAX_FAILURES = 5;
const LOCKOUT_MS = 15 * 60 * 1000;
const failures = new Map(); // email -> { count, since }

function assertNotLockedOut(email) {
  const entry = failures.get(email);
  if (!entry) return;
  const waitMs = entry.since + LOCKOUT_MS - Date.now();
  if (waitMs <= 0) failures.delete(email);
  else if (entry.count >= MAX_FAILURES) {
    const minutes = Math.ceil(waitMs / 60000);
    throw new ApiError(429, 'TOO_MANY_ATTEMPTS', `Too many wrong passwords. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`);
  }
}

function recordFailure(email) {
  const entry = failures.get(email);
  if (entry && Date.now() - entry.since < LOCKOUT_MS) entry.count += 1;
  else failures.set(email, { count: 1, since: Date.now() });
  // Someone trying thousands of made-up emails shouldn't grow this map forever.
  if (failures.size > 5000) {
    for (const [key, e] of failures) if (Date.now() - e.since >= LOCKOUT_MS) failures.delete(key);
  }
}

// ---------------------------------------------------------------------------
// Log in, look up, log out
// ---------------------------------------------------------------------------
// Checks the email and password and, if they match an admin, starts a session and sets the cookie.
// The error never says which of the two was wrong, so it can't be used to discover admin emails.
export async function logIn(req, res, { email: rawEmail, password }) {
  if (typeof rawEmail !== 'string' || !rawEmail.trim() || rawEmail.length > 254) {
    throw badRequest('VALIDATION_ERROR', 'Enter your admin email.', { field: 'user_email' });
  }
  // bcrypt only looks at the first 72 bytes; anything far longer isn't a real password.
  if (typeof password !== 'string' || !password || password.length > 200) {
    throw badRequest('VALIDATION_ERROR', 'Enter your password.', { field: 'user_password' });
  }
  const email = normalizeEmail(rawEmail);
  assertNotLockedOut(email);

  const { rows: [admin] } = await query('SELECT id, user_email, user_password FROM admin_users WHERE user_email = $1', [email]);
  const matches = await bcrypt.compare(password, admin?.user_password ?? NO_SUCH_ADMIN_HASH);
  if (!admin || !matches) {
    recordFailure(email);
    throw new ApiError(401, 'ADMIN_LOGIN_FAILED', "That email and password don't match an admin account.");
  }
  failures.delete(email);

  // One statement, so it all happens or none of it does: save the new session, note the sign-in
  // time, and clear out sessions that have already expired (anyone's) so the table stays small.
  const token = randomBytes(32).toString('base64url');
  const { rows: [session] } = await query(
    `WITH cleanup AS (DELETE FROM admin_sessions WHERE expires_at <= now()),
          seen    AS (UPDATE admin_users SET last_login_at = now() WHERE id = $1)
     INSERT INTO admin_sessions (admin_user_id, token_hash, expires_at)
     VALUES ($1, $2, now() + make_interval(hours => $3))
     RETURNING expires_at`,
    [admin.id, hashToken(token), SESSION_HOURS],
  );
  res.cookie(COOKIE_NAME, token, { ...cookieOptions(req), maxAge: SESSION_HOURS * 60 * 60 * 1000 });
  return { email: admin.user_email, expiresAt: session.expires_at };
}

// The admin signed in on this browser, or null. A cookie that no longer matches a live session
// (expired, logged out elsewhere, or made up) is deleted from the browser too.
export async function currentAdmin(req, res) {
  const token = readSessionToken(req);
  if (token) {
    const { rows: [session] } = await query(
      `SELECT a.id, a.user_email, s.expires_at
       FROM admin_sessions s JOIN admin_users a ON a.id = s.admin_user_id
       WHERE s.token_hash = $1 AND s.expires_at > now()`,
      [hashToken(token)],
    );
    if (session) return { id: session.id, email: session.user_email, expiresAt: session.expires_at };
  }
  if (hasSessionCookie(req)) clearSessionCookie(req, res);
  return null;
}

// Guard for every admin route except login, logout and session: no valid session, no data.
export async function requireAdminSession(req, res, next) {
  req.admin = await currentAdmin(req, res);
  if (!req.admin) throw new ApiError(401, 'ADMIN_SIGNED_OUT', 'Sign in to the admin portal to see this.');
  next();
}

// Ends this browser's session: the row is deleted, so the token stops working even if a copy of
// the cookie survives somewhere, and the browser is told to delete the cookie.
export async function logOut(req, res) {
  const token = readSessionToken(req);
  if (token) await query('DELETE FROM admin_sessions WHERE token_hash = $1', [hashToken(token)]);
  clearSessionCookie(req, res);
}

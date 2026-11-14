// Shared pieces for the verify:admin-* scripts: talk to the running API as a signed-in admin, and
// print PASS/FAIL lines. Needs ADMIN_EMAIL and ADMIN_PASSWORD in server/.env (npm run db:admin-account).
import '../../src/env.js';

export const API = `${process.env.API_URL ?? `http://localhost:${process.env.API_PORT || 4000}`}/api`;

const results = [];
export function check(label, ok, detail = '') {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` (${detail})` : ''}`);
}
// Prints the total and sets the exit code (1 if anything failed).
export function finish() {
  const failed = results.filter((ok) => !ok).length;
  console.log(failed ? `\n${failed} of ${results.length} checks failed.` : `\nAll ${results.length} checks passed.`);
  process.exitCode = failed ? 1 : 0;
}

// Stops early, with what to do, if the admin login or the API is missing.
export async function preflight() {
  if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD) {
    console.error('Set ADMIN_EMAIL and ADMIN_PASSWORD in server/.env for an admin account (npm run db:admin-account makes one).');
    process.exit(1);
  }
  try {
    await fetch(`${API}/health`);
  } catch {
    console.error(`Can't reach the API at ${API}. Start it with npm run dev in another terminal, then run this again.`);
    process.exit(1);
  }
}

let cookie = null; // the aura_admin session token once signed in
// One API call; signedIn: false leaves the session cookie off.
export async function call(path, { method = 'GET', body, signedIn = true } = {}) {
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
export const code = (r) => r.body?.error?.code;
export const fields = (r) => r.body?.error?.details?.fields ?? {};

export async function signIn() {
  const r = await call('/admin/login', {
    method: 'POST', body: { user_email: process.env.ADMIN_EMAIL, user_password: process.env.ADMIN_PASSWORD }, signedIn: false,
  });
  cookie = r.setCookie.find((c) => c.startsWith('aura_admin='))?.match(/^aura_admin=([^;]+)/)?.[1] ?? null;
  check('admin signs in', r.status === 200 && !!cookie, String(r.status));
}
export async function signOut() {
  if (cookie) await call('/admin/logout', { method: 'POST' }).catch(() => {});
}

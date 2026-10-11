// Read-only connection check: npm run db:check
// Connects with DATABASE_URL from server/.env and prints how many users exist.
import pg from 'pg';
import '../src/env.js';

const HINTS = [
  [/Tenant or user not found|no tenant identifier|ENOIDENTIFIER/i,
    'The username is missing the project ref. It must look like postgres.rcyafwgjnnlgnakwkksi (not just postgres). Re-copy the Session pooler URI from Supabase.'],
  [/password authentication failed/i,
    'Wrong password, or it has special characters (@ # / ? %) that need percent-encoding. Get the current password from Julian.'],
  [/ENOTFOUND|EHOSTUNREACH|ENETUNREACH|getaddrinfo/i,
    "Can't find the host. Use the Session pooler URI (…pooler.supabase.com:5432), not the Direct connection (db.<ref>.supabase.co), which is IPv6-only."],
  [/ETIMEDOUT|timeout/i,
    "The connection timed out. Check your internet, and that you copied the Session pooler URI on port 5432."],
  [/relation "users" does not exist/i,
    "Connected, but the tables aren't there. You're probably pointed at the wrong Supabase project. It must be Find Friends App."],
];

let url;
try {
  url = new URL(process.env.DATABASE_URL);
} catch {
  console.error('DATABASE_URL in server/.env is not a valid URL. Paste the whole URI on one line, and percent-encode special characters in the password.');
  process.exit(1);
}
const who = `${decodeURIComponent(url.username)}@${url.hostname}:${url.port}`;
const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10000 });

try {
  await client.connect();
  const { rows: [r] } = await client.query('SELECT count(*)::int AS users FROM users');
  console.log(`Connected as ${who}`);
  console.log(`OK: users table has ${r.users} rows. Your server/.env is right.`);
} catch (err) {
  console.error(`Could not use the database as ${who}`);
  console.error(`Error: ${err.message}`);
  const hint = HINTS.find(([pattern]) => pattern.test(`${err.code ?? ''} ${err.message}`));
  if (hint) console.error(`Fix: ${hint[1]}`);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}

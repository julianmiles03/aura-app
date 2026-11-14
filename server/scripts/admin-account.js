// Creates a login for the admin portal (#/admin), or sets a new password if that email already has one.
// Usage: npm run db:admin-account               (uses ADMIN_EMAIL and ADMIN_PASSWORD from server/.env)
//        npm run db:admin-account -- you@example.com   (that email, with ADMIN_PASSWORD)
// Only a bcrypt hash of the password is saved (admin_users.user_password); the password itself is
// never stored or printed. Safe to re-run. Run it again after db:reset, which deletes admin accounts.
import '../src/env.js';
import { pool } from '../src/db.js';
import { MIN_PASSWORD, hashPassword, normalizeEmail } from '../src/lib/adminAuth.js';

const email = normalizeEmail(process.argv[2] ?? process.env.ADMIN_EMAIL ?? '');
const password = process.env.ADMIN_PASSWORD ?? '';

// The <placeholders> from server/.env.example must be replaced first.
if (/[<>]/.test(email + password)) {
  console.error('Replace the <placeholders> for ADMIN_EMAIL and ADMIN_PASSWORD in server/.env with a real email and password.');
  process.exit(1);
}
if (!/^[^\s@]+@[^\s@]+$/.test(email)) {
  console.error('Give the admin email: set ADMIN_EMAIL in server/.env, or run npm run db:admin-account -- you@example.com');
  process.exit(1);
}
if (password.length < MIN_PASSWORD) {
  console.error(`Set ADMIN_PASSWORD in server/.env (at least ${MIN_PASSWORD} characters). It's only read here, never saved as is.`);
  process.exit(1);
}

try {
  const hash = await hashPassword(password);
  // xmax = 0 means the row was inserted rather than updated, which tells us which one happened.
  const { rows: [row] } = await pool.query(
    `INSERT INTO admin_users (user_email, user_password) VALUES ($1, $2)
     ON CONFLICT (user_email) DO UPDATE SET user_password = EXCLUDED.user_password
     RETURNING id, (xmax = 0) AS created`,
    [email, hash],
  );
  if (!row.created) {
    // A new password signs out every browser that was using the old one.
    const { rowCount } = await pool.query('DELETE FROM admin_sessions WHERE admin_user_id = $1', [row.id]);
    console.log(`Updated the password for ${email}${rowCount ? ` and signed out ${rowCount} session(s)` : ''}.`);
  } else {
    console.log(`Created admin ${email}. Sign in at #/admin with this email and ADMIN_PASSWORD.`);
  }
} catch (err) {
  console.error(err.code === '42P01'
    ? 'The admin_users table is missing. Run npm run db:migrate first (migration 009).'
    : `Admin account failed: ${err.message}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}

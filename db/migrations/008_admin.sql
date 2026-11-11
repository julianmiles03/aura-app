-- 008: admins for the OKR dashboard (GET /api/admin/okrs answers only users with is_admin = true).
-- Adds to an existing aura database WITHOUT wiping it. db/schema.sql already includes it.
-- Safe to re-run. Apply with: npm run db:migrate
-- Make someone an admin in Supabase's SQL Editor (it isn't done here, so re-running never changes who's admin):
--   UPDATE users SET is_admin = true WHERE id = <their users.id>;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;

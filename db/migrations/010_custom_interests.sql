-- 010: custom interests. Adds interests.in_picker: whether everyone can pick the interest in the
-- interest picker (GET /api/interests). A new name someone types now goes on their own profile only,
-- and joins the picker once 10 people have it (server/src/lib/interests.js). Also makes the database
-- store names tidy (trimmed, one space between words), so "rock  climbing " can't sit beside
-- "Rock climbing". And drops the exact-name UNIQUE on interests.name: interests_name_lower_idx
-- already makes names unique in any capitalization, and the extra index made two people saving the
-- same new interest at the same moment fail with a duplicate-key error.
-- Adds to an existing aura database WITHOUT wiping it: nobody loses an interest from their profile.
-- db/schema.sql already includes it for fresh builds.
-- Safe to re-run. Apply with: npm run db:migrate (before deploying the API that uses it).

BEGIN;

-- Change the table as whichever role owns aura's tables (aura_app on Find Friends App), even when
-- this is run with the postgres login. SET LOCAL lasts until COMMIT.
DO $$
DECLARE
  app_owner name := (SELECT tableowner FROM pg_tables WHERE schemaname = 'public' AND tablename = 'interests');
BEGIN
  IF app_owner <> current_user THEN
    EXECUTE format('SET LOCAL ROLE %I', app_owner);
  END IF;
END $$;

-- The first run adds the column and applies the new rule to the interests people typed before it:
-- the 16 starter interests (db/seed.sql) stay in the picker, and so does anything 10 or more people
-- have; the rest become custom (still on every profile that has them, just not offered to everyone).
-- Later runs leave in_picker alone, so they never undo a promotion.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'interests' AND column_name = 'in_picker') THEN
    ALTER TABLE interests ADD COLUMN in_picker boolean NOT NULL DEFAULT true;
    UPDATE interests i SET in_picker = false
    WHERE lower(i.name) NOT IN ('hiking', 'board games', 'tacos', 'live music', 'pickleball', 'climbing',
                                'film', 'baking', 'guitar', 'running', 'volleyball', 'photography',
                                'coffee', 'cooking', 'video games', 'karaoke')
      AND (SELECT count(*) FROM user_interests ui WHERE ui.interest_id = i.id) < 10;
  END IF;
END $$;

-- Tidy any untidy names, then make the database keep them that way.
UPDATE interests SET name = btrim(regexp_replace(name, '\s+', ' ', 'g'))
WHERE name <> btrim(regexp_replace(name, '\s+', ' ', 'g'));
ALTER TABLE interests DROP CONSTRAINT IF EXISTS interests_name_tidy;
ALTER TABLE interests ADD CONSTRAINT interests_name_tidy CHECK (name = btrim(regexp_replace(name, '\s+', ' ', 'g')));

ALTER TABLE interests DROP CONSTRAINT IF EXISTS interests_name_key;

COMMIT;

-- Sprint 3: every profile has 1 main photo (position 1) + up to 3 more (positions 2-4).
-- The unique (user_id, position) becomes DEFERRABLE so "Make main" can swap two positions in one UPDATE.
ALTER TABLE user_photos DROP CONSTRAINT IF EXISTS user_photos_position_check;
ALTER TABLE user_photos ADD CONSTRAINT user_photos_position_check CHECK (position BETWEEN 1 AND 4);
ALTER TABLE user_photos DROP CONSTRAINT IF EXISTS user_photos_user_id_position_key;
ALTER TABLE user_photos ADD CONSTRAINT user_photos_user_id_position_key
  UNIQUE (user_id, position) DEFERRABLE INITIALLY IMMEDIATE;
-- Close gaps left by earlier deletes, so everyone's first photo is at position 1 (their main photo).
UPDATE user_photos p SET position = r.n
FROM (SELECT id, row_number() OVER (PARTITION BY user_id ORDER BY position) AS n FROM user_photos) r
WHERE p.id = r.id AND p.position <> r.n;

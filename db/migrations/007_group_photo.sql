-- Sprint 3: a group's owner can upload / replace / remove the group photo (Supabase Storage URL).
ALTER TABLE friend_groups ADD COLUMN IF NOT EXISTS photo_url text;

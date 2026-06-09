-- 038_auth_migration.sql
-- Link profiles to Supabase auth users, remove PIN columns

-- Add auth user link to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS auth_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email TEXT;

-- Add unique constraint on auth_user_id
CREATE UNIQUE INDEX IF NOT EXISTS profiles_auth_user_id_idx ON profiles(auth_user_id);

-- Keep existing columns intact for now — PIN columns stay but are no longer used
-- They can be cleaned up later once migration is confirmed working

-- 042_user_permissions.sql
-- Add granular per-module permissions to user profiles.
-- Managers always have full access via role; these toggles only affect staff users.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT '{
  "orders": true,
  "workshop": true,
  "quotes": true,
  "customers": true,
  "online": true,
  "reporting": true,
  "pricing": false,
  "settings": false,
  "vault_brain": false
}'::jsonb;

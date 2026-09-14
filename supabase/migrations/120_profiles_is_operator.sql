-- 120_profiles_is_operator.sql
-- System-operator (superadmin) flag for the /vault-admin cross-tenant area.
--
-- Replaces the previous, broken operator gate (a hardcoded client-side PIN that
-- set a forgeable `vault_operator_auth=1` cookie — anyone could set it). Access
-- to /vault-admin and /api/vault-admin/* now requires a valid Supabase session
-- whose profile has is_operator = true.
--
-- This migration ONLY adds the column (default false = nobody is an operator).
-- The grant to a specific profile is environment-specific and run SEPARATELY
-- (see the grant block accompanying this migration) so we never hardcode a
-- profile id that differs between staging and prod.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_operator boolean NOT NULL DEFAULT false;

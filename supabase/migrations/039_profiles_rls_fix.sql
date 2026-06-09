-- 039_profiles_rls_fix.sql
-- Allow users to read their own profile by auth_user_id
-- This is needed for the UserContext browser client fetch

-- Drop the existing blanket tenant_isolation policy on profiles
DROP POLICY IF EXISTS "tenant_isolation" ON profiles;

-- Add a policy that lets authenticated users read their own profile
CREATE POLICY "users_read_own_profile" ON profiles
  FOR SELECT
  USING (auth_user_id = auth.uid());

-- Keep tenant isolation for insert/update/delete
CREATE POLICY "tenant_isolation_write" ON profiles
  FOR ALL
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

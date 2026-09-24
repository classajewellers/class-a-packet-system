-- 167_workshop_roles_tenant_isolation.sql
-- Matches the policy staging already applied as workshop_roles_tenant_isolation.
-- Number 167: 164 and 165 are taken on other branches; 166 creates the tables.
--
-- workshop_roles and profile_workshop_roles:
--   ENABLE + FORCE row level security
--   policy tenant_isolation FOR ALL
--     USING (tenant_id = public.current_tenant_id())
--     WITH CHECK (tenant_id = public.current_tenant_id())
--
-- Idempotent. Does not rename tables. Does not recreate workshop_team_members.
-- Does not insert accounts.

ALTER TABLE public.workshop_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workshop_roles FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.workshop_roles;
CREATE POLICY tenant_isolation ON public.workshop_roles
  FOR ALL
  USING (tenant_id = public.current_tenant_id())
  WITH CHECK (tenant_id = public.current_tenant_id());

ALTER TABLE public.profile_workshop_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_workshop_roles FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.profile_workshop_roles;
CREATE POLICY tenant_isolation ON public.profile_workshop_roles
  FOR ALL
  USING (tenant_id = public.current_tenant_id())
  WITH CHECK (tenant_id = public.current_tenant_id());

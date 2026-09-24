-- 165_workshop_role_tags.sql
-- Final Part C shape. Idempotent when the tables already exist.
--
-- workshop_role_tags
--   id uuid primary key, tenant_id, key, label, sort, active, created_at
--   unique (tenant_id, key)
-- profile_workshop_roles
--   tenant_id, profile_id, workshop_role_tag_id, created_at
--   primary key (profile_id, workshop_role_tag_id)
-- profiles.role is unchanged (system access only).
--
-- 164 created the catalog as workshop_roles (slug, name, sort_order).
-- This file renames that table when it is still present. It does not insert
-- accounts and does not tag anyone cad_designer.
--
-- Staging apply is owned by Vault DB (project aexfqkaayrcmdehuzpza).
-- Not production. Already applied there:
--   workshop_roles                  version 20260924070528
--   workshop_roles_tenant_isolation version 20260924071103
--   workshop_role_tags              version 20260924071250
-- The isolation migration ran before the rename. Policies are bound to the
-- table, so they are already on workshop_role_tags and profile_workshop_roles:
--   FORCE ROW LEVEL SECURITY
--   policy tenant_isolation FOR ALL
--     USING (tenant_id = public.current_tenant_id())
--     WITH CHECK (tenant_id = public.current_tenant_id())
-- Re-applying the policy block below replaces that same text.
-- No remaining staging apply. Do not re-seed passwords.

DO $$
BEGIN
  IF to_regclass('public.workshop_roles') IS NULL THEN
    RETURN;
  END IF;

  ALTER TABLE public.workshop_roles RENAME TO workshop_role_tags;
  ALTER TABLE public.workshop_role_tags RENAME COLUMN slug TO key;
  ALTER TABLE public.workshop_role_tags RENAME COLUMN name TO label;
  ALTER TABLE public.workshop_role_tags RENAME COLUMN sort_order TO sort;

  ALTER TABLE public.workshop_role_tags
    RENAME CONSTRAINT workshop_roles_pkey TO workshop_role_tags_pkey;
  ALTER TABLE public.workshop_role_tags
    RENAME CONSTRAINT workshop_roles_tenant_id_fkey TO workshop_role_tags_tenant_id_fkey;
  ALTER TABLE public.workshop_role_tags
    RENAME CONSTRAINT workshop_roles_tenant_id_slug_key TO workshop_role_tags_tenant_id_key_key;

  ALTER INDEX workshop_roles_tenant_idx RENAME TO workshop_role_tags_tenant_idx;

  ALTER TABLE public.profile_workshop_roles
    RENAME COLUMN workshop_role_id TO workshop_role_tag_id;
  ALTER TABLE public.profile_workshop_roles
    RENAME CONSTRAINT profile_workshop_roles_workshop_role_id_fkey
    TO profile_workshop_roles_workshop_role_tag_id_fkey;
  ALTER INDEX profile_workshop_roles_role_idx RENAME TO profile_workshop_roles_tag_idx;
END $$;

-- Same statements Vault DB applied in workshop_roles_tenant_isolation,
-- retargeted at the renamed tables. DROP + CREATE is a no-op replacement
-- when the live policy text already matches.
ALTER TABLE public.workshop_role_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workshop_role_tags FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.workshop_role_tags;
CREATE POLICY tenant_isolation ON public.workshop_role_tags
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

CREATE OR REPLACE FUNCTION public.seed_workshop_role_tags_for_tenant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.workshop_role_tags (tenant_id, key, label, active, sort)
  VALUES
    (NEW.id, 'jeweller',     'Jeweller',     true, 1),
    (NEW.id, 'cad_designer', 'CAD Designer', true, 2)
  ON CONFLICT (tenant_id, key) DO NOTHING;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.seed_workshop_role_tags_for_tenant() FROM anon, authenticated, public;

DROP TRIGGER IF EXISTS tenants_seed_workshop_roles ON public.tenants;
DROP TRIGGER IF EXISTS tenants_seed_workshop_role_tags ON public.tenants;
CREATE TRIGGER tenants_seed_workshop_role_tags
  AFTER INSERT ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.seed_workshop_role_tags_for_tenant();

DROP FUNCTION IF EXISTS public.seed_workshop_roles_for_tenant();

-- 165_workshop_role_tags.sql
-- Aligns the Part C catalog with the approved Vault DB shape.
--
-- Approved:
--   workshop_role_tags (tenant_id, key, label, active, sort)
--     plus id uuid primary key so profile_workshop_roles can reference a row
--   profile_workshop_roles  M2M profile ↔ workshop_role_tags
--   profiles.role stays system access only (manager | staff). Not changed here.
--
-- 164 created this catalog as workshop_roles (slug, name, sort_order).
-- This migration renames that table and those columns. It does not insert
-- accounts, does not tag anyone cad_designer, and does not touch Josh or
-- Staff Test. jeweller + cad_designer rows already seeded by 164 keep their
-- keys. workshop_team_members was dropped in 164 (cutover already done).
--
-- STAGING APPLY (project aexfqkaayrcmdehuzpza). Not production.
--   1. 164_workshop_roles.sql must already be applied.
--   2. Apply this file.
--   3. No password re-seed. The six Class A practice logins already exist
--      and stay Jeweller-only.
--
-- RLS: enabled, no policies (deny-all for anon/authenticated). Service role
-- bypasses RLS. Same posture as the other workshop lookup tables.

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

ALTER TABLE public.workshop_role_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_workshop_roles ENABLE ROW LEVEL SECURITY;

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

-- 166_workshop_role_tags.sql
-- Part C. Number 166: main ends at 163, and 164/165 are already used
-- (164_inventory_category_casting, 165_attachments_metadata on
-- feat/xero-po-accounts; those names are in staging schema_migrations).
--
-- Does not assume these tables exist. Idempotent if they do.
-- Does not create or rename a workshop_roles catalog.
--
-- workshop_role_tags
--   id uuid primary key
--   tenant_id, key, label, active, sort
--   created_at
--   unique (tenant_id, key)
-- profile_workshop_roles
--   tenant_id, profile_id, workshop_role_tag_id, created_at
--   primary key (profile_id, workshop_role_tag_id)
-- profiles.role is not modified.
--
-- Seed for every tenant: key jeweller (label Jeweller, sort 1),
-- key cad_designer (label CAD Designer, sort 2). This file does not
-- attach cad_designer to any profile.
--
-- RLS matches workshop_jobs (and packets / leads): policy tenant_isolation
-- FOR ALL USING (tenant_id = public.current_tenant_id()), not forced.
-- Not the 093 deny-all used by workshop_stages, workshop_locations,
-- workshop_stage_categories, and workshop_subcontractors (RLS on, no policy).
--
-- STAGING APPLY (Vault DB). Project aexfqkaayrcmdehuzpza. Not production.
--   1. Apply this file. It drops workshop_team_members when that table exists.
--   2. Create the six Class A logins (auth + profile + Jeweller tag only):
--
--        WORKSHOP_SEED_PASSWORD='VaultTeam-Practice1' \
--        NEXT_PUBLIC_SUPABASE_URL='https://aexfqkaayrcmdehuzpza.supabase.co' \
--        SUPABASE_SERVICE_ROLE_KEY='…' \
--        node scripts/seed-workshop-team.mjs
--
--      Ben ben@classa.com.au, Viv viv@classa.com.au,
--      Joe joseph@classa.com.au, David david@classa.com.au,
--      Jack jack@classa.com.au, Shahzad shahrzad@classa.com.au.
--      System role staff. Tag jeweller only. Do not modify Josh or Staff Test.

CREATE TABLE IF NOT EXISTS public.workshop_role_tags (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  key         text        NOT NULL,
  label       text        NOT NULL,
  active      boolean     NOT NULL DEFAULT true,
  sort        int         NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, key)
);

CREATE TABLE IF NOT EXISTS public.profile_workshop_roles (
  tenant_id            uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  profile_id           uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  workshop_role_tag_id uuid        NOT NULL REFERENCES public.workshop_role_tags(id) ON DELETE CASCADE,
  created_at           timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, workshop_role_tag_id)
);

CREATE INDEX IF NOT EXISTS workshop_role_tags_tenant_idx
  ON public.workshop_role_tags (tenant_id, sort);

CREATE INDEX IF NOT EXISTS profile_workshop_roles_tenant_idx
  ON public.profile_workshop_roles (tenant_id);

CREATE INDEX IF NOT EXISTS profile_workshop_roles_tag_idx
  ON public.profile_workshop_roles (workshop_role_tag_id);

-- Same policy text as workshop_jobs. USING covers writes on a FOR ALL policy
-- when WITH CHECK is omitted. NO FORCE matches workshop_jobs (not forced).
ALTER TABLE public.workshop_role_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workshop_role_tags NO FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.workshop_role_tags;
CREATE POLICY tenant_isolation ON public.workshop_role_tags
  FOR ALL
  USING (tenant_id = public.current_tenant_id());

ALTER TABLE public.profile_workshop_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_workshop_roles NO FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.profile_workshop_roles;
CREATE POLICY tenant_isolation ON public.profile_workshop_roles
  FOR ALL
  USING (tenant_id = public.current_tenant_id());

INSERT INTO public.workshop_role_tags (tenant_id, key, label, active, sort)
SELECT t.id, r.key, r.label, true, r.sort
FROM public.tenants t
CROSS JOIN (
  VALUES
    ('jeweller',     'Jeweller',     1),
    ('cad_designer', 'CAD Designer', 2)
) AS r(key, label, sort)
ON CONFLICT (tenant_id, key) DO NOTHING;

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

DROP TRIGGER IF EXISTS tenants_seed_workshop_role_tags ON public.tenants;
CREATE TRIGGER tenants_seed_workshop_role_tags
  AFTER INSERT ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.seed_workshop_role_tags_for_tenant();

-- Tag a same-tenant profile Jeweller when the old name list matches, then
-- drop that list. No-op when workshop_team_members is already gone.
-- Does not mark anyone cad_designer.
DO $$
BEGIN
  IF to_regclass('public.workshop_team_members') IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.profile_workshop_roles (tenant_id, profile_id, workshop_role_tag_id)
  SELECT DISTINCT wtm.tenant_id, p.id, wrt.id
  FROM public.workshop_team_members wtm
  JOIN public.profiles p
    ON p.tenant_id = wtm.tenant_id
   AND (
        lower(btrim(p.full_name)) = lower(btrim(wtm.name))
     OR lower(split_part(btrim(coalesce(p.full_name, '')), ' ', 1)) = lower(btrim(wtm.name))
   )
  JOIN public.workshop_role_tags wrt
    ON wrt.tenant_id = wtm.tenant_id
   AND wrt.key = 'jeweller'
  WHERE coalesce(wtm.active, true)
  ON CONFLICT DO NOTHING;

  DROP TABLE public.workshop_team_members;
END $$;

-- 164_workshop_roles.sql
-- Part C catalog, pre-rename names. 165 renames to the approved shape:
--   workshop_role_tags (tenant_id, key, label, active, sort)
--   profile_workshop_roles many-to-many
-- profiles.role is not changed.
--
-- Staging apply is owned by Vault DB (project aexfqkaayrcmdehuzpza).
-- Already applied there as schema_migrations name workshop_roles
-- (version 20260924070528), then renamed by workshop_role_tags
-- (version 20260924071250). Ben, Viv, Joe, David, Jack, and Shahzad
-- already exist as auth + profile with the Jeweller tag only.
-- This file adds no new staging object. Do not re-seed passwords.
--
-- Idempotent when workshop_role_tags already exists: the body returns
-- immediately so a second apply does not create an empty workshop_roles.

DO $m164$
BEGIN
  IF to_regclass('public.workshop_role_tags') IS NOT NULL THEN
    RETURN;
  END IF;

  CREATE TABLE IF NOT EXISTS public.workshop_roles (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    slug        text        NOT NULL,
    name        text        NOT NULL,
    sort_order  int         NOT NULL DEFAULT 0,
    active      boolean     NOT NULL DEFAULT true,
    created_at  timestamptz NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, slug)
  );

  CREATE TABLE IF NOT EXISTS public.profile_workshop_roles (
    tenant_id         uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    profile_id        uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    workshop_role_id  uuid        NOT NULL REFERENCES public.workshop_roles(id) ON DELETE CASCADE,
    created_at        timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (profile_id, workshop_role_id)
  );

  CREATE INDEX IF NOT EXISTS profile_workshop_roles_tenant_idx
    ON public.profile_workshop_roles (tenant_id);

  CREATE INDEX IF NOT EXISTS profile_workshop_roles_role_idx
    ON public.profile_workshop_roles (workshop_role_id);

  CREATE INDEX IF NOT EXISTS workshop_roles_tenant_idx
    ON public.workshop_roles (tenant_id, sort_order);

  ALTER TABLE public.workshop_roles ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.profile_workshop_roles ENABLE ROW LEVEL SECURITY;

  INSERT INTO public.workshop_roles (tenant_id, slug, name, sort_order)
  SELECT t.id, r.slug, r.name, r.sort_order
  FROM public.tenants t
  CROSS JOIN (
    VALUES
      ('jeweller',      'Jeweller',      1),
      ('cad_designer',  'CAD Designer',  2)
  ) AS r(slug, name, sort_order)
  ON CONFLICT (tenant_id, slug) DO NOTHING;

  CREATE OR REPLACE FUNCTION public.seed_workshop_roles_for_tenant()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
  AS $fn$
  BEGIN
    INSERT INTO public.workshop_roles (tenant_id, slug, name, sort_order)
    VALUES
      (NEW.id, 'jeweller',     'Jeweller',     1),
      (NEW.id, 'cad_designer', 'CAD Designer', 2)
    ON CONFLICT (tenant_id, slug) DO NOTHING;
    RETURN NEW;
  END;
  $fn$;

  REVOKE EXECUTE ON FUNCTION public.seed_workshop_roles_for_tenant() FROM anon, authenticated, public;

  DROP TRIGGER IF EXISTS tenants_seed_workshop_roles ON public.tenants;
  CREATE TRIGGER tenants_seed_workshop_roles
    AFTER INSERT ON public.tenants
    FOR EACH ROW EXECUTE FUNCTION public.seed_workshop_roles_for_tenant();

  -- Tag an existing same-tenant profile Jeweller when the name matches the
  -- old list, then drop that list. No-op once workshop_team_members is gone.
  IF to_regclass('public.workshop_team_members') IS NOT NULL THEN
    INSERT INTO public.profile_workshop_roles (tenant_id, profile_id, workshop_role_id)
    SELECT DISTINCT wtm.tenant_id, p.id, wr.id
    FROM public.workshop_team_members wtm
    JOIN public.profiles p
      ON p.tenant_id = wtm.tenant_id
     AND (
          lower(btrim(p.full_name)) = lower(btrim(wtm.name))
       OR lower(split_part(btrim(coalesce(p.full_name, '')), ' ', 1)) = lower(btrim(wtm.name))
     )
    JOIN public.workshop_roles wr
      ON wr.tenant_id = wtm.tenant_id
     AND wr.slug = 'jeweller'
    WHERE coalesce(wtm.active, true)
    ON CONFLICT DO NOTHING;

    DROP TABLE public.workshop_team_members;
  END IF;
END
$m164$;

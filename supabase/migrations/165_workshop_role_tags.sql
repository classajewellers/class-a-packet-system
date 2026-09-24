-- 165_workshop_role_tags.sql
-- Part C schema for staging. Complete on its own. Does not assume
-- workshop_role_tags or profile_workshop_roles already exist.
-- Idempotent if they do (including a renamed workshop_roles draft).
--
-- Shape:
--   workshop_role_tags
--     id uuid primary key
--     tenant_id, key, label, active, sort
--     created_at
--     unique (tenant_id, key)
--   profile_workshop_roles
--     tenant_id, profile_id, workshop_role_tag_id, created_at
--     primary key (profile_id, workshop_role_tag_id)
--   profiles.role is not modified (system access only: admin | manager | staff)
--
-- Seeded catalog rows for every tenant: jeweller, cad_designer.
-- This file does not attach cad_designer to any profile, and it does not
-- create the six staff logins. Those are scripts/seed-workshop-team.mjs.
--
-- RLS: ENABLE + FORCE, policy tenant_isolation FOR ALL
--   USING (tenant_id = public.current_tenant_id())
--   WITH CHECK (tenant_id = public.current_tenant_id())
-- on both tables. Service role bypasses RLS.
--
-- STAGING APPLY (Vault DB). Project aexfqkaayrcmdehuzpza. Not production.
--   1. Apply this file.
--   2. Create the six Class A practice logins (auth user + profile + Jeweller
--      tag only). No invite email. From a checkout of this tip:
--
--        WORKSHOP_SEED_PASSWORD='VaultTeam-Practice1' \
--        NEXT_PUBLIC_SUPABASE_URL='https://aexfqkaayrcmdehuzpza.supabase.co' \
--        SUPABASE_SERVICE_ROLE_KEY='…' \
--        node scripts/seed-workshop-team.mjs
--
--      Ben     ben@classa.com.au
--      Viv     viv@classa.com.au
--      Joe     joseph@classa.com.au
--      David   david@classa.com.au
--      Jack    jack@classa.com.au
--      Shahzad shahrzad@classa.com.au
--
--      Display names stay the short names. Shahzad was not on
--      workshop_team_members; the script creates that account too.
--      Do not tag anyone cad_designer. Do not modify Josh or Staff Test.
--      Sign-in is /login with that password. A manager can replace it
--      later from Settings → Team → Set password.
--   3. workshop_team_members is dropped at the end of this file when present.

-- Fold an older workshop_roles draft into the approved names, if one exists
-- and the final table does not.
DO $$
BEGIN
  IF to_regclass('public.workshop_roles') IS NOT NULL
     AND to_regclass('public.workshop_role_tags') IS NULL THEN
    ALTER TABLE public.workshop_roles RENAME TO workshop_role_tags;
  END IF;

  IF to_regclass('public.workshop_role_tags') IS NULL THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'workshop_role_tags' AND column_name = 'slug'
  ) THEN
    ALTER TABLE public.workshop_role_tags RENAME COLUMN slug TO key;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'workshop_role_tags' AND column_name = 'name'
  ) THEN
    ALTER TABLE public.workshop_role_tags RENAME COLUMN name TO label;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'workshop_role_tags' AND column_name = 'sort_order'
  ) THEN
    ALTER TABLE public.workshop_role_tags RENAME COLUMN sort_order TO sort;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workshop_roles_pkey') THEN
    ALTER TABLE public.workshop_role_tags RENAME CONSTRAINT workshop_roles_pkey TO workshop_role_tags_pkey;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workshop_roles_tenant_id_fkey') THEN
    ALTER TABLE public.workshop_role_tags RENAME CONSTRAINT workshop_roles_tenant_id_fkey TO workshop_role_tags_tenant_id_fkey;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workshop_roles_tenant_id_slug_key') THEN
    ALTER TABLE public.workshop_role_tags RENAME CONSTRAINT workshop_roles_tenant_id_slug_key TO workshop_role_tags_tenant_id_key_key;
  END IF;

  IF to_regclass('public.workshop_roles_tenant_idx') IS NOT NULL
     AND to_regclass('public.workshop_role_tags_tenant_idx') IS NULL THEN
    ALTER INDEX public.workshop_roles_tenant_idx RENAME TO workshop_role_tags_tenant_idx;
  END IF;

  IF to_regclass('public.profile_workshop_roles') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'profile_workshop_roles' AND column_name = 'workshop_role_id'
     ) THEN
    ALTER TABLE public.profile_workshop_roles RENAME COLUMN workshop_role_id TO workshop_role_tag_id;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profile_workshop_roles_workshop_role_id_fkey') THEN
    ALTER TABLE public.profile_workshop_roles
      RENAME CONSTRAINT profile_workshop_roles_workshop_role_id_fkey
      TO profile_workshop_roles_workshop_role_tag_id_fkey;
  END IF;

  IF to_regclass('public.profile_workshop_roles_role_idx') IS NOT NULL
     AND to_regclass('public.profile_workshop_roles_tag_idx') IS NULL THEN
    ALTER INDEX public.profile_workshop_roles_role_idx RENAME TO profile_workshop_roles_tag_idx;
  END IF;
END $$;

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

DROP TRIGGER IF EXISTS tenants_seed_workshop_roles ON public.tenants;
DROP TRIGGER IF EXISTS tenants_seed_workshop_role_tags ON public.tenants;
CREATE TRIGGER tenants_seed_workshop_role_tags
  AFTER INSERT ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.seed_workshop_role_tags_for_tenant();

DROP FUNCTION IF EXISTS public.seed_workshop_roles_for_tenant();

-- If the old name list is still present, tag a same-tenant profile Jeweller
-- when the name matches, then drop the list. No-op when the table is absent.
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

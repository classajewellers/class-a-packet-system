-- 166_workshop_roles.sql
-- Boss decision A. Canonical catalog is workshop_roles.
-- Columns: slug, name, sort_order, active (plus id, tenant_id, created_at).
-- profile_workshop_roles.workshop_role_id is the many-to-many link.
--
-- Does not create workshop_role_tags. If that rename already landed,
-- this folds the table and columns back. Rows and profile links stay.
-- Idempotent when workshop_roles already has the canonical columns.
--
-- Number 166: main ends at 163. 164 and 165 are used by
-- 164_inventory_category_casting and 165_attachments_metadata.
--
-- Seeds jeweller and cad_designer. Does not tag anyone cad_designer.
-- Does not create the six staff logins (scripts/seed-workshop-team.mjs).

DO $$
BEGIN
  IF to_regclass('public.workshop_role_tags') IS NOT NULL
     AND to_regclass('public.workshop_roles') IS NULL THEN
    ALTER TABLE public.workshop_role_tags RENAME TO workshop_roles;
  END IF;

  IF to_regclass('public.workshop_roles') IS NULL THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'workshop_roles' AND column_name = 'key'
  ) THEN
    ALTER TABLE public.workshop_roles RENAME COLUMN key TO slug;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'workshop_roles' AND column_name = 'label'
  ) THEN
    ALTER TABLE public.workshop_roles RENAME COLUMN label TO name;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'workshop_roles' AND column_name = 'sort'
  ) THEN
    ALTER TABLE public.workshop_roles RENAME COLUMN sort TO sort_order;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workshop_role_tags_pkey') THEN
    ALTER TABLE public.workshop_roles RENAME CONSTRAINT workshop_role_tags_pkey TO workshop_roles_pkey;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workshop_role_tags_tenant_id_fkey') THEN
    ALTER TABLE public.workshop_roles RENAME CONSTRAINT workshop_role_tags_tenant_id_fkey TO workshop_roles_tenant_id_fkey;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workshop_role_tags_tenant_id_key_key') THEN
    ALTER TABLE public.workshop_roles RENAME CONSTRAINT workshop_role_tags_tenant_id_key_key TO workshop_roles_tenant_id_slug_key;
  END IF;

  IF to_regclass('public.workshop_role_tags_tenant_idx') IS NOT NULL
     AND to_regclass('public.workshop_roles_tenant_idx') IS NULL THEN
    ALTER INDEX public.workshop_role_tags_tenant_idx RENAME TO workshop_roles_tenant_idx;
  END IF;

  IF to_regclass('public.profile_workshop_roles') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'profile_workshop_roles' AND column_name = 'workshop_role_tag_id'
     ) THEN
    ALTER TABLE public.profile_workshop_roles RENAME COLUMN workshop_role_tag_id TO workshop_role_id;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profile_workshop_roles_workshop_role_tag_id_fkey') THEN
    ALTER TABLE public.profile_workshop_roles
      RENAME CONSTRAINT profile_workshop_roles_workshop_role_tag_id_fkey
      TO profile_workshop_roles_workshop_role_id_fkey;
  END IF;

  IF to_regclass('public.profile_workshop_roles_tag_idx') IS NOT NULL
     AND to_regclass('public.profile_workshop_roles_role_idx') IS NULL THEN
    ALTER INDEX public.profile_workshop_roles_tag_idx RENAME TO profile_workshop_roles_role_idx;
  END IF;
END $$;

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
  tenant_id        uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  profile_id       uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  workshop_role_id uuid        NOT NULL REFERENCES public.workshop_roles(id) ON DELETE CASCADE,
  created_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, workshop_role_id)
);

CREATE INDEX IF NOT EXISTS workshop_roles_tenant_idx
  ON public.workshop_roles (tenant_id, sort_order);

CREATE INDEX IF NOT EXISTS profile_workshop_roles_tenant_idx
  ON public.profile_workshop_roles (tenant_id);

CREATE INDEX IF NOT EXISTS profile_workshop_roles_role_idx
  ON public.profile_workshop_roles (workshop_role_id);

ALTER TABLE public.workshop_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_workshop_roles ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'workshop_roles' AND pol.polname = 'tenant_isolation'
  ) THEN
    CREATE POLICY tenant_isolation ON public.workshop_roles
      FOR ALL
      USING (tenant_id = public.current_tenant_id());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'profile_workshop_roles' AND pol.polname = 'tenant_isolation'
  ) THEN
    CREATE POLICY tenant_isolation ON public.profile_workshop_roles
      FOR ALL
      USING (tenant_id = public.current_tenant_id());
  END IF;
END $$;

INSERT INTO public.workshop_roles (tenant_id, slug, name, sort_order, active)
SELECT t.id, r.slug, r.name, r.sort_order, true
FROM public.tenants t
CROSS JOIN (
  VALUES
    ('jeweller',     'Jeweller',     1),
    ('cad_designer', 'CAD Designer', 2)
) AS r(slug, name, sort_order)
ON CONFLICT (tenant_id, slug) DO NOTHING;

CREATE OR REPLACE FUNCTION public.seed_workshop_roles_for_tenant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.workshop_roles (tenant_id, slug, name, active, sort_order)
  VALUES
    (NEW.id, 'jeweller',     'Jeweller',     true, 1),
    (NEW.id, 'cad_designer', 'CAD Designer', true, 2)
  ON CONFLICT (tenant_id, slug) DO NOTHING;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.seed_workshop_roles_for_tenant() FROM anon, authenticated, public;

DROP TRIGGER IF EXISTS tenants_seed_workshop_role_tags ON public.tenants;
DROP TRIGGER IF EXISTS tenants_seed_workshop_roles ON public.tenants;
CREATE TRIGGER tenants_seed_workshop_roles
  AFTER INSERT ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.seed_workshop_roles_for_tenant();

DROP FUNCTION IF EXISTS public.seed_workshop_role_tags_for_tenant();

DO $$
BEGIN
  IF to_regclass('public.workshop_team_members') IS NULL THEN
    RETURN;
  END IF;

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
END $$;

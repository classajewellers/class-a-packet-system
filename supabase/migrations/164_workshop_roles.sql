-- 164_workshop_roles.sql
-- Part C — real staff accounts + workshop role tags.
-- Column names here (slug, name, sort_order) are renamed by
-- 165_workshop_role_tags.sql to the approved shape:
-- workshop_role_tags (key, label, active, sort). Apply 165 immediately after.
-- Replaces workshop_team_members (a name list) with:
--   workshop_roles            — tenant-scoped role catalog (Jeweller, CAD Designer, …)
--   profile_workshop_roles    — which profiles hold which workshop roles
-- System role (profiles.role: admin/manager/staff) stays separate.
-- Adding Setter / Polisher later is an INSERT into workshop_roles, not a schema change.
--
-- STAGING ONLY until Josh says APPROVED FOR PRODUCTION.
-- Vault DB apply (staging project, not production):
--   1. Run this file.
--   2. Create the six practice logins (they are names only today — no auth user
--      and no profile on staging). Do NOT use the invite-email flow.
--      Either:
--        a) Settings → Team after this code is deployed (manager types name,
--           email, and a temporary password; sign-in is /login), or
--        b) node scripts/seed-workshop-team.mjs
--           with the staging service role and WORKSHOP_SEED_PASSWORD set.
--      The seed script is idempotent and refuses any host other than the
--      staging project unless WORKSHOP_SEED_ALLOW_ANY_HOST=1.
--   3. Practice sign-in: /login with the email and the temporary password
--      the manager set (or WORKSHOP_SEED_PASSWORD). A manager can replace
--      that password later from Settings → Team → Set password. No email
--      is sent.
--
-- Known Class A names this replaces (staging workshop_team_members, 2026-09-24):
--   Ben, Viv, Joe, David, Jack. Shahzad was not a row; the seed script adds
--   that account too, per the locked spec. Display names stay the short
--   names so existing jobs stored under workshop_subcontractor_name still
--   match. Emails come from the existing staff email map (lib/staffEmails.ts).
--
-- RLS matches the other workshop lookup tables after 093: enabled, no
-- policy (deny-all for anon/authenticated). API routes use the service role.

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

-- Starter tags for every tenant that already exists.
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
AS $$
BEGIN
  INSERT INTO public.workshop_roles (tenant_id, slug, name, sort_order)
  VALUES
    (NEW.id, 'jeweller',     'Jeweller',     1),
    (NEW.id, 'cad_designer', 'CAD Designer', 2)
  ON CONFLICT (tenant_id, slug) DO NOTHING;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.seed_workshop_roles_for_tenant() FROM anon, authenticated, public;

DROP TRIGGER IF EXISTS tenants_seed_workshop_roles ON public.tenants;
CREATE TRIGGER tenants_seed_workshop_roles
  AFTER INSERT ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.seed_workshop_roles_for_tenant();

-- If a profile in the same tenant already matches a team-member name, tag
-- them Jeweller before the name list is dropped. Staging has no such
-- profiles (confirmed 2026-09-24); this is for any environment that does.
-- Guarded so a second apply (table already gone) is a no-op.
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

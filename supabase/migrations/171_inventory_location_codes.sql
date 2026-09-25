-- STATUS: APPLIED
-- Applied to staging on 2026-09-26 at about 8:54 AM ACST, as migration 20260925232344.

ALTER TABLE public.inventory_locations ADD COLUMN IF NOT EXISTS code text;
ALTER TABLE public.inventory_locations ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;

CREATE UNIQUE INDEX IF NOT EXISTS inventory_locations_tenant_code_key
  ON public.inventory_locations (tenant_id, lower(code))
  WHERE code IS NOT NULL;
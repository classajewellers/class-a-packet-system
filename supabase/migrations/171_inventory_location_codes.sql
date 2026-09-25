ALTER TABLE public.inventory_locations ADD COLUMN IF NOT EXISTS code text;
ALTER TABLE public.inventory_locations ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;

CREATE UNIQUE INDEX IF NOT EXISTS inventory_locations_tenant_code_key
  ON public.inventory_locations (tenant_id, lower(code))
  WHERE code IS NOT NULL;
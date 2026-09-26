-- STATUS: APPLIED on staging 20260925234932. NOT on production until Josh says APPROVED FOR PRODUCTION.
CREATE TABLE IF NOT EXISTS public.stocktake_zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  code text,
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz,
  CONSTRAINT stocktake_zones_id_tenant_key UNIQUE (id, tenant_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS stocktake_zones_tenant_code_key
  ON public.stocktake_zones (tenant_id, lower(code)) WHERE code IS NOT NULL;

ALTER TABLE public.inventory_locations ADD COLUMN IF NOT EXISTS stocktake_zone_id uuid;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_locations_stocktake_zone_fk') THEN
    ALTER TABLE public.inventory_locations
      ADD CONSTRAINT inventory_locations_stocktake_zone_fk
      FOREIGN KEY (stocktake_zone_id, tenant_id)
      REFERENCES public.stocktake_zones (id, tenant_id)
      ON DELETE SET NULL (stocktake_zone_id);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS inventory_locations_stocktake_zone_idx
  ON public.inventory_locations (stocktake_zone_id) WHERE stocktake_zone_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.stocktake_zone_neighbours (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  zone_a_id uuid NOT NULL,
  zone_b_id uuid NOT NULL,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (zone_a_id, zone_b_id),
  CONSTRAINT stocktake_zone_neighbours_order_chk CHECK (zone_a_id < zone_b_id),
  CONSTRAINT stocktake_zone_neighbours_a_fk FOREIGN KEY (zone_a_id, tenant_id)
    REFERENCES public.stocktake_zones (id, tenant_id) ON DELETE CASCADE,
  CONSTRAINT stocktake_zone_neighbours_b_fk FOREIGN KEY (zone_b_id, tenant_id)
    REFERENCES public.stocktake_zones (id, tenant_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS stocktake_zone_neighbours_b_idx
  ON public.stocktake_zone_neighbours (zone_b_id);

ALTER TABLE public.stocktake_sessions ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'location';
ALTER TABLE public.stocktake_sessions ADD COLUMN IF NOT EXISTS zone_id uuid;
ALTER TABLE public.stocktake_sessions ADD COLUMN IF NOT EXISTS parent_session_id uuid;
ALTER TABLE public.stocktake_sessions ALTER COLUMN location_id DROP NOT NULL;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stocktake_sessions_kind_chk') THEN
    ALTER TABLE public.stocktake_sessions ADD CONSTRAINT stocktake_sessions_kind_chk
      CHECK (kind IN ('location','zone','whole_shop'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stocktake_sessions_kind_target_chk') THEN
    ALTER TABLE public.stocktake_sessions ADD CONSTRAINT stocktake_sessions_kind_target_chk
      CHECK (
        (kind = 'location'   AND location_id IS NOT NULL AND zone_id IS NULL) OR
        (kind = 'zone'       AND zone_id IS NOT NULL AND location_id IS NULL) OR
        (kind = 'whole_shop' AND location_id IS NULL AND zone_id IS NULL AND parent_session_id IS NULL)
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stocktake_sessions_zone_fk') THEN
    ALTER TABLE public.stocktake_sessions ADD CONSTRAINT stocktake_sessions_zone_fk
      FOREIGN KEY (zone_id, tenant_id) REFERENCES public.stocktake_zones (id, tenant_id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stocktake_sessions_parent_fk') THEN
    ALTER TABLE public.stocktake_sessions ADD CONSTRAINT stocktake_sessions_parent_fk
      FOREIGN KEY (parent_session_id, tenant_id) REFERENCES public.stocktake_sessions (id, tenant_id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS stocktake_sessions_one_open_per_zone
  ON public.stocktake_sessions (tenant_id, zone_id) WHERE status = 'in_progress' AND zone_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS stocktake_sessions_one_open_whole_shop
  ON public.stocktake_sessions (tenant_id) WHERE status = 'in_progress' AND kind = 'whole_shop';
CREATE INDEX IF NOT EXISTS stocktake_sessions_parent_idx
  ON public.stocktake_sessions (parent_session_id) WHERE parent_session_id IS NOT NULL;

ALTER TABLE public.stocktake_scans ADD COLUMN IF NOT EXISTS scanned_location_id uuid
  REFERENCES public.inventory_locations(id) ON DELETE SET NULL;
ALTER TABLE public.stocktake_scans DROP CONSTRAINT IF EXISTS stocktake_scans_result_group_check;
ALTER TABLE public.stocktake_scans ADD CONSTRAINT stocktake_scans_result_group_check
  CHECK (result_group IN ('found','wrong_tray','nearby_zone','wrong_location','unknown','not_in_stock'));

ALTER TABLE public.stocktake_zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stocktake_zones FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.stocktake_zones;
CREATE POLICY tenant_isolation ON public.stocktake_zones FOR ALL
  USING (tenant_id = public.current_tenant_id())
  WITH CHECK (tenant_id = public.current_tenant_id());

ALTER TABLE public.stocktake_zone_neighbours ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stocktake_zone_neighbours FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.stocktake_zone_neighbours;
CREATE POLICY tenant_isolation ON public.stocktake_zone_neighbours FOR ALL
  USING (tenant_id = public.current_tenant_id())
  WITH CHECK (tenant_id = public.current_tenant_id());
-- 170_inventory_stocktake.sql
-- Stocktake v1. Vault DB applies this on staging. Do not run it from the app.
--
-- Count sessions and the lines recorded while a count is open.
-- Expected pieces are snapshotted at start (in_stock at the chosen location)
-- so a refresh mid-count restores the same Missing list.
-- Scans are unique per session+EPC, and per session+piece when a tag or
-- barcode resolves to a piece. Finish writes a line with result 'missing'.
-- It does not change inventory_pieces.status.
--
-- RLS matches workshop_roles (167) / packet_cad_versions (169):
--   ENABLE + FORCE, policy tenant_isolation FOR ALL
--   USING and WITH CHECK (tenant_id = public.current_tenant_id()).
-- Service-role API routes still filter with tenantScoped.
--
-- Rollback:
--   DROP TABLE IF EXISTS public.inventory_stocktake_lines;
--   DROP TABLE IF EXISTS public.inventory_stocktake_expected;
--   DROP TABLE IF EXISTS public.inventory_stocktakes;

CREATE TABLE IF NOT EXISTS public.inventory_stocktakes (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  location_id  uuid        NOT NULL REFERENCES public.inventory_locations(id) ON DELETE RESTRICT,
  status       text        NOT NULL DEFAULT 'in_progress',
  started_by   uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  finished_by  uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  started_at   timestamptz NOT NULL DEFAULT now(),
  finished_at  timestamptz,
  CONSTRAINT inventory_stocktakes_status_check CHECK (status IN ('in_progress', 'finished'))
);

CREATE INDEX IF NOT EXISTS inventory_stocktakes_tenant_started_idx
  ON public.inventory_stocktakes (tenant_id, started_at DESC);

CREATE TABLE IF NOT EXISTS public.inventory_stocktake_expected (
  stocktake_id uuid NOT NULL REFERENCES public.inventory_stocktakes(id) ON DELETE CASCADE,
  tenant_id    uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  piece_id     uuid NOT NULL REFERENCES public.inventory_pieces(id) ON DELETE CASCADE,
  sku          text,
  PRIMARY KEY (stocktake_id, piece_id)
);

CREATE INDEX IF NOT EXISTS inventory_stocktake_expected_tenant_idx
  ON public.inventory_stocktake_expected (tenant_id);

CREATE TABLE IF NOT EXISTS public.inventory_stocktake_lines (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  stocktake_id          uuid        NOT NULL REFERENCES public.inventory_stocktakes(id) ON DELETE CASCADE,
  epc                   text,
  sku                   text,
  piece_id              uuid        REFERENCES public.inventory_pieces(id) ON DELETE SET NULL,
  result                text        NOT NULL,
  recorded_location_id  uuid        REFERENCES public.inventory_locations(id) ON DELETE SET NULL,
  moved_here            boolean     NOT NULL DEFAULT false,
  scanned_by            uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  scanned_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inventory_stocktake_lines_result_check
    CHECK (result IN ('found', 'elsewhere', 'unknown', 'blank', 'missing'))
);

-- One row per tag in a count, including a repeat scan of the same EPC.
CREATE UNIQUE INDEX IF NOT EXISTS inventory_stocktake_lines_epc_idx
  ON public.inventory_stocktake_lines (stocktake_id, epc)
  WHERE epc IS NOT NULL;

-- One row per piece. A barcode hit and a tag hit for the same piece collapse,
-- and a finish-time missing line cannot duplicate a piece already scanned.
CREATE UNIQUE INDEX IF NOT EXISTS inventory_stocktake_lines_piece_idx
  ON public.inventory_stocktake_lines (stocktake_id, piece_id)
  WHERE piece_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS inventory_stocktake_lines_stocktake_idx
  ON public.inventory_stocktake_lines (stocktake_id);

ALTER TABLE public.inventory_stocktakes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_stocktakes FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.inventory_stocktakes;
CREATE POLICY tenant_isolation ON public.inventory_stocktakes
  FOR ALL
  USING (tenant_id = public.current_tenant_id())
  WITH CHECK (tenant_id = public.current_tenant_id());

ALTER TABLE public.inventory_stocktake_expected ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_stocktake_expected FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.inventory_stocktake_expected;
CREATE POLICY tenant_isolation ON public.inventory_stocktake_expected
  FOR ALL
  USING (tenant_id = public.current_tenant_id())
  WITH CHECK (tenant_id = public.current_tenant_id());

ALTER TABLE public.inventory_stocktake_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_stocktake_lines FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.inventory_stocktake_lines;
CREATE POLICY tenant_isolation ON public.inventory_stocktake_lines
  FOR ALL
  USING (tenant_id = public.current_tenant_id())
  WITH CHECK (tenant_id = public.current_tenant_id());

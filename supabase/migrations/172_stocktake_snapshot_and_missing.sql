-- STATUS: APPLIED on staging 20260925234908. NOT on production until Josh says APPROVED FOR PRODUCTION.
ALTER TABLE public.stocktake_sessions ADD COLUMN IF NOT EXISTS snapshot_at timestamptz;

CREATE TABLE IF NOT EXISTS public.stocktake_expected (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  session_id uuid NOT NULL,
  piece_id uuid NOT NULL REFERENCES public.inventory_pieces(id) ON DELETE RESTRICT,
  snapshot_location_id uuid REFERENCES public.inventory_locations(id) ON DELETE SET NULL,
  snapshot_status text NOT NULL,
  snapshot_sku text NOT NULL,
  snapshot_epc text,
  snapshot_rfid_tag_id uuid REFERENCES public.inventory_rfid_tags(id) ON DELETE SET NULL,
  seen_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  seen_at timestamptz,
  resolution text CHECK (resolution IN ('found','still_missing')),
  resolved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  resolved_location_id uuid REFERENCES public.inventory_locations(id) ON DELETE SET NULL,
  resolution_movement_id uuid REFERENCES public.inventory_movements(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT stocktake_expected_session_fk FOREIGN KEY (session_id, tenant_id)
    REFERENCES public.stocktake_sessions (id, tenant_id) ON DELETE CASCADE,
  CONSTRAINT stocktake_expected_session_piece_key UNIQUE (session_id, piece_id),
  CONSTRAINT stocktake_expected_seen_chk CHECK (seen_by IS NULL OR seen_at IS NOT NULL),
  CONSTRAINT stocktake_expected_resolved_chk CHECK (resolution IS NULL OR resolved_at IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS stocktake_expected_session_idx
  ON public.stocktake_expected (session_id);
CREATE INDEX IF NOT EXISTS stocktake_expected_piece_idx
  ON public.stocktake_expected (piece_id);
CREATE INDEX IF NOT EXISTS stocktake_expected_unresolved_idx
  ON public.stocktake_expected (tenant_id) WHERE resolution = 'still_missing';

ALTER TABLE public.stocktake_expected ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stocktake_expected FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.stocktake_expected;
CREATE POLICY tenant_isolation ON public.stocktake_expected FOR ALL
  USING (tenant_id = public.current_tenant_id())
  WITH CHECK (tenant_id = public.current_tenant_id());
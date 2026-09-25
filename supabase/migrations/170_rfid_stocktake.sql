-- STATUS: APPLIED
-- Applied to staging on 2026-09-25 at 4:48 PM ACST, as migration 20260925071846.

CREATE TABLE IF NOT EXISTS public.stocktake_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES public.inventory_locations(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('in_progress','completed','cancelled')),
  started_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  finished_at timestamptz,
  confirmed_missing_piece_ids uuid[] NOT NULL DEFAULT '{}',
  confirmed_missing_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  confirmed_missing_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT stocktake_sessions_finished_chk
    CHECK (status = 'in_progress' OR finished_at IS NOT NULL),
  CONSTRAINT stocktake_sessions_id_tenant_key UNIQUE (id, tenant_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS stocktake_sessions_one_open_per_location
  ON public.stocktake_sessions (tenant_id, location_id) WHERE status = 'in_progress';
CREATE INDEX IF NOT EXISTS stocktake_sessions_tenant_started_idx
  ON public.stocktake_sessions (tenant_id, started_at DESC);

CREATE TABLE IF NOT EXISTS public.stocktake_scans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  session_id uuid NOT NULL,
  epc text NOT NULL,
  piece_id uuid REFERENCES public.inventory_pieces(id) ON DELETE SET NULL,
  result_group text NOT NULL
    CHECK (result_group IN ('found','wrong_location','unknown','not_in_stock')),
  scanned_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  scanned_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT stocktake_scans_session_fk FOREIGN KEY (session_id, tenant_id)
    REFERENCES public.stocktake_sessions (id, tenant_id) ON DELETE CASCADE,
  CONSTRAINT stocktake_scans_session_epc_key UNIQUE (session_id, epc)
);

CREATE INDEX IF NOT EXISTS stocktake_scans_session_result_idx
  ON public.stocktake_scans (session_id, result_group);
CREATE INDEX IF NOT EXISTS stocktake_scans_piece_idx
  ON public.stocktake_scans (piece_id) WHERE piece_id IS NOT NULL;

ALTER TABLE public.stocktake_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stocktake_sessions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.stocktake_scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stocktake_scans FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON public.stocktake_sessions;
CREATE POLICY tenant_isolation ON public.stocktake_sessions FOR ALL
  USING (tenant_id = public.current_tenant_id())
  WITH CHECK (tenant_id = public.current_tenant_id());

DROP POLICY IF EXISTS tenant_isolation ON public.stocktake_scans;
CREATE POLICY tenant_isolation ON public.stocktake_scans FOR ALL
  USING (tenant_id = public.current_tenant_id())
  WITH CHECK (tenant_id = public.current_tenant_id());

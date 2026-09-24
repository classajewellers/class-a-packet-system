-- 164: Reorder points slice A (bulk / quantity SKUs only)
--
-- STAGING ONLY until a later change is marked APPROVED FOR PRODUCTION.
-- Apply this file to the Vault staging database. Do not apply it to production
-- as part of this slice.
--
-- Bulk SKUs are inventory_product_variants with tracking_mode = 'quantity'
-- and on-hand in inventory_stock_levels. One-off pieces are out of scope.
--
-- Locked rules (approved 2026-09-24):
--   * Lead time is two fields per supplier: avg_lead_time_days and
--     max_lead_time_days. lead_time_days stays. Where it is set, it is copied
--     into avg_lead_time_days only.
--   * Sales are recorded from the moment this ships. There is no Shopify
--     history backfill. A Shopify line counts only when its variant id equals
--     inventory_product_variants.shopify_variant_id for the same tenant.
--   * Under 90 days since the variant's first ledger sale: state is
--     "collecting". Staff set a temporary manual reorder_point and a par_level.
--     reorder_point is that temporary manual number. It is not the calculated
--     reorder point.
--   * reorder_point_mode is 'manual' or 'calculated'. It defaults to manual.
--     Vault writes 'calculated' when trailing history reaches 90 days
--     (3 months). Staff cannot set this column. It is never switched back.
--   * Par level is always manual.
--   * Formula (units), once calculated and both lead times are set:
--       lead months      = lead days / 30
--       safety           = (max monthly sales × max lead months)
--                          − (avg monthly sales × avg lead months)
--       reorder point    = (avg monthly sales × avg lead months) + safety
--     Avg monthly sales = sum of ledger qty in the trailing 3 months, divided
--     by 3. Max monthly sales = highest calendar month in the trailing 12
--     months. Dividing days by 30 is the unit conversion that makes
--     "monthly sales × lead time" a stock quantity. Lead time is stored in days
--     because that is how suppliers already record it.
--   * When the variant is calculated and on-hand <= calculated reorder point,
--     Vault inserts a DRAFT purchase order to the default supplier for the qty
--     that brings on-hand up to par, minus qty already outstanding on a
--     non-cancelled PO line for this variant. Status stays 'draft'. Nothing
--     in this migration sends a PO.

-- ── 1. Supplier lead times ───────────────────────────────────────────────────

ALTER TABLE inventory_suppliers
  ADD COLUMN IF NOT EXISTS avg_lead_time_days integer,
  ADD COLUMN IF NOT EXISTS max_lead_time_days integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'inventory_suppliers_avg_lead_time_days_check'
  ) THEN
    ALTER TABLE inventory_suppliers
      ADD CONSTRAINT inventory_suppliers_avg_lead_time_days_check
      CHECK (avg_lead_time_days IS NULL OR avg_lead_time_days >= 0);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'inventory_suppliers_max_lead_time_days_check'
  ) THEN
    ALTER TABLE inventory_suppliers
      ADD CONSTRAINT inventory_suppliers_max_lead_time_days_check
      CHECK (max_lead_time_days IS NULL OR max_lead_time_days >= 0);
  END IF;
END $$;

COMMENT ON COLUMN inventory_suppliers.avg_lead_time_days IS
  'Average supplier lead time in days. Reorder formula converts days to months by dividing by 30.';
COMMENT ON COLUMN inventory_suppliers.max_lead_time_days IS
  'Maximum supplier lead time in days. Separate from the average. Reorder formula converts days to months by dividing by 30.';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'inventory_suppliers'
      AND column_name = 'lead_time_days'
  ) THEN
    UPDATE inventory_suppliers
    SET avg_lead_time_days = lead_time_days
    WHERE avg_lead_time_days IS NULL
      AND lead_time_days IS NOT NULL
      AND lead_time_days >= 0;
  END IF;
END $$;

-- ── 2. Variant replenishment fields ──────────────────────────────────────────

ALTER TABLE inventory_product_variants
  ADD COLUMN IF NOT EXISTS reorder_point integer;

ALTER TABLE inventory_product_variants
  ADD COLUMN IF NOT EXISTS supplier_id uuid REFERENCES inventory_suppliers(id) ON DELETE SET NULL;

-- Fold a previous draft column name into supplier_id, then drop it.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'inventory_product_variants'
      AND column_name = 'default_supplier_id'
  ) THEN
    UPDATE inventory_product_variants
    SET supplier_id = default_supplier_id
    WHERE supplier_id IS NULL
      AND default_supplier_id IS NOT NULL;
    ALTER TABLE inventory_product_variants DROP COLUMN default_supplier_id;
  END IF;
END $$;

ALTER TABLE inventory_product_variants
  ADD COLUMN IF NOT EXISTS par_level integer;

ALTER TABLE inventory_product_variants
  ADD COLUMN IF NOT EXISTS reorder_point_mode text NOT NULL DEFAULT 'manual';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'inventory_product_variants_reorder_point_check'
  ) THEN
    ALTER TABLE inventory_product_variants
      ADD CONSTRAINT inventory_product_variants_reorder_point_check
      CHECK (reorder_point IS NULL OR reorder_point >= 0);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'inventory_product_variants_par_level_check'
  ) THEN
    ALTER TABLE inventory_product_variants
      ADD CONSTRAINT inventory_product_variants_par_level_check
      CHECK (par_level IS NULL OR par_level >= 0);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'inventory_product_variants_reorder_point_mode_check'
  ) THEN
    ALTER TABLE inventory_product_variants
      ADD CONSTRAINT inventory_product_variants_reorder_point_mode_check
      CHECK (reorder_point_mode IN ('manual', 'calculated'));
  END IF;
END $$;

COMMENT ON COLUMN inventory_product_variants.reorder_point IS
  'Temporary MANUAL reorder point used only while this quantity-tracked variant is collecting sales history (under 90 days since the first ledger sale). After 90 days Vault uses the calculated reorder point from variant_reorder_snapshot and this column is not the active threshold. Null means no temporary threshold.';

COMMENT ON COLUMN inventory_product_variants.par_level IS
  'Manual target on-hand quantity. Always staff-set. Never calculated. A draft reorder PO orders enough to reach this level.';

COMMENT ON COLUMN inventory_product_variants.supplier_id IS
  'Preferred supplier. A draft reorder PO is raised against this supplier once reorder_point_mode is calculated.';

COMMENT ON COLUMN inventory_product_variants.reorder_point_mode IS
  'System-managed. manual while sales history is under 90 days; Vault sets calculated at 90 days and does not switch it back. Staff have no control for this column.';

CREATE INDEX IF NOT EXISTS inventory_product_variants_supplier_idx
  ON inventory_product_variants (supplier_id)
  WHERE supplier_id IS NOT NULL;

-- ── 3. Bulk sales ledger ─────────────────────────────────────────────────────
-- One row per quantity sale from today forward. This is the only input to
-- average and max monthly sales. It is not inventory_sales (that table is
-- one-off pieces).

CREATE TABLE IF NOT EXISTS inventory_variant_sales (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  variant_id  uuid        NOT NULL REFERENCES inventory_product_variants(id) ON DELETE CASCADE,
  quantity    integer     NOT NULL CHECK (quantity > 0),
  sold_at     timestamptz NOT NULL DEFAULT now(),
  source      text        NOT NULL DEFAULT 'app',
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  -- Optional. Shopify retries use this so the same line is not counted twice.
  external_id text
);

ALTER TABLE inventory_variant_sales ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE inventory_variant_sales ADD COLUMN IF NOT EXISTS external_id text;
ALTER TABLE inventory_variant_sales ALTER COLUMN source SET DEFAULT 'app';
ALTER TABLE inventory_variant_sales DROP CONSTRAINT IF EXISTS inventory_variant_sales_source_check;

COMMENT ON TABLE inventory_variant_sales IS
  'Quantity-tracked variant sales captured from the day this table ships. No historical backfill. source defaults to app. source=shopify only when the order line variant id matched shopify_variant_id.';

ALTER TABLE inventory_variant_sales ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_isolation" ON inventory_variant_sales;
CREATE POLICY "tenant_isolation" ON inventory_variant_sales
  FOR ALL USING (tenant_id = current_tenant_id());

CREATE INDEX IF NOT EXISTS inventory_variant_sales_monthly_idx
  ON inventory_variant_sales (tenant_id, variant_id, sold_at);

CREATE UNIQUE INDEX IF NOT EXISTS inventory_variant_sales_external_uidx
  ON inventory_variant_sales (tenant_id, source, external_id)
  WHERE external_id IS NOT NULL;

-- ── 4. PO lines can point at a quantity variant ──────────────────────────────
-- Additive. Piece lines leave variant_id null. Draft reorder lines set it so
-- an open unreceived line can be detected and not duplicated.

ALTER TABLE inventory_po_lines
  ADD COLUMN IF NOT EXISTS variant_id uuid REFERENCES inventory_product_variants(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS inventory_po_lines_variant_idx
  ON inventory_po_lines (tenant_id, variant_id)
  WHERE variant_id IS NOT NULL;

COMMENT ON COLUMN inventory_po_lines.variant_id IS
  'Set on draft reorder lines for a quantity-tracked variant. Piece lines leave this null.';

-- ── 5. Reorder point mode (system-managed) ───────────────────────────────────
-- Writes 'calculated' once the first ledger sale is 90 days old. Never writes
-- 'manual'. Staff updates of the variant row must not include this column.

CREATE OR REPLACE FUNCTION public.sync_reorder_point_mode(
  p_tenant  uuid,
  p_variant uuid
) RETURNS text
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_tracking text;
  v_mode     text;
  v_first    timestamptz;
BEGIN
  SELECT tracking_mode, reorder_point_mode
  INTO v_tracking, v_mode
  FROM inventory_product_variants
  WHERE id = p_variant AND tenant_id = p_tenant;

  IF NOT FOUND OR v_tracking IS DISTINCT FROM 'quantity' THEN
    RETURN COALESCE(v_mode, 'manual');
  END IF;

  IF v_mode = 'calculated' THEN
    RETURN 'calculated';
  END IF;

  SELECT MIN(sold_at) INTO v_first
  FROM inventory_variant_sales
  WHERE tenant_id = p_tenant AND variant_id = p_variant;

  IF v_first IS NOT NULL AND (CURRENT_DATE - v_first::date) >= 90 THEN
    UPDATE inventory_product_variants
    SET reorder_point_mode = 'calculated',
        updated_at = now()
    WHERE id = p_variant
      AND tenant_id = p_tenant
      AND reorder_point_mode IS DISTINCT FROM 'calculated';
    RETURN 'calculated';
  END IF;

  RETURN 'manual';
END;
$$;

COMMENT ON FUNCTION public.sync_reorder_point_mode(uuid, uuid) IS
  'Sets reorder_point_mode to calculated when trailing sales history reaches 90 days. Does not switch it back. Not a staff control.';

-- ── 6. Snapshot: collecting vs calculated ────────────────────────────────────
-- Calls sync_reorder_point_mode first, then reads the column.

CREATE OR REPLACE FUNCTION public.variant_reorder_snapshot(
  p_tenant  uuid,
  p_variant uuid
) RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_mode        text;
  v_rp_mode     text;
  v_manual      integer;
  v_par         integer;
  v_supplier    uuid;
  v_first       timestamptz;
  v_days        integer;
  v_state       text;
  v_on_hand     integer;
  v_avg_lead    integer;
  v_max_lead    integer;
  v_avg         numeric;
  v_max         numeric;
  v_safety      numeric;
  v_rop         numeric;
  v_rop_int     integer;
  v_effective   integer;
  v_block       text;
  v_supplier_ok boolean;
BEGIN
  PERFORM public.sync_reorder_point_mode(p_tenant, p_variant);

  SELECT tracking_mode, reorder_point_mode, reorder_point, par_level, supplier_id
  INTO v_mode, v_rp_mode, v_manual, v_par, v_supplier
  FROM inventory_product_variants
  WHERE id = p_variant AND tenant_id = p_tenant;

  IF NOT FOUND OR v_mode IS DISTINCT FROM 'quantity' THEN
    RETURN jsonb_build_object(
      'state', 'not_applicable',
      'reorder_point_mode', NULL,
      'history_days', 0,
      'history_days_required', 90,
      'on_hand', 0,
      'manual_reorder_point', NULL,
      'par_level', NULL,
      'supplier_id', NULL,
      'avg_lead_time_days', NULL,
      'max_lead_time_days', NULL,
      'avg_monthly_sales', NULL,
      'max_monthly_sales', NULL,
      'safety_stock', NULL,
      'calculated_reorder_point', NULL,
      'effective_reorder_point', NULL,
      'calc_block_reason', NULL
    );
  END IF;

  SELECT COALESCE(SUM(quantity), 0)::integer INTO v_on_hand
  FROM inventory_stock_levels
  WHERE tenant_id = p_tenant AND variant_id = p_variant;

  SELECT MIN(sold_at) INTO v_first
  FROM inventory_variant_sales
  WHERE tenant_id = p_tenant AND variant_id = p_variant;

  IF v_first IS NULL THEN
    v_days := 0;
  ELSE
    v_days := CURRENT_DATE - v_first::date;
  END IF;
  -- Mode is the column Vault writes. It is not a value the caller passes in.
  v_state := CASE WHEN v_rp_mode = 'calculated' THEN 'calculated' ELSE 'collecting' END;

  v_avg_lead := NULL;
  v_max_lead := NULL;
  v_supplier_ok := false;
  IF v_supplier IS NOT NULL THEN
    SELECT avg_lead_time_days, max_lead_time_days
    INTO v_avg_lead, v_max_lead
    FROM inventory_suppliers
    WHERE id = v_supplier AND tenant_id = p_tenant;
    v_supplier_ok := FOUND;
  END IF;

  v_avg := NULL;
  v_max := NULL;
  v_safety := NULL;
  v_rop_int := NULL;
  v_block := NULL;
  v_effective := CASE WHEN v_state = 'collecting' THEN v_manual ELSE NULL END;

  IF v_state = 'calculated' THEN
    SELECT COALESCE(SUM(quantity), 0) / 3.0 INTO v_avg
    FROM inventory_variant_sales
    WHERE tenant_id = p_tenant
      AND variant_id = p_variant
      AND sold_at >= now() - interval '3 months';

    SELECT COALESCE(MAX(month_qty), 0) INTO v_max
    FROM (
      SELECT SUM(quantity) AS month_qty
      FROM inventory_variant_sales
      WHERE tenant_id = p_tenant
        AND variant_id = p_variant
        AND sold_at >= now() - interval '12 months'
      GROUP BY date_trunc('month', sold_at)
    ) months;

    IF NOT v_supplier_ok THEN
      v_block := 'no_supplier';
    ELSIF v_avg_lead IS NULL OR v_max_lead IS NULL THEN
      v_block := 'missing_lead_time';
    ELSE
      -- Days / 30 so monthly sales × lead time is a quantity of units.
      v_safety := (v_max * (v_max_lead / 30.0)) - (v_avg * (v_avg_lead / 30.0));
      v_rop := (v_avg * (v_avg_lead / 30.0)) + v_safety;
      v_rop_int := GREATEST(0, ROUND(v_rop)::integer);
      v_effective := v_rop_int;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'state', v_state,
    'reorder_point_mode', v_rp_mode,
    'history_days', v_days,
    'history_days_required', 90,
    'on_hand', v_on_hand,
    'manual_reorder_point', v_manual,
    'par_level', v_par,
    'supplier_id', v_supplier,
    'avg_lead_time_days', v_avg_lead,
    'max_lead_time_days', v_max_lead,
    'avg_monthly_sales', CASE WHEN v_state = 'calculated' THEN ROUND(v_avg, 2) ELSE NULL END,
    'max_monthly_sales', CASE WHEN v_state = 'calculated' THEN ROUND(v_max, 2) ELSE NULL END,
    'safety_stock', CASE WHEN v_rop_int IS NOT NULL THEN ROUND(v_safety, 2) ELSE NULL END,
    'calculated_reorder_point', v_rop_int,
    'effective_reorder_point', v_effective,
    'calc_block_reason', v_block
  );
END;
$$;

COMMENT ON FUNCTION public.variant_reorder_snapshot(uuid, uuid) IS
  'Reorder state for one quantity variant. Switches reorder_point_mode to calculated at 90 days. Calculated reorder point stays null until that mode and a supplier with both lead times.';

-- ── 7. Sell quantity stock: ledger row + decrement on-hand ───────────────────
-- FIFO layers (inventory_stock_receipts.quantity_remaining) are consumed for
-- the units actually taken off the location. The ledger quantity is the units
-- sold. Shopify calls with p_strict = false so a linked sale is still recorded
-- when on-hand is short; the location is not taken below zero.
-- sold_at is always now() — this function cannot be used to backfill history.
-- source is 'app' for staff sales and 'shopify' for a linked order line.
-- A repeated (tenant, source, external_id) returns the existing row and does
-- not decrement again.

DROP FUNCTION IF EXISTS public.sell_quantity_stock(uuid, uuid, uuid, integer, text, text, uuid, boolean);

CREATE OR REPLACE FUNCTION public.sell_quantity_stock(
  p_tenant      uuid,
  p_variant     uuid,
  p_location    uuid,
  p_qty         integer,
  p_source      text,
  p_external_id text DEFAULT NULL,
  p_notes       text DEFAULT NULL,
  p_strict      boolean DEFAULT true
) RETURNS uuid
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_mode     text;
  v_existing uuid;
  v_sale_id  uuid;
  v_on_hand  integer;
  v_draw     integer;
  v_left     integer;
  v_take     integer;
  rec        record;
BEGIN
  IF p_qty IS NULL OR p_qty <= 0 THEN
    RAISE EXCEPTION 'Quantity sold must be a positive integer';
  END IF;
  IF p_source IS NULL OR p_source NOT IN ('app', 'shopify') THEN
    RAISE EXCEPTION 'Sale source must be app or shopify';
  END IF;

  SELECT tracking_mode INTO v_mode
  FROM inventory_product_variants
  WHERE id = p_variant AND tenant_id = p_tenant;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Variant not found';
  END IF;
  IF v_mode IS DISTINCT FROM 'quantity' THEN
    RAISE EXCEPTION 'Variant is not quantity-tracked';
  END IF;

  IF p_location IS NOT NULL THEN
    PERFORM 1 FROM inventory_locations WHERE id = p_location AND tenant_id = p_tenant;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Location not found';
    END IF;
  ELSIF COALESCE(p_strict, true) THEN
    RAISE EXCEPTION 'location is required';
  END IF;

  IF p_external_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(
      hashtext('variant-sale:' || p_tenant::text),
      hashtext(p_source || ':' || p_external_id)
    );
    SELECT id INTO v_existing
    FROM inventory_variant_sales
    WHERE tenant_id = p_tenant
      AND source = p_source
      AND external_id = p_external_id;
    IF v_existing IS NOT NULL THEN
      PERFORM public.sync_reorder_point_mode(p_tenant, p_variant);
      RETURN v_existing;
    END IF;
  END IF;

  IF p_location IS NOT NULL THEN
    SELECT quantity INTO v_on_hand
    FROM inventory_stock_levels
    WHERE tenant_id = p_tenant
      AND variant_id = p_variant
      AND location_id = p_location
    FOR UPDATE;

    IF COALESCE(p_strict, true) AND (v_on_hand IS NULL OR v_on_hand < p_qty) THEN
      RAISE EXCEPTION 'Insufficient stock at location (have %, need %)', COALESCE(v_on_hand, 0), p_qty;
    END IF;
  END IF;

  INSERT INTO inventory_variant_sales (
    tenant_id, variant_id, quantity, sold_at, source, notes, external_id
  ) VALUES (
    p_tenant, p_variant, p_qty, now(), p_source, NULLIF(btrim(p_notes), ''), NULLIF(btrim(p_external_id), '')
  )
  RETURNING id INTO v_sale_id;

  IF p_location IS NOT NULL THEN
    v_draw := LEAST(COALESCE(v_on_hand, 0), p_qty);
    IF v_draw > 0 THEN
      UPDATE inventory_stock_levels
      SET quantity = quantity - v_draw, updated_at = now()
      WHERE tenant_id = p_tenant
        AND variant_id = p_variant
        AND location_id = p_location;

      v_left := v_draw;
      FOR rec IN
        SELECT id, quantity_remaining
        FROM inventory_stock_receipts
        WHERE tenant_id = p_tenant
          AND variant_id = p_variant
          AND location_id = p_location
          AND quantity_remaining > 0
        ORDER BY seq
        FOR UPDATE
      LOOP
        EXIT WHEN v_left <= 0;
        v_take := LEAST(rec.quantity_remaining, v_left);
        UPDATE inventory_stock_receipts
        SET quantity_remaining = quantity_remaining - v_take
        WHERE id = rec.id;
        v_left := v_left - v_take;
      END LOOP;
    END IF;
  END IF;

  PERFORM public.sync_reorder_point_mode(p_tenant, p_variant);
  RETURN v_sale_id;
END;
$$;

COMMENT ON FUNCTION public.sell_quantity_stock(uuid, uuid, uuid, integer, text, text, text, boolean) IS
  'Record a quantity-variant sale (sold_at = now(), source app or shopify) and decrement inventory_stock_levels. Does not backfill. Repeated external_id is a no-op.';

-- ── 8. Draft reorder PO (never sent) ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.maybe_create_reorder_draft_po(
  p_tenant  uuid,
  p_variant uuid
) RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  snap             jsonb;
  v_state          text;
  v_rop            integer;
  v_on_hand        integer;
  v_par            integer;
  v_supplier       uuid;
  v_avg_lead       integer;
  v_needed         integer;
  v_covered        integer;
  v_qty            integer;
  v_year           integer;
  v_prefix         text;
  v_seq            integer;
  v_po_number      text;
  v_po_id          uuid;
  v_supplier_name  text;
  v_title          text;
  v_expected       date;
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtext('reorder-draft:' || p_tenant::text),
    hashtext(p_variant::text)
  );

  snap := public.variant_reorder_snapshot(p_tenant, p_variant);
  v_state := snap->>'state';

  IF v_state IS DISTINCT FROM 'calculated' THEN
    RETURN jsonb_build_object(
      'purchase_order_id', NULL, 'po_number', NULL, 'quantity', NULL,
      'skipped', COALESCE(v_state, 'not_applicable')
    );
  END IF;

  IF (snap->>'calculated_reorder_point') IS NULL THEN
    RETURN jsonb_build_object(
      'purchase_order_id', NULL, 'po_number', NULL, 'quantity', NULL,
      'skipped', 'reorder_point_unavailable'
    );
  END IF;

  v_rop := (snap->>'calculated_reorder_point')::integer;
  v_on_hand := COALESCE((snap->>'on_hand')::integer, 0);

  IF v_on_hand > v_rop THEN
    RETURN jsonb_build_object(
      'purchase_order_id', NULL, 'po_number', NULL, 'quantity', NULL,
      'skipped', 'above_reorder_point'
    );
  END IF;

  IF (snap->>'par_level') IS NULL THEN
    RETURN jsonb_build_object(
      'purchase_order_id', NULL, 'po_number', NULL, 'quantity', NULL,
      'skipped', 'no_par'
    );
  END IF;
  v_par := (snap->>'par_level')::integer;

  IF (snap->>'supplier_id') IS NULL THEN
    RETURN jsonb_build_object(
      'purchase_order_id', NULL, 'po_number', NULL, 'quantity', NULL,
      'skipped', 'no_supplier'
    );
  END IF;
  v_supplier := (snap->>'supplier_id')::uuid;

  v_needed := v_par - v_on_hand;
  IF v_needed <= 0 THEN
    RETURN jsonb_build_object(
      'purchase_order_id', NULL, 'po_number', NULL, 'quantity', NULL,
      'skipped', 'at_or_above_par'
    );
  END IF;

  SELECT COALESCE(SUM(
    CASE
      WHEN COALESCE(l.received, false) THEN 0
      ELSE GREATEST(l.quantity - COALESCE(l.received_quantity, 0), 0)
    END
  ), 0)::integer
  INTO v_covered
  FROM inventory_po_lines l
  JOIN inventory_purchase_orders po
    ON po.id = l.po_id AND po.tenant_id = p_tenant
  WHERE l.tenant_id = p_tenant
    AND l.variant_id = p_variant
    AND po.status IS DISTINCT FROM 'cancelled';

  IF v_covered >= v_needed THEN
    RETURN jsonb_build_object(
      'purchase_order_id', NULL, 'po_number', NULL, 'quantity', NULL,
      'skipped', 'covered'
    );
  END IF;

  v_qty := v_needed - v_covered;

  SELECT name, avg_lead_time_days
  INTO v_supplier_name, v_avg_lead
  FROM inventory_suppliers
  WHERE id = v_supplier AND tenant_id = p_tenant;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'purchase_order_id', NULL, 'po_number', NULL, 'quantity', NULL,
      'skipped', 'no_supplier'
    );
  END IF;

  v_expected := CASE
    WHEN v_avg_lead IS NOT NULL THEN CURRENT_DATE + v_avg_lead
    ELSE NULL
  END;

  SELECT COALESCE(
    NULLIF(btrim(name), ''),
    NULLIF(btrim(concat_ws(' ', metal_karat, metal_colour)), ''),
    'Quantity variant'
  )
  INTO v_title
  FROM inventory_product_variants
  WHERE id = p_variant AND tenant_id = p_tenant;

  PERFORM pg_advisory_xact_lock(
    hashtext('po-number:' || p_tenant::text),
    hashtext('PO')
  );

  v_year := EXTRACT(YEAR FROM CURRENT_DATE)::integer;
  v_prefix := 'PO-' || v_year::text || '-';

  SELECT COALESCE(MAX(
    CASE
      WHEN substring(po_number FROM char_length(v_prefix) + 1) ~ '^[0-9]+$'
      THEN substring(po_number FROM char_length(v_prefix) + 1)::integer
      ELSE 0
    END
  ), 0)
  INTO v_seq
  FROM inventory_purchase_orders
  WHERE tenant_id = p_tenant
    AND po_number LIKE v_prefix || '%';

  v_po_number := v_prefix || lpad((v_seq + 1)::text, 4, '0');

  INSERT INTO inventory_purchase_orders (
    tenant_id, po_number, supplier_id, supplier_name,
    order_date, expected_date, notes, status, updated_at
  ) VALUES (
    p_tenant,
    v_po_number,
    v_supplier,
    v_supplier_name,
    CURRENT_DATE,
    v_expected,
    'Automatic draft. On-hand is at or below the calculated reorder point. Review this purchase order before sending — Vault will not send it.',
    'draft',
    now()
  )
  RETURNING id INTO v_po_id;

  INSERT INTO inventory_po_lines (
    tenant_id, po_id, variant_id, title, quantity, notes, received, received_quantity
  ) VALUES (
    p_tenant,
    v_po_id,
    p_variant,
    v_title,
    v_qty,
    'Quantity-tracked variant ' || p_variant::text
      || '. Quantity brings on-hand up to par level ' || v_par::text
      || ' after ' || v_covered::text || ' already on open purchase orders.',
    false,
    0
  );

  RETURN jsonb_build_object(
    'purchase_order_id', v_po_id,
    'po_number', v_po_number,
    'quantity', v_qty,
    'skipped', NULL
  );
END;
$$;

COMMENT ON FUNCTION public.maybe_create_reorder_draft_po(uuid, uuid) IS
  'Insert a draft PO when a calculated quantity variant is at or below its reorder point. Never sets status to ordered and never sends.';

-- ── 9. Low-stock view follows the active threshold ───────────────────────────
-- Serialized designs keep the manual product reorder_point from migration 141.
-- Quantity variants use effective_reorder_point: the temporary manual column
-- while collecting, the calculated number once history reaches 90 days.

CREATE OR REPLACE VIEW public.inventory_low_stock AS
  SELECT
    'product'::text AS item_type,
    p.id             AS item_id,
    p.tenant_id,
    p.name           AS item_name,
    p.reorder_point,
    COUNT(ip.id) FILTER (WHERE ip.status = 'in_stock') AS current_quantity
  FROM inventory_products p
  LEFT JOIN inventory_pieces ip ON ip.product_id = p.id
  WHERE p.reorder_point IS NOT NULL
  GROUP BY p.id, p.tenant_id, p.name, p.reorder_point
  HAVING COUNT(ip.id) FILTER (WHERE ip.status = 'in_stock') <= p.reorder_point

  UNION ALL

  SELECT
    'variant'::text AS item_type,
    v.id             AS item_id,
    v.tenant_id,
    COALESCE(
      NULLIF(btrim(v.name), ''),
      NULLIF(btrim(concat_ws(' ', v.metal_karat, v.metal_colour)), ''),
      'Quantity variant'
    ) AS item_name,
    (snap->>'effective_reorder_point')::integer AS reorder_point,
    (snap->>'on_hand')::bigint AS current_quantity
  FROM inventory_product_variants v
  CROSS JOIN LATERAL public.variant_reorder_snapshot(v.tenant_id, v.id) AS snap
  WHERE v.tracking_mode = 'quantity'
    AND (snap->>'effective_reorder_point') IS NOT NULL
    AND (snap->>'on_hand')::bigint <= (snap->>'effective_reorder_point')::integer;

ALTER VIEW public.inventory_low_stock SET (security_invoker = true);

-- ── 10. Functions are service-role only ──────────────────────────────────────
-- Same PUBLIC-grant gotcha as migration 155: a new function is executable by
-- anon/authenticated through PUBLIC unless PUBLIC is revoked.

DO $$
DECLARE
  fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.sell_quantity_stock(uuid, uuid, uuid, integer, text, text, text, boolean)',
    'public.variant_reorder_snapshot(uuid, uuid)',
    'public.sync_reorder_point_mode(uuid, uuid)',
    'public.maybe_create_reorder_draft_po(uuid, uuid)'
  ]
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', fn);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', fn);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', fn);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
    END IF;
  END LOOP;
END $$;

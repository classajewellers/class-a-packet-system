-- 040_fix_counter_rpcs_tenant_id.sql
--
-- daily_counters.tenant_id was made NOT NULL in migration 035, but the counter
-- RPCs (created in 001, 007, 008) still INSERT without tenant_id — causing every
-- reference number generation to fail with a NOT NULL constraint violation.
--
-- Fix: redefine all three counter RPCs to include tenant_id in the INSERT.
-- The Class A tenant ID is hardcoded because daily_counters uses `date` as its
-- primary key (one row per date, shared across tenants for now). When per-tenant
-- counters are needed a future migration can change the PK to (date, tenant_id).

-- Class A tenant ID constant (same as SHOPIFY_TENANT_ID / CLASSA_TENANT_ID in app code)
DO $$ BEGIN
  PERFORM set_config('app.classa_tenant_id', '00000000-0000-0000-0000-000000000001', false);
END $$;

-- ── increment_packet_counter ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION increment_packet_counter(input_date date)
RETURNS int
LANGUAGE plpgsql
AS $$
DECLARE
  new_count int;
BEGIN
  INSERT INTO daily_counters (date, tenant_id, packet_count)
  VALUES (input_date, '00000000-0000-0000-0000-000000000001', 1)
  ON CONFLICT (date) DO UPDATE
    SET packet_count = daily_counters.packet_count + 1
  RETURNING packet_count INTO new_count;

  RETURN new_count;
END;
$$;

-- ── increment_online_order_counter ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION increment_online_order_counter(input_date date)
RETURNS int
LANGUAGE sql
AS $$
  INSERT INTO daily_counters (date, tenant_id, packet_count, online_order_count)
  VALUES (input_date, '00000000-0000-0000-0000-000000000001', 0, 1)
  ON CONFLICT (date) DO UPDATE
    SET online_order_count = daily_counters.online_order_count + 1
  RETURNING daily_counters.online_order_count;
$$;

-- ── increment_quote_counter ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION increment_quote_counter(input_date date)
RETURNS int
LANGUAGE sql
AS $$
  INSERT INTO daily_counters (date, tenant_id, packet_count, quote_count)
  VALUES (input_date, '00000000-0000-0000-0000-000000000001', 0, 1)
  ON CONFLICT (date) DO UPDATE
    SET quote_count = daily_counters.quote_count + 1
  RETURNING daily_counters.quote_count;
$$;

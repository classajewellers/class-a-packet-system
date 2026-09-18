-- -----------------------------------------------------------------------------
-- 125: pricing_metal_rates tenant_id catch-up (staging drift)
--
-- Discovered while running the real Phase 1 calculate_price() melee test:
-- the RPC call failed with:
--   {"code":"42703","message":"column \"tenant_id\" does not exist"}
-- Direct inspection confirmed pricing_metal_rates on staging has NO
-- tenant_id column at all - just id, metal_type, price_per_gram, updated_at
-- (the original 016 shape). calculate_price() (both the pre-existing 097
-- definition and this session's 124 rewrite) filters on
-- "WHERE tenant_id = p_tenant_id", so every mode fails before it can even
-- reach metal, labour, stone, or melee pricing.
--
-- This is the exact gap migration 121's own trailing comment flagged months
-- ago as a known, separate, deferred issue:
--   "pricing_metal_rates and presumably other pricing-engine tables also
--    lack tenant_id on staging (migration 097 never landed there either).
--    This migration does not touch pricing_metal_rates - flagging for a
--    separate staging/prod drift audit."
-- That audit is this migration. Migration 097 already defines the correct
-- target shape (tenant_id added, backfilled to Class A, unique on
-- (tenant_id, metal_type), indexed, RLS enabled with a tenant_isolation
-- policy) - 097 simply never actually ran against staging. This migration
-- is a self-contained, idempotent replay of ONLY 097's pricing_metal_rates
-- section (not its calculate_price() redefinition, which 123/124 have
-- already superseded), safe to run regardless of whether 097 partially or
-- fully applied.
--
-- NOTE: 097 turned RLS ON for this one table with a tenant_isolation policy
-- (current_tenant_id() = tenant_id), which is inconsistent with this
-- project's general convention that "Row Level Security is disabled on all
-- tables; tenancy is enforced in application code" (see CLAUDE.md). That
-- inconsistency is 097's original decision, not something this catch-up
-- migration is introducing or fixing - replaying it faithfully keeps
-- staging's behaviour consistent with whatever production already has
-- (production's real pricing_component_rules data suggests 097 already
-- fully landed there). Flagging this for the same later RLS review Josh
-- already queued (staff_pins, pricing_melee_stones, customer_appointments,
-- attachments, sapphire_stock) rather than deciding it here.
--
-- Safe to re-run (IF NOT EXISTS / IF EXISTS / ON CONFLICT guards throughout).
-- -----------------------------------------------------------------------------

-- -- PIECE 1 OF 1: run this single block --------------------------------------

ALTER TABLE pricing_metal_rates
  ADD COLUMN IF NOT EXISTS tenant_id uuid;

UPDATE pricing_metal_rates
  SET tenant_id = '00000000-0000-0000-0000-000000000001'
  WHERE tenant_id IS NULL;

ALTER TABLE pricing_metal_rates
  ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE pricing_metal_rates
  DROP CONSTRAINT IF EXISTS pricing_metal_rates_metal_type_key;
ALTER TABLE pricing_metal_rates
  DROP CONSTRAINT IF EXISTS pricing_metal_rates_tenant_metal_key;
ALTER TABLE pricing_metal_rates
  ADD CONSTRAINT pricing_metal_rates_tenant_metal_key UNIQUE (tenant_id, metal_type);

CREATE INDEX IF NOT EXISTS pricing_metal_rates_tenant_idx
  ON pricing_metal_rates (tenant_id);

ALTER TABLE pricing_metal_rates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_isolation" ON pricing_metal_rates;
CREATE POLICY "tenant_isolation" ON pricing_metal_rates
  FOR ALL USING (tenant_id = current_tenant_id());

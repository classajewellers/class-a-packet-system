-- -----------------------------------------------------------------------------
-- 132: stone-tier restructure - cost-based multipliers replace carat-based
--
-- Confirmed by Josh: multiplier tiers should track a stone's landed wholesale
-- cost, not its carat weight, matching how Louise Jean and Blue Nile actually
-- price (competitor research). This is a real, final, signed-off data set -
-- NOT another provisional TODO(pricing-signoff) placeholder like the original
-- carat-based tiers seeded in 123_calculate_price_schema_catchup.sql.
--
-- Schema approach: ADD cost_min/cost_max columns rather than replacing
-- carat_min/carat_max in place. The old carat-based rows are left untouched
-- (deprecated, not dropped) - same "leave it in place, don't destructively
-- remove" convention used throughout this project (e.g. supplier_id after
-- migration 121's no-supplier rework). calculate_price() itself is updated
-- in migration 133 to read cost_min/cost_max instead of carat_min/carat_max;
-- this migration is schema + data only.
--
-- New tier rows use entirely different boundaries and counts than the old
-- carat-based rows (9 cost tiers for lab vs 6 carat tiers; 10 cost tiers for
-- natural vs 3 carat tiers), so they cannot reuse the same rows - they are
-- new INSERTs, coexisting with (not replacing) the old carat-based rows.
--
-- Unique constraint: the existing UNIQUE(tenant_id, component_type, carat_min)
-- would collide, since every new row would default carat_min to 0 (this
-- column becomes vestigial for lab_stone/natural_stone going forward - kept
-- only because it is NOT NULL with no sensible per-row value anymore).
-- Replaced with UNIQUE(tenant_id, component_type, cost_min) instead. This is
-- safe for old rows too: standard SQL UNIQUE semantics treat NULL as
-- distinct from every other NULL, so the old carat-based rows (cost_min NULL)
-- never collide with each other or with the new cost-based rows under the
-- new constraint.
--
-- No catch-all row is seeded above the highest priced tier (lab: $75,000+,
-- natural: $200,000+) - deliberately. calculate_price() (migration 133)
-- treats "no matching tier row found" as the explicit "no_price" signal,
-- the same way melee already reports melee_status:'no_price' when no
-- pricing_melee_stones row matches - no phantom row with a NULL multiplier
-- needed, no silent fallback multiplier either.
--
-- Safe to re-run (ADD COLUMN IF NOT EXISTS; the constraint-swap DO block is
-- idempotent - it discovers and drops whatever unique constraint currently
-- covers carat_min, so a second run finds nothing left to drop; the seed
-- INSERTs use ON CONFLICT DO NOTHING against the new constraint).
-- -----------------------------------------------------------------------------

ALTER TABLE pricing_component_rules ADD COLUMN IF NOT EXISTS cost_min numeric(10,2);
ALTER TABLE pricing_component_rules ADD COLUMN IF NOT EXISTS cost_max numeric(10,2);

-- Drop the old carat_min-based unique constraint (by discovering its real
-- name rather than assuming it, same pattern as migration 121's quality-map
-- constraint swap) and replace with one on cost_min.
DO $$
DECLARE
  c text;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'pricing_component_rules'::regclass
      AND contype = 'u'
      AND conname LIKE '%carat_min%'
  LOOP
    EXECUTE format('ALTER TABLE pricing_component_rules DROP CONSTRAINT %I', c);
  END LOOP;
END $$;

ALTER TABLE pricing_component_rules
  DROP CONSTRAINT IF EXISTS pricing_component_rules_tenant_type_cost_min_key;
ALTER TABLE pricing_component_rules
  ADD CONSTRAINT pricing_component_rules_tenant_type_cost_min_key
    UNIQUE (tenant_id, component_type, cost_min);

-- ── LAB stone tiers - real, confirmed, cost-based (Louise Jean / Blue Nile
-- competitor research). Signed off by Josh - not provisional. ─────────────
INSERT INTO pricing_component_rules (tenant_id, component_type, carat_min, cost_min, cost_max, multiplier, notes) VALUES
  ('00000000-0000-0000-0000-000000000001', 'lab_stone', 0, 0,     1000,  8.48, 'Confirmed cost-based tier - Louise Jean/Blue Nile competitor research, signed off by Josh 2026-09-17'),
  ('00000000-0000-0000-0000-000000000001', 'lab_stone', 0, 1000,  2000,  6.19, 'Confirmed cost-based tier - Louise Jean/Blue Nile competitor research, signed off by Josh 2026-09-17'),
  ('00000000-0000-0000-0000-000000000001', 'lab_stone', 0, 2000,  3000,  4.92, 'Confirmed cost-based tier - Louise Jean/Blue Nile competitor research, signed off by Josh 2026-09-17'),
  ('00000000-0000-0000-0000-000000000001', 'lab_stone', 0, 3000,  5000,  4.43, 'Confirmed cost-based tier - Louise Jean/Blue Nile competitor research, signed off by Josh 2026-09-17'),
  ('00000000-0000-0000-0000-000000000001', 'lab_stone', 0, 5000,  12500, 2.64, 'Confirmed cost-based tier - Louise Jean/Blue Nile competitor research, signed off by Josh 2026-09-17'),
  ('00000000-0000-0000-0000-000000000001', 'lab_stone', 0, 12500, 20000, 1.78, 'Confirmed cost-based tier - Louise Jean/Blue Nile competitor research, signed off by Josh 2026-09-17'),
  ('00000000-0000-0000-0000-000000000001', 'lab_stone', 0, 20000, 25000, 1.16, 'Confirmed cost-based tier - Louise Jean/Blue Nile competitor research, signed off by Josh 2026-09-17'),
  ('00000000-0000-0000-0000-000000000001', 'lab_stone', 0, 25000, 50000, 1.16, 'Confirmed cost-based tier - Louise Jean/Blue Nile competitor research, signed off by Josh 2026-09-17'),
  ('00000000-0000-0000-0000-000000000001', 'lab_stone', 0, 50000, 75000, 1.17, 'Confirmed cost-based tier - Louise Jean/Blue Nile competitor research, signed off by Josh 2026-09-17')
ON CONFLICT (tenant_id, component_type, cost_min) DO NOTHING;

-- ── NATURAL stone tiers - real, confirmed, cost-based. ──────────────────────
INSERT INTO pricing_component_rules (tenant_id, component_type, carat_min, cost_min, cost_max, multiplier, notes) VALUES
  ('00000000-0000-0000-0000-000000000001', 'natural_stone', 0, 0,      1000,   2.59, 'Confirmed cost-based tier - Louise Jean/Blue Nile competitor research, signed off by Josh 2026-09-17'),
  ('00000000-0000-0000-0000-000000000001', 'natural_stone', 0, 1000,   5000,   2.24, 'Confirmed cost-based tier - Louise Jean/Blue Nile competitor research, signed off by Josh 2026-09-17'),
  ('00000000-0000-0000-0000-000000000001', 'natural_stone', 0, 5000,   10000,  1.79, 'Confirmed cost-based tier - Louise Jean/Blue Nile competitor research, signed off by Josh 2026-09-17'),
  ('00000000-0000-0000-0000-000000000001', 'natural_stone', 0, 10000,  20000,  1.33, 'Confirmed cost-based tier - Louise Jean/Blue Nile competitor research, signed off by Josh 2026-09-17'),
  ('00000000-0000-0000-0000-000000000001', 'natural_stone', 0, 20000,  30000,  1.34, 'Confirmed cost-based tier - Louise Jean/Blue Nile competitor research, signed off by Josh 2026-09-17'),
  ('00000000-0000-0000-0000-000000000001', 'natural_stone', 0, 30000,  50000,  1.12, 'Confirmed cost-based tier - Louise Jean/Blue Nile competitor research, signed off by Josh 2026-09-17'),
  ('00000000-0000-0000-0000-000000000001', 'natural_stone', 0, 50000,  75000,  1.12, 'Confirmed cost-based tier - Louise Jean/Blue Nile competitor research, signed off by Josh 2026-09-17'),
  ('00000000-0000-0000-0000-000000000001', 'natural_stone', 0, 75000,  100000, 1.08, 'Confirmed cost-based tier - Louise Jean/Blue Nile competitor research, signed off by Josh 2026-09-17'),
  ('00000000-0000-0000-0000-000000000001', 'natural_stone', 0, 100000, 150000, 1.08, 'Confirmed cost-based tier - Louise Jean/Blue Nile competitor research, signed off by Josh 2026-09-17'),
  ('00000000-0000-0000-0000-000000000001', 'natural_stone', 0, 150000, 200000, 1.06, 'Confirmed cost-based tier - Louise Jean/Blue Nile competitor research, signed off by Josh 2026-09-17')
ON CONFLICT (tenant_id, component_type, cost_min) DO NOTHING;

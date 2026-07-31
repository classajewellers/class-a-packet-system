-- ============================================================
-- 074_merge_discount_tiers.sql
-- Merge discount_tiers into vip_tier_config as manual_only tiers.
-- Adds manager-approved tier override mechanism on customers.
-- Adds vip_tier_id on quotes (replaces discount_tier_id — kept until 075).
-- ============================================================

-- ── 1. Extend vip_tier_config ─────────────────────────────────────────────────
ALTER TABLE vip_tier_config ADD COLUMN IF NOT EXISTS discount_percent      numeric  DEFAULT 0;
ALTER TABLE vip_tier_config ADD COLUMN IF NOT EXISTS eligible_ownership_only boolean DEFAULT false;
ALTER TABLE vip_tier_config ADD COLUMN IF NOT EXISTS manual_only           boolean  DEFAULT false;

-- ── 2. Manager override columns on customers ──────────────────────────────────
ALTER TABLE customers ADD COLUMN IF NOT EXISTS tier_override_id           uuid REFERENCES vip_tier_config(id);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS tier_override_approved_by  uuid REFERENCES profiles(id);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS tier_override_approved_at  timestamptz;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS tier_override_note         text;

-- ── 3. Transition column on quotes ────────────────────────────────────────────
-- quotes.discount_tier_id (FK to discount_tiers) stays until migration 075.
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS vip_tier_id uuid REFERENCES vip_tier_config(id);

-- ── 4. Migrate discount_tiers rows into vip_tier_config as manual_only ────────
INSERT INTO vip_tier_config (
  tenant_id, tier_name, tier_order, min_spend, min_orders,
  colour, discount_percent, eligible_ownership_only, manual_only
)
SELECT
  tenant_id,
  name                           AS tier_name,
  100 + ROW_NUMBER() OVER (
    PARTITION BY tenant_id ORDER BY name
  )                              AS tier_order,
  999999999                      AS min_spend,
  999999                         AS min_orders,
  '#9333EA'                      AS colour,
  discount_percent,
  eligible_ownership_only,
  true                           AS manual_only
FROM discount_tiers
ON CONFLICT (tenant_id, tier_name) DO NOTHING;

-- ── 5. Migrate existing customer.discount_tier_id → tier_override_id ─────────
-- (Investigation confirmed no rows have this set in prod, but handled correctly.)
UPDATE customers c
SET tier_override_id = (
  SELECT v.id
  FROM vip_tier_config v
  WHERE v.tenant_id = c.tenant_id
    AND v.manual_only = true
    AND v.tier_name = (
      SELECT d.name FROM discount_tiers d WHERE d.id = c.discount_tier_id
    )
)
WHERE c.discount_tier_id IS NOT NULL;

-- ── 6. Migrate existing quotes.discount_tier_id → quotes.vip_tier_id ─────────
UPDATE quotes q
SET vip_tier_id = (
  SELECT v.id
  FROM vip_tier_config v
  JOIN discount_tiers d ON d.name = v.tier_name AND d.tenant_id = v.tenant_id
  WHERE v.manual_only = true
    AND d.id = q.discount_tier_id
)
WHERE q.discount_tier_id IS NOT NULL;

-- discount_tiers table and customers.discount_tier_id / quotes.discount_tier_id
-- are intentionally NOT dropped here — see migration 075 after end-to-end verification.

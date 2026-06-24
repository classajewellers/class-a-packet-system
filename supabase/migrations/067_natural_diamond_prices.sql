-- Migration 067: unified natural diamond pricing via RapNet grid
-- Replaces rapaport_prices with natural_diamond_prices (per-shape, actual USD/ct).
-- Prices stored as real USD/ct; no discount factor — price IS the buy price.

CREATE TABLE IF NOT EXISTS natural_diamond_prices (
  id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID          NOT NULL,
  shape        TEXT          NOT NULL,
  size_from    NUMERIC(6,2)  NOT NULL,
  size_to      NUMERIC(6,2)  NOT NULL,
  colour_group TEXT          NOT NULL,
  clarity      TEXT          NOT NULL,
  price_per_ct NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

ALTER TABLE natural_diamond_prices DISABLE ROW LEVEL SECURITY;

ALTER TABLE natural_diamond_prices ADD COLUMN IF NOT EXISTS price_per_ct NUMERIC(10,2) NOT NULL DEFAULT 0;
ALTER TABLE natural_diamond_prices ADD COLUMN IF NOT EXISTS created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW();
ALTER TABLE natural_diamond_prices ADD COLUMN IF NOT EXISTS updated_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS natural_diamond_prices_tenant_idx ON natural_diamond_prices (tenant_id);

ALTER TABLE natural_diamond_prices DROP CONSTRAINT IF EXISTS natural_diamond_prices_uq;
ALTER TABLE natural_diamond_prices ADD CONSTRAINT natural_diamond_prices_uq
  UNIQUE (tenant_id, shape, size_from, size_to, colour_group, clarity);

-- Remove old stone pricing rapaport tenant columns
-- Note: rapaport_prices table is retained for the pricing-hub module (migration 049)
ALTER TABLE tenants DROP COLUMN IF EXISTS rapaport_discount_percent;
ALTER TABLE tenants DROP COLUMN IF EXISTS rapaport_currency_rate;

-- Currency rate for USD→AUD conversion (used by all stone pricing)
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS stone_currency_rate NUMERIC(8,4) NOT NULL DEFAULT 1.538;

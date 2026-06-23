-- Migration 066: Rapaport natural diamond price matrix
-- Stores per-tenant Rapaport list prices (hundreds of USD/ct).
-- Discount % and currency rate live on the tenants table.

CREATE TABLE IF NOT EXISTS rapaport_prices (
  id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID          NOT NULL,
  size_from    NUMERIC(6,2)  NOT NULL,
  size_to      NUMERIC(6,2)  NOT NULL,
  colour       TEXT          NOT NULL,
  clarity      TEXT          NOT NULL,
  price_per_ct NUMERIC(10,2) NOT NULL,
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

ALTER TABLE rapaport_prices DISABLE ROW LEVEL SECURITY;

-- Required by idempotent ADD COLUMN pattern
ALTER TABLE rapaport_prices ADD COLUMN IF NOT EXISTS price_per_ct NUMERIC(10,2) NOT NULL DEFAULT 0;
ALTER TABLE rapaport_prices ADD COLUMN IF NOT EXISTS created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW();
ALTER TABLE rapaport_prices ADD COLUMN IF NOT EXISTS updated_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS rapaport_prices_tenant_idx ON rapaport_prices (tenant_id);

ALTER TABLE rapaport_prices DROP CONSTRAINT IF EXISTS rapaport_prices_tenant_size_colour_clarity_key;
ALTER TABLE rapaport_prices ADD CONSTRAINT rapaport_prices_tenant_size_colour_clarity_key
  UNIQUE (tenant_id, size_from, size_to, colour, clarity);

-- Tenant-level Rapaport settings
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS rapaport_discount_percent NUMERIC(5,2) NOT NULL DEFAULT 0;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS rapaport_currency_rate    NUMERIC(8,4) NOT NULL DEFAULT 1.538;

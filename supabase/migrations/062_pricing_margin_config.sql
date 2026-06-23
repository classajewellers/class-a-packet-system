-- 062_pricing_margin_config.sql
-- Per-category margin and labour rate configuration per tenant

CREATE TABLE IF NOT EXISTS pricing_margin_config (
  id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID         NOT NULL,
  category       TEXT         NOT NULL,
  margin_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
  hourly_rate    NUMERIC(10,2),
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

ALTER TABLE pricing_margin_config DISABLE ROW LEVEL SECURITY;

-- Safety: add columns for any partial prior migrations
ALTER TABLE pricing_margin_config ADD COLUMN IF NOT EXISTS margin_percent NUMERIC(5,2) NOT NULL DEFAULT 0;
ALTER TABLE pricing_margin_config ADD COLUMN IF NOT EXISTS hourly_rate    NUMERIC(10,2);
ALTER TABLE pricing_margin_config ADD COLUMN IF NOT EXISTS created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE pricing_margin_config ADD COLUMN IF NOT EXISTS updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Index for tenant-scoped lookups
CREATE INDEX IF NOT EXISTS pricing_margin_config_tenant_idx
  ON pricing_margin_config (tenant_id);

-- Unique constraint required for upsert on (tenant_id, category)
ALTER TABLE pricing_margin_config
  DROP CONSTRAINT IF EXISTS pricing_margin_config_tenant_category_key;
ALTER TABLE pricing_margin_config
  ADD CONSTRAINT pricing_margin_config_tenant_category_key
  UNIQUE (tenant_id, category);

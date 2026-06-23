-- 063_stone_pricing.sql
-- Stone pricing engine: base prices, colour/clarity adjustments, carat multipliers

-- ── stone_base_prices ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS stone_base_prices (
  id                   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID         NOT NULL,
  stone_type           TEXT         NOT NULL,
  base_price_per_carat NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
ALTER TABLE stone_base_prices DISABLE ROW LEVEL SECURITY;
ALTER TABLE stone_base_prices ADD COLUMN IF NOT EXISTS stone_type           TEXT;
ALTER TABLE stone_base_prices ADD COLUMN IF NOT EXISTS base_price_per_carat NUMERIC(10,2) NOT NULL DEFAULT 0;
ALTER TABLE stone_base_prices ADD COLUMN IF NOT EXISTS created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE stone_base_prices ADD COLUMN IF NOT EXISTS updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW();
CREATE INDEX IF NOT EXISTS stone_base_prices_tenant_idx ON stone_base_prices (tenant_id);
ALTER TABLE stone_base_prices DROP CONSTRAINT IF EXISTS stone_base_prices_tenant_stone_key;
ALTER TABLE stone_base_prices ADD CONSTRAINT stone_base_prices_tenant_stone_key UNIQUE (tenant_id, stone_type);

-- ── stone_colour_adjustments ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS stone_colour_adjustments (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID         NOT NULL,
  stone_type        TEXT         NOT NULL,
  colour_grade      TEXT         NOT NULL,
  adjustment_percent NUMERIC(8,4) NOT NULL DEFAULT 0,
  sort_order        INTEGER      NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
ALTER TABLE stone_colour_adjustments DISABLE ROW LEVEL SECURITY;
ALTER TABLE stone_colour_adjustments ADD COLUMN IF NOT EXISTS colour_grade       TEXT;
ALTER TABLE stone_colour_adjustments ADD COLUMN IF NOT EXISTS adjustment_percent NUMERIC(8,4) NOT NULL DEFAULT 0;
ALTER TABLE stone_colour_adjustments ADD COLUMN IF NOT EXISTS sort_order         INTEGER NOT NULL DEFAULT 0;
ALTER TABLE stone_colour_adjustments ADD COLUMN IF NOT EXISTS created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE stone_colour_adjustments ADD COLUMN IF NOT EXISTS updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW();
CREATE INDEX IF NOT EXISTS stone_colour_adj_tenant_idx ON stone_colour_adjustments (tenant_id);
ALTER TABLE stone_colour_adjustments DROP CONSTRAINT IF EXISTS stone_colour_adj_tenant_type_grade_key;
ALTER TABLE stone_colour_adjustments ADD CONSTRAINT stone_colour_adj_tenant_type_grade_key UNIQUE (tenant_id, stone_type, colour_grade);

-- ── stone_clarity_adjustments ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS stone_clarity_adjustments (
  id                 UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID         NOT NULL,
  stone_type         TEXT         NOT NULL,
  clarity_grade      TEXT         NOT NULL,
  adjustment_percent NUMERIC(8,4) NOT NULL DEFAULT 0,
  sort_order         INTEGER      NOT NULL DEFAULT 0,
  created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
ALTER TABLE stone_clarity_adjustments DISABLE ROW LEVEL SECURITY;
ALTER TABLE stone_clarity_adjustments ADD COLUMN IF NOT EXISTS clarity_grade      TEXT;
ALTER TABLE stone_clarity_adjustments ADD COLUMN IF NOT EXISTS adjustment_percent NUMERIC(8,4) NOT NULL DEFAULT 0;
ALTER TABLE stone_clarity_adjustments ADD COLUMN IF NOT EXISTS sort_order         INTEGER NOT NULL DEFAULT 0;
ALTER TABLE stone_clarity_adjustments ADD COLUMN IF NOT EXISTS created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE stone_clarity_adjustments ADD COLUMN IF NOT EXISTS updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW();
CREATE INDEX IF NOT EXISTS stone_clarity_adj_tenant_idx ON stone_clarity_adjustments (tenant_id);
ALTER TABLE stone_clarity_adjustments DROP CONSTRAINT IF EXISTS stone_clarity_adj_tenant_type_grade_key;
ALTER TABLE stone_clarity_adjustments ADD CONSTRAINT stone_clarity_adj_tenant_type_grade_key UNIQUE (tenant_id, stone_type, clarity_grade);

-- ── stone_carat_multipliers ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS stone_carat_multipliers (
  id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID         NOT NULL,
  stone_type TEXT         NOT NULL,
  carat_from NUMERIC(8,4) NOT NULL,
  carat_to   NUMERIC(8,4),
  multiplier NUMERIC(8,4) NOT NULL DEFAULT 1,
  sort_order INTEGER      NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
ALTER TABLE stone_carat_multipliers DISABLE ROW LEVEL SECURITY;
ALTER TABLE stone_carat_multipliers ADD COLUMN IF NOT EXISTS stone_type  TEXT;
ALTER TABLE stone_carat_multipliers ADD COLUMN IF NOT EXISTS carat_from  NUMERIC(8,4) NOT NULL DEFAULT 0;
ALTER TABLE stone_carat_multipliers ADD COLUMN IF NOT EXISTS carat_to    NUMERIC(8,4);
ALTER TABLE stone_carat_multipliers ADD COLUMN IF NOT EXISTS multiplier  NUMERIC(8,4) NOT NULL DEFAULT 1;
ALTER TABLE stone_carat_multipliers ADD COLUMN IF NOT EXISTS sort_order  INTEGER NOT NULL DEFAULT 0;
ALTER TABLE stone_carat_multipliers ADD COLUMN IF NOT EXISTS created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE stone_carat_multipliers ADD COLUMN IF NOT EXISTS updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW();
CREATE INDEX IF NOT EXISTS stone_carat_mult_tenant_idx ON stone_carat_multipliers (tenant_id);

-- ── pricing_margin_config — add stone categories (idempotent) ──────────────────
-- Rows will be seeded per-tenant via the API when the Stones tab is first opened.
-- No migration-level inserts here since tenant_id is required.

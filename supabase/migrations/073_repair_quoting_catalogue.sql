-- ============================================================
-- Migration 073: Repair Quoting data model
-- quote items/lines, discount tiers, tenant-scoped pricing
-- catalogues (metal rates, claw rates, setting tiers, restring
-- matrix, repair/service actions, parts catalogue)
-- ============================================================

-- ── Quote items (physical pieces within a quote) ─────────────────
CREATE TABLE IF NOT EXISTS quote_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  quote_id uuid NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  sort_order int DEFAULT 0,
  description text NOT NULL,
  ownership_status text NOT NULL DEFAULT 'unknown',
    -- 'purchased_from_us' | 'not_purchased_from_us' | 'unknown'
  condition_notes text,
  photos jsonb DEFAULT '[]',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE quote_items DISABLE ROW LEVEL SECURITY;

-- ── Quote lines (every charge, belongs to exactly one quote_item) ─
CREATE TABLE IF NOT EXISTS quote_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  quote_item_id uuid NOT NULL REFERENCES quote_items(id) ON DELETE CASCADE,
  line_type text NOT NULL, -- 'part' | 'repair_action' | 'service' | 'diamond' | 'metal' | 'labour'
  catalogue_ref_id uuid, -- FK to whichever catalogue table matches line_type, nullable for manual entries
  description text NOT NULL, -- customer-facing text
  internal_notes text, -- staff-only detail
  quantity numeric DEFAULT 1,
  cost numeric, -- internal cost, manager/admin visibility only
  retail_price numeric NOT NULL, -- what the customer sees
  requires_approval boolean DEFAULT false,
  approved_by uuid REFERENCES profiles(id),
  approved_at timestamptz,
  sort_order int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE quote_lines DISABLE ROW LEVEL SECURITY;

-- ── Discount tiers (customer-level) ───────────────────────────────
CREATE TABLE IF NOT EXISTS discount_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  name text NOT NULL,
  discount_percent numeric NOT NULL DEFAULT 0,
  eligible_ownership_only boolean DEFAULT false,
    -- true = only applies to items where ownership_status = 'purchased_from_us'
  sort_order int DEFAULT 0
);
ALTER TABLE discount_tiers DISABLE ROW LEVEL SECURITY;

ALTER TABLE customers ADD COLUMN IF NOT EXISTS discount_tier_id uuid REFERENCES discount_tiers(id);

-- ── Ownership status label config (per tenant) ────────────────────
CREATE TABLE IF NOT EXISTS quoting_settings (
  tenant_id uuid PRIMARY KEY,
  ownership_label_yes text DEFAULT 'Purchased From Us',
  ownership_label_no text DEFAULT 'Not Purchased From Us',
  ownership_label_unknown text DEFAULT 'Unknown',
  labour_rate_per_minute numeric DEFAULT 1.00,
  labour_increment_minutes int DEFAULT 5
);
ALTER TABLE quoting_settings DISABLE ROW LEVEL SECURITY;

-- ── Pricing brackets (markup multiplier tiers) ────────────────────
CREATE TABLE IF NOT EXISTS pricing_brackets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  bracket_type text NOT NULL, -- 'parts_metal' | 'labour'
  cost_lower_bound numeric NOT NULL,
  multiplier numeric, -- null = POA/check market above this bound
  sort_order int DEFAULT 0
);
ALTER TABLE pricing_brackets DISABLE ROW LEVEL SECURITY;

-- ── Metal rates (per gram, ex any markup) ─────────────────────────
CREATE TABLE IF NOT EXISTS metal_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  metal_name text NOT NULL,
  rate_per_gram numeric, -- null = N/A / check market
  excluded_from_resize_rebuild boolean DEFAULT false,
  sort_order int DEFAULT 0,
  UNIQUE (tenant_id, metal_name)
);
ALTER TABLE metal_rates DISABLE ROW LEVEL SECURITY;

-- ── Claw rates (per claw, by metal) ───────────────────────────────
CREATE TABLE IF NOT EXISTS claw_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  metal_name text NOT NULL,
  price_per_claw numeric NOT NULL,
  is_confirmed boolean DEFAULT false, -- false = estimated, needs manager confirmation
  UNIQUE (tenant_id, metal_name)
);
ALTER TABLE claw_rates DISABLE ROW LEVEL SECURITY;

-- ── Setting complexity tiers ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS setting_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  tier_key text NOT NULL,
  label text NOT NULL,
  fee numeric NOT NULL,
  sort_order int DEFAULT 0
);
ALTER TABLE setting_tiers DISABLE ROW LEVEL SECURITY;

-- ── Restring price matrix ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS restring_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  length_label text NOT NULL, -- 'Bracelet', '40cm', '45cm', ...
  unknotted_straight numeric NOT NULL,
  unknotted_graduated numeric NOT NULL,
  knotted_straight numeric NOT NULL,
  knotted_graduated numeric NOT NULL,
  sort_order int DEFAULT 0
);
ALTER TABLE restring_prices DISABLE ROW LEVEL SECURITY;

-- ── Repair action catalogue ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS repair_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  name text NOT NULL,
  pricing_mode text NOT NULL,
    -- 'guided' | 'flat' | 'minutes' | 'manual' | 'description_labour'
  guide_key text, -- 'resize'|'restring'|'laserengrave'|'handengrave'|'newclaws'|'rebuild'|'newsetting', null if not guided
  default_price numeric, -- for flat mode
  default_minutes int, -- for minutes/description_labour mode
  hint text,
  active boolean DEFAULT true,
  sort_order int DEFAULT 0
);
ALTER TABLE repair_actions DISABLE ROW LEVEL SECURITY;

-- ── Service catalogue ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS service_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  name text NOT NULL,
  pricing_mode text NOT NULL,
  default_price numeric,
  default_minutes int,
  hint text,
  active boolean DEFAULT true,
  sort_order int DEFAULT 0
);
ALTER TABLE service_actions DISABLE ROW LEVEL SECURITY;

-- ── Parts catalogue (findings) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS parts_catalogue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  product_code text,
  category text NOT NULL,
  material text NOT NULL,
  name text NOT NULL,
  size text,
  cost numeric NOT NULL,
  fittable boolean DEFAULT false, -- true = eligible for the fitting fee
  is_estimated boolean DEFAULT false, -- true = placeholder cost, needs real supplier price
  data_note text, -- internal-only provenance note, never shown to customer
  active boolean DEFAULT true
);
ALTER TABLE parts_catalogue DISABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS parts_catalogue_category_idx ON parts_catalogue (tenant_id, category);

-- ── Fitting fee config ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fitting_fee_config (
  tenant_id uuid PRIMARY KEY,
  fee_per_end numeric DEFAULT 35
);
ALTER TABLE fitting_fee_config DISABLE ROW LEVEL SECURITY;

-- ── Extend quotes table for the new lifecycle ──────────────────────
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS accepted_at timestamptz;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS accepted_by text;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS deposit_amount numeric;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS discount_tier_id uuid REFERENCES discount_tiers(id);
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS discount_amount numeric;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS locked_snapshot jsonb;
  -- full quote content frozen at acceptance

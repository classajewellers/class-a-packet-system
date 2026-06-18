-- Tenant feature flags and configuration (one row per tenant)
CREATE TABLE IF NOT EXISTS tenant_features (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL UNIQUE,
  fx_usd_aud numeric DEFAULT 1.58,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE tenant_features DISABLE ROW LEVEL SECURITY;

-- Rapaport parcel prices for melee stone costing (under 0.30ct)
CREATE TABLE rapaport_parcels (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL,
  size_min            numeric NOT NULL,
  size_max            numeric NOT NULL,
  colour_group        text NOT NULL,  -- D-F, G-H, I-J, K-L, M-N
  clarity             text NOT NULL,  -- VVS, VS, SI1, SI2, SI3, I1, I2, I3
  price_usd_per_carat numeric NOT NULL,
  rap_date            date NOT NULL,
  created_at          timestamptz DEFAULT now()
);
ALTER TABLE rapaport_parcels DISABLE ROW LEVEL SECURITY;

-- Melee stone fields on pricing variants
ALTER TABLE pricing_product_variants
  ADD COLUMN IF NOT EXISTS melee_quantity      int,
  ADD COLUMN IF NOT EXISTS melee_carat_weight  numeric,
  ADD COLUMN IF NOT EXISTS melee_colour_group  text,
  ADD COLUMN IF NOT EXISTS melee_clarity       text;

-- Melee stone fields on inventory pieces
ALTER TABLE inventory_pieces
  ADD COLUMN IF NOT EXISTS melee_quantity      int,
  ADD COLUMN IF NOT EXISTS melee_carat_weight  numeric,
  ADD COLUMN IF NOT EXISTS melee_colour_group  text,
  ADD COLUMN IF NOT EXISTS melee_clarity       text;

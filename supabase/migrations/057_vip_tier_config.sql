-- ============================================================
-- 057_vip_tier_config.sql
-- Per-tenant VIP tier configuration
-- ============================================================

CREATE TABLE IF NOT EXISTS vip_tier_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  tier_name text NOT NULL,
  tier_order int NOT NULL DEFAULT 0,
  min_spend numeric NOT NULL DEFAULT 0,
  min_orders int NOT NULL DEFAULT 0,
  colour text NOT NULL DEFAULT '#9CA3AF',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, tier_name)
);
ALTER TABLE vip_tier_config DISABLE ROW LEVEL SECURITY;

-- Seed defaults for the primary tenant (idempotent)
INSERT INTO vip_tier_config (tenant_id, tier_name, tier_order, min_spend, min_orders, colour)
VALUES
  ('00000000-0000-0000-0000-000000000001'::uuid, 'Silver',   1, 5000,  3,  '#9CA3AF'),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'Gold',     2, 10000, 6,  '#F59E0B'),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'Platinum', 3, 15000, 10, '#6366F1'),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'Diamond',  4, 20000, 15, '#06B6D4'),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'Argyle',   5, 30000, 20, '#F43F5E')
ON CONFLICT (tenant_id, tier_name) DO NOTHING;

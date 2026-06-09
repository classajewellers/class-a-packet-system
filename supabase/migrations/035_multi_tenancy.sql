-- ============================================================
-- 035_multi_tenancy.sql
-- Full multi-tenancy: tenants table, tenant_id on all tables,
-- RLS policies, seed Class A as tenant #1
-- ============================================================

-- 1. Create tenants table
CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  subscription_status TEXT DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Seed Class A Jewellers as tenant #1
INSERT INTO tenants (id, name, slug, subscription_status)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Class A Jewellers',
  'classa',
  'active'
)
ON CONFLICT (id) DO NOTHING;

-- 3. Add tenant_id to all store-data tables
ALTER TABLE customers ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE daily_counters ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE inventory_designs ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE inventory_locations ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE inventory_piece_bom ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE inventory_pieces ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE inventory_stock ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE inventory_suppliers ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE packets ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE quote_templates ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE vault_bugs ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE vault_conversations ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE vault_decisions ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE vault_feature_specs ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE vault_ideas ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE vault_reports ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE workshop_jobs ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);

-- 4. Backfill all existing rows to Class A (tenant #1)
UPDATE customers SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE daily_counters SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE inventory_designs SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE inventory_items SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE inventory_locations SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE inventory_movements SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE inventory_piece_bom SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE inventory_pieces SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE inventory_stock SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE inventory_suppliers SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE packets SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE profiles SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE quote_templates SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE quotes SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE vault_bugs SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE vault_conversations SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE vault_decisions SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE vault_feature_specs SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE vault_ideas SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE vault_reports SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE workshop_jobs SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;

-- 5. Make tenant_id NOT NULL after backfill
ALTER TABLE customers ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE daily_counters ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE inventory_designs ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE inventory_items ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE inventory_locations ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE inventory_movements ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE inventory_piece_bom ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE inventory_pieces ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE inventory_stock ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE inventory_suppliers ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE packets ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE profiles ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE quote_templates ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE quotes ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE vault_bugs ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE vault_conversations ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE vault_decisions ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE vault_feature_specs ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE vault_ideas ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE vault_reports ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE workshop_jobs ALTER COLUMN tenant_id SET NOT NULL;

-- 6. Add tenant_id index on all tables for query performance
CREATE INDEX IF NOT EXISTS idx_customers_tenant ON customers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_packets_tenant ON packets(tenant_id);
CREATE INDEX IF NOT EXISTS idx_quotes_tenant ON quotes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_workshop_jobs_tenant ON workshop_jobs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_profiles_tenant ON profiles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_vault_ideas_tenant ON vault_ideas(tenant_id);
CREATE INDEX IF NOT EXISTS idx_vault_bugs_tenant ON vault_bugs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_vault_decisions_tenant ON vault_decisions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_vault_conversations_tenant ON vault_conversations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_vault_feature_specs_tenant ON vault_feature_specs(tenant_id);

-- 7. Enable RLS on all tenant-scoped tables
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_designs ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_piece_bom ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_pieces ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE packets ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE vault_bugs ENABLE ROW LEVEL SECURITY;
ALTER TABLE vault_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE vault_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE vault_feature_specs ENABLE ROW LEVEL SECURITY;
ALTER TABLE vault_ideas ENABLE ROW LEVEL SECURITY;
ALTER TABLE vault_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE workshop_jobs ENABLE ROW LEVEL SECURITY;

-- 8. RLS helper function — reads tenant_id from current session variable
CREATE OR REPLACE FUNCTION current_tenant_id()
RETURNS UUID AS $$
  SELECT NULLIF(current_setting('app.tenant_id', true), '')::UUID;
$$ LANGUAGE sql STABLE;

-- 9. RLS policies — all tables use same pattern
-- tenants: anyone can read their own tenant row
CREATE POLICY "tenant_isolation" ON tenants
  FOR ALL USING (id = current_tenant_id());

-- customers
CREATE POLICY "tenant_isolation" ON customers
  FOR ALL USING (tenant_id = current_tenant_id());

-- daily_counters
CREATE POLICY "tenant_isolation" ON daily_counters
  FOR ALL USING (tenant_id = current_tenant_id());

-- inventory
CREATE POLICY "tenant_isolation" ON inventory_designs
  FOR ALL USING (tenant_id = current_tenant_id());
CREATE POLICY "tenant_isolation" ON inventory_items
  FOR ALL USING (tenant_id = current_tenant_id());
CREATE POLICY "tenant_isolation" ON inventory_locations
  FOR ALL USING (tenant_id = current_tenant_id());
CREATE POLICY "tenant_isolation" ON inventory_movements
  FOR ALL USING (tenant_id = current_tenant_id());
CREATE POLICY "tenant_isolation" ON inventory_piece_bom
  FOR ALL USING (tenant_id = current_tenant_id());
CREATE POLICY "tenant_isolation" ON inventory_pieces
  FOR ALL USING (tenant_id = current_tenant_id());
CREATE POLICY "tenant_isolation" ON inventory_stock
  FOR ALL USING (tenant_id = current_tenant_id());
CREATE POLICY "tenant_isolation" ON inventory_suppliers
  FOR ALL USING (tenant_id = current_tenant_id());

-- packets
CREATE POLICY "tenant_isolation" ON packets
  FOR ALL USING (tenant_id = current_tenant_id());

-- profiles
CREATE POLICY "tenant_isolation" ON profiles
  FOR ALL USING (tenant_id = current_tenant_id());

-- quotes
CREATE POLICY "tenant_isolation" ON quote_templates
  FOR ALL USING (tenant_id = current_tenant_id());
CREATE POLICY "tenant_isolation" ON quotes
  FOR ALL USING (tenant_id = current_tenant_id());

-- vault brain
CREATE POLICY "tenant_isolation" ON vault_bugs
  FOR ALL USING (tenant_id = current_tenant_id());
CREATE POLICY "tenant_isolation" ON vault_conversations
  FOR ALL USING (tenant_id = current_tenant_id());
CREATE POLICY "tenant_isolation" ON vault_decisions
  FOR ALL USING (tenant_id = current_tenant_id());
CREATE POLICY "tenant_isolation" ON vault_feature_specs
  FOR ALL USING (tenant_id = current_tenant_id());
CREATE POLICY "tenant_isolation" ON vault_ideas
  FOR ALL USING (tenant_id = current_tenant_id());
CREATE POLICY "tenant_isolation" ON vault_reports
  FOR ALL USING (tenant_id = current_tenant_id());

-- workshop
CREATE POLICY "tenant_isolation" ON workshop_jobs
  FOR ALL USING (tenant_id = current_tenant_id());

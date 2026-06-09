-- 037_vault_admin.sql
-- Vault operator CRM tables

CREATE TABLE IF NOT EXISTS vault_admin_stores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,

  -- Billing
  plan TEXT DEFAULT 'trial',  -- trial, starter, pro, enterprise
  billing_status TEXT DEFAULT 'trial',  -- trial, active, overdue, suspended, cancelled
  monthly_fee_aud NUMERIC(10,2) DEFAULT 0,
  billing_start_date DATE,
  next_billing_date DATE,
  stripe_customer_id TEXT,

  -- Primary contact
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,

  -- Store info
  store_city TEXT,
  store_state TEXT,
  website_url TEXT,

  -- Notes
  notes TEXT,

  -- Onboarding checklist
  onboarding_dns_connected BOOLEAN DEFAULT false,
  onboarding_staff_loaded BOOLEAN DEFAULT false,
  onboarding_first_order BOOLEAN DEFAULT false,
  onboarding_training_done BOOLEAN DEFAULT false,
  onboarding_billing_active BOOLEAN DEFAULT false,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Seed Class A record
INSERT INTO vault_admin_stores (
  tenant_id, plan, billing_status, monthly_fee_aud,
  contact_name, contact_email, contact_phone,
  store_city, store_state, website_url,
  onboarding_dns_connected, onboarding_staff_loaded, onboarding_first_order,
  onboarding_training_done, onboarding_billing_active
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  'enterprise', 'active', 0,
  'Josh Mucklow', 'josh@classa.com.au', NULL,
  'Adelaide', 'SA', 'classa.com.au',
  true, true, true, true, true
)
ON CONFLICT DO NOTHING;

ALTER TABLE vault_admin_stores DISABLE ROW LEVEL SECURITY;

-- Activity log for operator notes
CREATE TABLE IF NOT EXISTS vault_admin_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID REFERENCES vault_admin_stores(id) ON DELETE CASCADE,
  type TEXT NOT NULL, -- note, call, email, billing_event, status_change
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE vault_admin_activity DISABLE ROW LEVEL SECURITY;

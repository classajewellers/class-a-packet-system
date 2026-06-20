-- Add maiden_name, wishlist_notes, customer_followup_notes to customers
ALTER TABLE customers ADD COLUMN IF NOT EXISTS maiden_name text;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS wishlist_notes text;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS customer_followup_notes text;

-- Partners join table (by email, not foreign key to customers.id)
CREATE TABLE IF NOT EXISTS customer_partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  email_1 text NOT NULL,
  email_2 text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, email_1, email_2)
);
ALTER TABLE customer_partners DISABLE ROW LEVEL SECURITY;

-- Appointments table (keyed by email not FK)
CREATE TABLE IF NOT EXISTS customer_appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  customer_email text NOT NULL,
  appointment_date date NOT NULL,
  appointment_time time,
  notes text,
  status text NOT NULL DEFAULT 'upcoming',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE customer_appointments DISABLE ROW LEVEL SECURITY;

-- 117_leads.sql
-- Leads / Enquiries module.
--
-- A lead is a captured enquiry at the counter or over the phone that has NOT
-- yet become a quote. The whole design hinges on next_action_date being
-- mandatory at creation so nothing falls behind.
--
-- ISOLATION: matches the quotes/customers pattern exactly — RLS ENABLED with a
-- tenant_isolation policy (migrations 019/035/092/093). The API routes use the
-- service-role key (createTenantSupabaseClient), which bypasses RLS, so this
-- policy does not change app behaviour; it is a defence-in-depth backstop that
-- denies any DIRECT PostgREST access (anon/authenticated browser client) to a
-- row whose tenant_id != the session's app.tenant_id.
--
-- Safe to re-run: CREATE TABLE IF NOT EXISTS + ADD COLUMN IF NOT EXISTS +
-- guarded constraints.

CREATE TABLE IF NOT EXISTS leads (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID        NOT NULL REFERENCES tenants(id),
  name                TEXT        NOT NULL,
  phone               TEXT,
  email               TEXT,
  interested_in       TEXT        NOT NULL,
  source              TEXT        NOT NULL,
  next_action_date    DATE        NOT NULL,
  status              TEXT        NOT NULL DEFAULT 'new',
  linked_customer_id  UUID        REFERENCES customers(id),
  converted_quote_id  UUID        REFERENCES quotes(id),
  created_by_staff_id UUID        REFERENCES staff_pins(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS ENABLED + tenant_isolation policy, matching quotes/customers (035).
-- current_tenant_id() reads the app.tenant_id GUC set by set_tenant_config().
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON leads;
CREATE POLICY "tenant_isolation" ON leads
  FOR ALL USING (tenant_id = current_tenant_id());

-- Idempotent column adds (in case the table pre-exists from an earlier run)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS tenant_id           UUID;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS name                TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS phone               TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS email               TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS interested_in       TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS source              TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS next_action_date    DATE;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS status              TEXT NOT NULL DEFAULT 'new';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS linked_customer_id  UUID;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS converted_quote_id  UUID;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS created_by_staff_id UUID;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE leads ADD COLUMN IF NOT EXISTS updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- At least one contact method (phone OR email), never neither.
ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_contact_method_chk;
ALTER TABLE leads ADD  CONSTRAINT leads_contact_method_chk
  CHECK (phone IS NOT NULL OR email IS NOT NULL);

-- Constrain source to the agreed vocabulary.
ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_source_chk;
ALTER TABLE leads ADD  CONSTRAINT leads_source_chk
  CHECK (source IN ('walk_in','referral','returning_customer','instagram',
                    'facebook','website','phone','google','event','other'));

-- Constrain status to the pipeline vocabulary.
ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_status_chk;
ALTER TABLE leads ADD  CONSTRAINT leads_status_chk
  CHECK (status IN ('new','contacted','quoted','dead'));

-- Indexes — this table is queried by tenant, by status, and for "overdue"
-- (next_action_date) constantly.
CREATE INDEX IF NOT EXISTS leads_tenant_id_idx        ON leads (tenant_id);
CREATE INDEX IF NOT EXISTS leads_status_idx           ON leads (status);
CREATE INDEX IF NOT EXISTS leads_next_action_date_idx ON leads (next_action_date);

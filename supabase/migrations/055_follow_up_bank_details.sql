-- ============================================================
-- 055_follow_up_bank_details.sql
-- Follow-up reminder dates on quotes + bank details on tenants
-- ============================================================

-- Follow-up reminder schedule columns (computed from quote creation / stage change)
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS follow_up_7d  date;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS follow_up_14d date;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS follow_up_1m  date;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS follow_up_3m  date;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS follow_up_6m  date;

-- Freeform notes for the follow-up section on each quote
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS follow_up_notes text;

-- Bank/payment details stored per tenant (shown on quote PDFs)
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS bank_name     text;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS account_name  text;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS bsb           text;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS account_number text;

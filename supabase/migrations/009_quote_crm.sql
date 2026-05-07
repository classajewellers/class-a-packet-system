-- CRM pipeline columns for quotes table
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS assigned_to text;           -- staff member name
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS follow_up_date date;        -- when to follow up next
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS status_changed_at timestamptz default now();
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS status_changed_by text;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS pending_at timestamptz;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS follow_up_1_at timestamptz;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS follow_up_2_at timestamptz;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS job_won_at timestamptz;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS job_lost_at timestamptz;

-- 070_packet_column_repair.sql

-- The 6 columns that exist on production but were never committed as a migration
ALTER TABLE packets ADD COLUMN IF NOT EXISTS cad_required boolean;
ALTER TABLE packets ADD COLUMN IF NOT EXISTS manufacture_type text;
ALTER TABLE packets ADD COLUMN IF NOT EXISTS workshop_due_date date;
ALTER TABLE packets ADD COLUMN IF NOT EXISTS workshop_due_date_overridden boolean;
ALTER TABLE packets ADD COLUMN IF NOT EXISTS job_complexity text;
ALTER TABLE packets ADD COLUMN IF NOT EXISTS arms_tracker_number text;

-- Fix status check constraint to allow 'to_be_valued' (added by 069)
ALTER TABLE packets DROP CONSTRAINT IF EXISTS packets_status_check;
ALTER TABLE packets ADD CONSTRAINT packets_status_check
  CHECK (status IN ('intake','on_bench','quality_check','to_be_valued','ready','collected'));

-- Fix job_type check constraint to allow 'collection_order' (added by 069)
ALTER TABLE packets DROP CONSTRAINT IF EXISTS packets_job_type_check;
ALTER TABLE packets ADD CONSTRAINT packets_job_type_check
  CHECK (job_type IN ('repair','custom_order','stock_work','online_order','collection_order'));

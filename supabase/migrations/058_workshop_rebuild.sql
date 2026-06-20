-- 058_workshop_rebuild.sql
-- Add workshop-specific columns to packets so packets IS the workshop board.

ALTER TABLE packets ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'intake';
ALTER TABLE packets ADD COLUMN IF NOT EXISTS job_type text NOT NULL DEFAULT 'repair';
ALTER TABLE packets ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES profiles(id);
ALTER TABLE packets ADD COLUMN IF NOT EXISTS status_updated_at timestamptz DEFAULT now();
ALTER TABLE packets ADD COLUMN IF NOT EXISTS collected_at timestamptz;
ALTER TABLE packets ADD COLUMN IF NOT EXISTS collection_notified_at timestamptz;

-- Backfill job_type from packet_type for existing data
UPDATE packets SET job_type = 'custom_order' WHERE packet_type = 'custom_order';

-- Add check constraints idempotently
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'packets_status_check' AND conrelid = 'packets'::regclass
  ) THEN
    ALTER TABLE packets ADD CONSTRAINT packets_status_check
      CHECK (status IN ('intake', 'on_bench', 'quality_check', 'ready', 'collected'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'packets_job_type_check' AND conrelid = 'packets'::regclass
  ) THEN
    ALTER TABLE packets ADD CONSTRAINT packets_job_type_check
      CHECK (job_type IN ('repair', 'custom_order', 'stock_work'));
  END IF;
END $$;

-- Index for kanban queries
CREATE INDEX IF NOT EXISTS packets_status_idx ON packets (status);
CREATE INDEX IF NOT EXISTS packets_job_type_idx ON packets (job_type);

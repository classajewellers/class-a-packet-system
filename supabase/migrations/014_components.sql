-- Add components JSONB column to workshop_jobs
ALTER TABLE workshop_jobs ADD COLUMN IF NOT EXISTS components jsonb default '[]';

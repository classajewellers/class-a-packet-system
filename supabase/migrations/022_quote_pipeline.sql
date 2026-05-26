-- Explicit pipeline stage column (status field already tracks this; column added for clarity)
alter table quotes add column if not exists pipeline_stage text default 'Pending';

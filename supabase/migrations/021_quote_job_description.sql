-- Add job type and free-text description columns to quotes
-- These are set from the quote builder and printed on the customer PDF.
alter table quotes add column if not exists job_type text;
alter table quotes add column if not exists job_description text;

create table if not exists workshop_jobs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  packet_id uuid references packets(id) on delete set null,
  reference_number text,
  customer_surname text,
  description text,
  category text default 'other',
  complexity text default 'standard',
  stage text default 'new',
  assigned_jeweller text,
  due_date date,
  instructions text,
  is_subcontractor boolean default false,
  subcontractor_name text,
  subcontractor_due_date date,
  subcontractor_instructions text,
  subcontractor_status text,
  job_type text default 'major',
  notes text,
  stage_changed_at timestamptz default now()
);
create index if not exists workshop_jobs_stage_idx on workshop_jobs(stage);
create index if not exists workshop_jobs_packet_id_idx on workshop_jobs(packet_id);

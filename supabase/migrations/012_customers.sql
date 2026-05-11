create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  email text unique,
  phone text,
  first_name text,
  last_name text,
  address text,
  suburb text,
  state text,
  postcode text,
  notes text,
  referral_source text,
  total_orders int default 0,
  total_spend numeric(10,2) default 0,
  last_visit_date date
);
create index if not exists customers_email_idx on customers(email);
create index if not exists customers_phone_idx on customers(phone);

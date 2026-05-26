-- ── 019_profiles.sql ─────────────────────────────────────────────────────────
-- Profiles table linked to auth.users.
-- A row is auto-created for every new auth user via a trigger.
-- The admin can set full_name and role; the trigger defaults to 'staff'.

create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text,
  role        text not null default 'staff' check (role in ('admin', 'manager', 'staff')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Enable RLS
alter table public.profiles enable row level security;

-- Users can read their own profile
create policy "profiles_self_read" on public.profiles
  for select using (auth.uid() = id);

-- Users can update their own profile (name only — role is set server-side)
create policy "profiles_self_update" on public.profiles
  for update using (auth.uid() = id);

-- Service role (used by admin API routes) bypasses RLS automatically.

-- ── Trigger: auto-create profile on new user ───────────────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'role', 'staff')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ── RLS on core tables ─────────────────────────────────────────────────────
-- All authenticated users can read/write packets, quotes, workshop_jobs,
-- customers, and daily_counters. No public access.

-- packets
alter table public.packets enable row level security;
drop policy if exists "packets_auth" on public.packets;
create policy "packets_auth" on public.packets
  for all using (auth.role() = 'authenticated');

-- quotes
alter table public.quotes enable row level security;
drop policy if exists "quotes_auth" on public.quotes;
create policy "quotes_auth" on public.quotes
  for all using (auth.role() = 'authenticated');

-- workshop_jobs
alter table public.workshop_jobs enable row level security;
drop policy if exists "workshop_jobs_auth" on public.workshop_jobs;
create policy "workshop_jobs_auth" on public.workshop_jobs
  for all using (auth.role() = 'authenticated');

-- customers
alter table public.customers enable row level security;
drop policy if exists "customers_auth" on public.customers;
create policy "customers_auth" on public.customers
  for all using (auth.role() = 'authenticated');

-- daily_counters
alter table public.daily_counters enable row level security;
drop policy if exists "daily_counters_auth" on public.daily_counters;
create policy "daily_counters_auth" on public.daily_counters
  for all using (auth.role() = 'authenticated');

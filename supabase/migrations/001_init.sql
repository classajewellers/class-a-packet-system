-- Class A Packet System — initial schema
-- Run this in the Supabase SQL editor for your project.

-- ─────────────────────────────────────────────
-- daily_counters
-- ─────────────────────────────────────────────
create table if not exists daily_counters (
  date         date primary key,
  packet_count int  default 0
);

-- ─────────────────────────────────────────────
-- packets
-- ─────────────────────────────────────────────
create table if not exists packets (
  id                    uuid        primary key default gen_random_uuid(),
  created_at            timestamptz default now(),

  reference_number      text        unique not null,
  packet_type           text        not null, -- 'repair' | 'custom_order' | 'layby' | 'client_intake'

  -- customer
  customer_first_name   text,
  customer_last_name    text,
  customer_email        text,
  customer_phone        text,
  customer_address      text,
  customer_postcode     text,
  customer_number       text,
  stock_number          text,

  -- value & contact
  value_declared        boolean     default false,
  contact_preference    text[],     -- e.g. {'text','email','phone'}

  -- articles & instructions
  articles              text,
  instructions          text,

  -- pricing
  total_charges         numeric,
  deposit               numeric,
  balance               numeric,    -- auto-calculated: total_charges - deposit

  -- dates
  in_date               date,
  due_date              date,

  -- referral & staff
  referral_source       text,
  occasion              text,
  staff_initials        text,
  ordered               boolean     default false,

  -- repair-specific
  repair_tracker_number text,
  from_date             date,

  -- collected / signed
  collected_date        date,
  signed_by             text,

  -- output status flags
  klaviyo_synced        boolean     default false,
  email_sent            boolean     default false,
  sms_sent              boolean     default false,
  label_printed         boolean     default false,
  sheets_logged         boolean     default false,

  -- full payload for any extra fields
  packet_data           jsonb
);

-- index for admin search
create index if not exists packets_reference_number_idx on packets (reference_number);
create index if not exists packets_customer_email_idx   on packets (customer_email);
create index if not exists packets_created_at_idx       on packets (created_at desc);
create index if not exists packets_packet_type_idx      on packets (packet_type);

-- ─────────────────────────────────────────────
-- RPC: increment_packet_counter
-- Atomically increments the counter for a given date and returns the new value.
-- ─────────────────────────────────────────────
create or replace function increment_packet_counter(input_date date)
returns int
language plpgsql
as $$
declare
  new_count int;
begin
  insert into daily_counters (date, packet_count)
  values (input_date, 1)
  on conflict (date) do update
    set packet_count = daily_counters.packet_count + 1
  returning packet_count into new_count;

  return new_count;
end;
$$;

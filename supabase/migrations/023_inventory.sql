-- ─────────────────────────────────────────────────────
-- 023: Inventory module
-- Tables: inventory_locations, inventory_suppliers,
--         inventory_items, inventory_stock
-- ─────────────────────────────────────────────────────

-- Locations -----------------------------------------------
create table if not exists inventory_locations (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  type            text not null check (type in ('display','storage','workshop','transit','consignment')),
  bin_code_format text,
  shopify_visible boolean not null default false,
  created_at      timestamptz not null default now()
);

alter table inventory_locations enable row level security;

create policy "inventory_locations_select"
  on inventory_locations for select
  using (auth.role() = 'authenticated');

create policy "inventory_locations_all"
  on inventory_locations for all
  using (auth.role() = 'authenticated');

-- Seed starting locations
insert into inventory_locations (name, type, shopify_visible) values
  ('Display Floor',  'display',  true),
  ('Back of House',  'storage',  false),
  ('Workshop',       'workshop', false)
on conflict do nothing;

-- Suppliers -----------------------------------------------
create table if not exists inventory_suppliers (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  contact_name   text,
  email          text,
  phone          text,
  lead_time_days integer,
  notes          text,
  created_at     timestamptz not null default now()
);

alter table inventory_suppliers enable row level security;

create policy "inventory_suppliers_select"
  on inventory_suppliers for select
  using (auth.role() = 'authenticated');

create policy "inventory_suppliers_all"
  on inventory_suppliers for all
  using (auth.role() = 'authenticated');

-- Items ---------------------------------------------------
create table if not exists inventory_items (
  id               uuid primary key default gen_random_uuid(),
  sku              text unique not null,
  name             text not null,
  description      text,
  item_type        text not null check (item_type in ('retail','internal')) default 'retail',
  category         text,
  department       text,
  supplier_id      uuid references inventory_suppliers(id) on delete set null,
  supplier_code    text,
  cost_price       numeric(10,2),
  retail_price     numeric(10,2),
  packaging_cost   numeric(10,2),
  landed_cost      numeric(10,2),
  reorder_point    integer,
  metal_type       text,
  metal_weight_grams numeric(8,3),
  location_id      uuid references inventory_locations(id) on delete set null,
  shopify_synced   boolean not null default false,
  notes            text,
  created_at       timestamptz not null default now()
);

alter table inventory_items enable row level security;

create policy "inventory_items_select"
  on inventory_items for select
  using (auth.role() = 'authenticated');

create policy "inventory_items_all"
  on inventory_items for all
  using (auth.role() = 'authenticated');

-- Stock ---------------------------------------------------
create table if not exists inventory_stock (
  id          uuid primary key default gen_random_uuid(),
  item_id     uuid not null references inventory_items(id) on delete cascade,
  location_id uuid not null references inventory_locations(id) on delete cascade,
  quantity    integer not null default 0,
  updated_at  timestamptz not null default now(),
  unique (item_id, location_id)
);

alter table inventory_stock enable row level security;

create policy "inventory_stock_select"
  on inventory_stock for select
  using (auth.role() = 'authenticated');

create policy "inventory_stock_all"
  on inventory_stock for all
  using (auth.role() = 'authenticated');

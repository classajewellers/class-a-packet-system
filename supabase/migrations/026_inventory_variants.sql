-- ─────────────────────────────────────────────────────
-- 026: Inventory variants, BOM, gold prices, purchase invoices
-- ─────────────────────────────────────────────────────

-- Products ------------------------------------------------
create table if not exists inventory_products (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  category    text,
  department  text,
  notes       text,
  created_at  timestamptz not null default now()
);

alter table inventory_products enable row level security;

drop policy if exists "inventory_products_select" on inventory_products;
drop policy if exists "inventory_products_all"    on inventory_products;

create policy "inventory_products_select"
  on inventory_products for select
  using (auth.role() = 'authenticated');

create policy "inventory_products_all"
  on inventory_products for all
  using (auth.role() = 'authenticated');

-- Variants ------------------------------------------------
create table if not exists inventory_variants (
  id                  uuid primary key default gen_random_uuid(),
  product_id          uuid not null references inventory_products(id) on delete cascade,
  sku                 text unique not null,
  metal_type          text,
  metal_karat         text check (metal_karat in ('9K','18K','Platinum','Silver','Other')),
  metal_colour        text check (metal_colour in ('Yellow','White','Rose','N/A')),
  metal_weight_grams  numeric(8,3),
  diamond_carat       numeric(8,3),
  diamond_colour      text,
  diamond_clarity     text,
  diamond_type        text check (diamond_type in ('Natural','Lab Grown','None')),
  finger_size         text,
  other_specs         text,
  cost_price          numeric(10,2),
  retail_price        numeric(10,2),
  is_active           boolean not null default true,
  created_at          timestamptz not null default now()
);

alter table inventory_variants enable row level security;

drop policy if exists "inventory_variants_select" on inventory_variants;
drop policy if exists "inventory_variants_all"    on inventory_variants;

create policy "inventory_variants_select"
  on inventory_variants for select
  using (auth.role() = 'authenticated');

create policy "inventory_variants_all"
  on inventory_variants for all
  using (auth.role() = 'authenticated');

-- Purchase Invoices ---------------------------------------
create table if not exists inventory_purchase_invoices (
  id              uuid primary key default gen_random_uuid(),
  invoice_number  text not null,
  supplier_id     uuid references inventory_suppliers(id) on delete set null,
  invoice_date    date,
  total_amount    numeric(12,2),
  status          text not null default 'pending' check (status in ('pending','received','partial','disputed')),
  notes           text,
  created_by      uuid references auth.users(id),
  created_at      timestamptz not null default now()
);

alter table inventory_purchase_invoices enable row level security;

drop policy if exists "inventory_purchase_invoices_select" on inventory_purchase_invoices;
drop policy if exists "inventory_purchase_invoices_all"    on inventory_purchase_invoices;

create policy "inventory_purchase_invoices_select"
  on inventory_purchase_invoices for select
  using (auth.role() = 'authenticated');

create policy "inventory_purchase_invoices_all"
  on inventory_purchase_invoices for all
  using (auth.role() = 'authenticated');

-- Purchase Lines ------------------------------------------
create table if not exists inventory_purchase_lines (
  id              uuid primary key default gen_random_uuid(),
  invoice_id      uuid not null references inventory_purchase_invoices(id) on delete cascade,
  variant_id      uuid references inventory_variants(id) on delete set null,
  description     text not null,
  component_type  text check (component_type in ('casting','diamond','labour','settings','findings','other')),
  quantity        numeric(10,3) not null default 1,
  unit_cost       numeric(10,2),
  total_cost      numeric(12,2) generated always as (coalesce(quantity,0) * coalesce(unit_cost,0)) stored,
  is_faulty       boolean not null default false,
  faulty_notes    text,
  created_at      timestamptz not null default now()
);

alter table inventory_purchase_lines enable row level security;

drop policy if exists "inventory_purchase_lines_select" on inventory_purchase_lines;
drop policy if exists "inventory_purchase_lines_all"    on inventory_purchase_lines;

create policy "inventory_purchase_lines_select"
  on inventory_purchase_lines for select
  using (auth.role() = 'authenticated');

create policy "inventory_purchase_lines_all"
  on inventory_purchase_lines for all
  using (auth.role() = 'authenticated');

-- BOM -----------------------------------------------------
create table if not exists inventory_bom (
  id                  uuid primary key default gen_random_uuid(),
  variant_id          uuid not null references inventory_variants(id) on delete cascade,
  component_type      text not null check (component_type in ('casting','diamond','labour','settings','findings','other')),
  description         text not null,
  quantity            numeric(10,3) not null default 1,
  unit                text,
  unit_cost           numeric(10,2) not null default 0,
  total_cost          numeric(12,2) generated always as (coalesce(quantity,0) * coalesce(unit_cost,0)) stored,
  supplier_id         uuid references inventory_suppliers(id) on delete set null,
  purchase_invoice_id uuid,
  notes               text,
  created_at          timestamptz not null default now()
);

alter table inventory_bom enable row level security;

drop policy if exists "inventory_bom_select" on inventory_bom;
drop policy if exists "inventory_bom_all"    on inventory_bom;

create policy "inventory_bom_select"
  on inventory_bom for select
  using (auth.role() = 'authenticated');

create policy "inventory_bom_all"
  on inventory_bom for all
  using (auth.role() = 'authenticated');

-- Add FK to bom.purchase_invoice_id (after invoices table exists)
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'inventory_bom_purchase_invoice_id_fkey'
  ) then
    alter table inventory_bom
      add constraint inventory_bom_purchase_invoice_id_fkey
      foreign key (purchase_invoice_id)
      references inventory_purchase_invoices(id) on delete set null;
  end if;
end $$;

-- Gold Prices ---------------------------------------------
create table if not exists inventory_gold_prices (
  id              uuid primary key default gen_random_uuid(),
  karat           text not null check (karat in ('9K','18K','Platinum','Silver')),
  price_per_gram  numeric(10,4) not null,
  supplier_id     uuid references inventory_suppliers(id) on delete set null,
  effective_date  date not null default current_date,
  notes           text,
  created_by      uuid references auth.users(id),
  created_at      timestamptz not null default now()
);

alter table inventory_gold_prices enable row level security;

drop policy if exists "inventory_gold_prices_select" on inventory_gold_prices;
drop policy if exists "inventory_gold_prices_all"    on inventory_gold_prices;

create policy "inventory_gold_prices_select"
  on inventory_gold_prices for select
  using (auth.role() = 'authenticated');

create policy "inventory_gold_prices_all"
  on inventory_gold_prices for all
  using (auth.role() = 'authenticated');

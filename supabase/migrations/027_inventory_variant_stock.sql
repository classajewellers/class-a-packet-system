-- ─────────────────────────────────────────────────────
-- 027: Stock tracking for inventory variants
-- Separate from inventory_stock (which tracks inventory_items)
-- so we avoid a polymorphic FK problem.
-- ─────────────────────────────────────────────────────

create table if not exists inventory_variant_stock (
  id          uuid primary key default gen_random_uuid(),
  variant_id  uuid not null references inventory_variants(id) on delete cascade,
  location_id uuid not null references inventory_locations(id) on delete cascade,
  quantity    integer not null default 0,
  updated_at  timestamptz not null default now(),
  unique (variant_id, location_id)
);

alter table inventory_variant_stock enable row level security;

drop policy if exists "inventory_variant_stock_select" on inventory_variant_stock;
drop policy if exists "inventory_variant_stock_all"    on inventory_variant_stock;

create policy "inventory_variant_stock_select"
  on inventory_variant_stock for select
  using (auth.role() = 'authenticated');

create policy "inventory_variant_stock_all"
  on inventory_variant_stock for all
  using (auth.role() = 'authenticated');

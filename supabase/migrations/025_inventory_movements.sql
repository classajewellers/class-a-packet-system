-- ─────────────────────────────────────────────────────
-- 025: Inventory movements (stock audit trail)
-- ─────────────────────────────────────────────────────

create table if not exists inventory_movements (
  id              uuid default gen_random_uuid() primary key,
  item_id         uuid references inventory_items(id) on delete cascade,
  from_location_id uuid references inventory_locations(id),
  to_location_id   uuid references inventory_locations(id),
  quantity        integer not null,
  movement_type   text check (movement_type in (
    'receive',
    'transfer',
    'sale',
    'return',
    'adjustment',
    'workshop_in',
    'workshop_out',
    'stocktake'
  )),
  reference       text,
  notes           text,
  created_by      uuid references auth.users(id),
  created_at      timestamptz not null default now()
);

alter table inventory_movements enable row level security;

create policy "Authenticated read inventory_movements"
  on inventory_movements for select
  using (auth.role() = 'authenticated');

create policy "Authenticated write inventory_movements"
  on inventory_movements for all
  using (auth.role() = 'authenticated');

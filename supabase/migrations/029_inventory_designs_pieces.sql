-- ─────────────────────────────────────────────────────
-- 029: Inventory Designs, Pieces, and Piece BOM
-- Models real jewellery: a Design (e.g. "Grace Engagement Ring")
-- has many Pieces (individual physical items with their own SKU,
-- specs, location, and BOM).
-- ─────────────────────────────────────────────────────

-- Designs --------------------------------------------------
create table if not exists inventory_designs (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  category    text check (category in (
                'Engagement Ring','Wedding Ring','Fine Jewellery','Earrings',
                'Bracelet','Necklace','Pendant','Brooch',
                'Loose Stone','Component','Other'
              )),
  description text,
  notes       text,
  created_at  timestamptz not null default now()
);

alter table inventory_designs enable row level security;

drop policy if exists "inventory_designs_select" on inventory_designs;
drop policy if exists "inventory_designs_all"    on inventory_designs;

create policy "inventory_designs_select"
  on inventory_designs for select
  using (auth.role() = 'authenticated');

create policy "inventory_designs_all"
  on inventory_designs for all
  using (auth.role() = 'authenticated');

-- Pieces ---------------------------------------------------
create table if not exists inventory_pieces (
  id                  uuid primary key default gen_random_uuid(),
  design_id           uuid not null references inventory_designs(id) on delete cascade,
  sku                 text unique not null,
  metal_karat         text check (metal_karat in ('9K','18K','Platinum','Silver','Other')),
  metal_colour        text check (metal_colour in ('Yellow','White','Rose','N/A')),
  metal_weight_grams  numeric(8,3),
  diamond_carat       numeric(8,3),
  diamond_colour      text,
  diamond_clarity     text,
  diamond_type        text check (diamond_type in ('Natural','Lab Grown','None')),
  finger_size         text,
  other_specs         text,
  location_id         uuid references inventory_locations(id) on delete set null,
  cost_price          numeric(10,2),
  retail_price        numeric(10,2),
  status              text not null default 'in_stock'
                        check (status in ('in_stock','on_order','sold','workshop','consignment')),
  notes               text,
  created_at          timestamptz not null default now()
);

alter table inventory_pieces enable row level security;

drop policy if exists "inventory_pieces_select" on inventory_pieces;
drop policy if exists "inventory_pieces_all"    on inventory_pieces;

create policy "inventory_pieces_select"
  on inventory_pieces for select
  using (auth.role() = 'authenticated');

create policy "inventory_pieces_all"
  on inventory_pieces for all
  using (auth.role() = 'authenticated');

-- Piece BOM ------------------------------------------------
-- locked_cost is frozen at save time (quantity * unit_cost) so retroactive
-- changes to gold price / supplier rates don't rewrite history.
create table if not exists inventory_piece_bom (
  id              uuid primary key default gen_random_uuid(),
  piece_id        uuid not null references inventory_pieces(id) on delete cascade,
  component_type  text not null check (component_type in ('casting','diamond','labour','settings','findings','other')),
  description     text not null,
  quantity        numeric(10,3) not null default 1,
  unit            text,
  unit_cost       numeric(10,2) not null default 0,
  locked_cost     numeric(12,2) not null default 0,
  supplier_id     uuid references inventory_suppliers(id) on delete set null,
  notes           text,
  created_at      timestamptz not null default now()
);

alter table inventory_piece_bom enable row level security;

drop policy if exists "inventory_piece_bom_select" on inventory_piece_bom;
drop policy if exists "inventory_piece_bom_all"    on inventory_piece_bom;

create policy "inventory_piece_bom_select"
  on inventory_piece_bom for select
  using (auth.role() = 'authenticated');

create policy "inventory_piece_bom_all"
  on inventory_piece_bom for all
  using (auth.role() = 'authenticated');

-- Indexes --------------------------------------------------
create index if not exists inventory_pieces_design_id_idx on inventory_pieces(design_id);
create index if not exists inventory_pieces_location_id_idx on inventory_pieces(location_id);
create index if not exists inventory_piece_bom_piece_id_idx on inventory_piece_bom(piece_id);

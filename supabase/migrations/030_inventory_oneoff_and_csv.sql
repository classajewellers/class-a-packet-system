-- ─────────────────────────────────────────────────────
-- 030: Support one-off pieces (design_id nullable) and
-- broaden check constraints so CSV import accepts a
-- richer set of categories / metal karats / colours /
-- diamond types / statuses.
-- ─────────────────────────────────────────────────────

-- Allow pieces without a design (one-off / vintage / loose stones).
alter table inventory_pieces
  alter column design_id drop not null;

-- Broaden category check on designs to include CSV-friendly values.
alter table inventory_designs
  drop constraint if exists inventory_designs_category_check;

alter table inventory_designs
  add constraint inventory_designs_category_check
  check (category is null or category in (
    'Engagement Ring','Wedding Ring','Wedding Band','Fine Jewellery',
    'Earrings','Bracelet','Necklace','Pendant','Brooch','Ring',
    'Loose Stone','Component','Other'
  ));

-- Broaden metal_karat check.
alter table inventory_pieces
  drop constraint if exists inventory_pieces_metal_karat_check;

alter table inventory_pieces
  add constraint inventory_pieces_metal_karat_check
  check (metal_karat is null or metal_karat in (
    '9K','14K','18K','22K','24K','Platinum','Silver','Other'
  ));

-- Broaden metal_colour check.
alter table inventory_pieces
  drop constraint if exists inventory_pieces_metal_colour_check;

alter table inventory_pieces
  add constraint inventory_pieces_metal_colour_check
  check (metal_colour is null or metal_colour in (
    'Yellow','White','Rose','Two-Tone','Tri-Colour','N/A','Other'
  ));

-- Broaden diamond_type check.
alter table inventory_pieces
  drop constraint if exists inventory_pieces_diamond_type_check;

alter table inventory_pieces
  add constraint inventory_pieces_diamond_type_check
  check (diamond_type is null or diamond_type in (
    'Natural','Lab Grown','Moissanite','None'
  ));

-- Broaden status check.
alter table inventory_pieces
  drop constraint if exists inventory_pieces_status_check;

alter table inventory_pieces
  add constraint inventory_pieces_status_check
  check (status in (
    'in_stock','on_order','sold','workshop','consignment','repair'
  ));

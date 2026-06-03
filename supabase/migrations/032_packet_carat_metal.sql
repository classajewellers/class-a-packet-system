-- ─────────────────────────────────────────────────────────────────────────────
-- 032: Add carat_weight and metal_colour to packets table.
--
-- PCN (Personalised Charm Necklace) and similar jewellery orders need
-- structured fields for carat weight and metal colour so staff can record
-- these details when processing orders — either captured from Shopify attributes
-- or entered manually.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE packets
  ADD COLUMN IF NOT EXISTS carat_weight  numeric(8,3) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS metal_colour  text         DEFAULT NULL;

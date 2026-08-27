-- ─────────────────────────────────────────────────────────────────────────────
-- 100: Add stone_species to inventory_pieces
--
-- Adds a free-text species tag for non-diamond gemstones (sapphire, emerald,
-- ruby, alexandrite, etc.). Display and inventory use only — never read by
-- calculate_price(). Pricing for coloured stones reuses the existing stone_cost
-- → p_stone_wholesale path through the natural_stone / lab_stone carat tiers,
-- which is already correct for non-diamond stones.
--
-- stone_cost (existing column) — wholesale cost, feeds calculate_price().
-- stone_species (new column)   — species label, display only.
--
-- Targets: production giucusqyobfsdfwwfyue only.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE inventory_pieces
  ADD COLUMN IF NOT EXISTS stone_species text;

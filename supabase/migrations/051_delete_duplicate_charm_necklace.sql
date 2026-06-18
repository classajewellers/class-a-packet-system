-- Delete 3 duplicate "Personalised Charm Necklace" products.
-- Keep only id: 2a1d6a72-9bb5-435c-a3f7-c4d049123987 (the most recent).
-- Variants are deleted first to satisfy the FK constraint on product_id.

DELETE FROM pricing_product_variants
WHERE product_id IN (
  SELECT id FROM pricing_products
  WHERE name = 'Personalised Charm Necklace'
  AND id != '2a1d6a72-9bb5-435c-a3f7-c4d049123987'
);

DELETE FROM pricing_products
WHERE name = 'Personalised Charm Necklace'
AND id != '2a1d6a72-9bb5-435c-a3f7-c4d049123987';

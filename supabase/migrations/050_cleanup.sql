-- Remove two rows that were added as fixed costs but belong in rate cards.
-- These labels do not exist in pricing_fixed_costs so the first two DELETEs
-- are safe no-ops if the table is clean; the third covers pricing_labour_rates
-- where migration 049 inserted them.

DELETE FROM pricing_fixed_costs
WHERE label IN (
  'Butterflies (earrings add-on)',
  'Chain (bracelet/necklace add-on)'
);

DELETE FROM pricing_labour_rates
WHERE rate_name IN (
  'Butterflies (earrings add-on)',
  'Chain (bracelet/necklace add-on)'
);

-- Add the Casting category for every tenant that does not already have one.
-- Approved by Josh 2026-09-24. Existing categories stay sort_order 1–9;
-- Casting is 10 and active. Idempotent: safe to run more than once.
-- Does not insert any other category.

INSERT INTO public.inventory_categories (tenant_id, name, sort_order, is_active)
SELECT t.id, 'Casting', 10, true
FROM public.tenants t
WHERE NOT EXISTS (
  SELECT 1
  FROM public.inventory_categories c
  WHERE c.tenant_id = t.id
    AND c.name = 'Casting'
);

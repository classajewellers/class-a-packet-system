-- Grace stock-visibility (Available to Promise) feature — schema support.
--
-- 1. Extends inventory_reservations (does not replace it) with real FK
--    columns so reservations can be tied to an actual quote/order record
--    instead of only the existing free-text quote_reference/order_reference
--    fields (left untouched for backward compatibility with any existing
--    manual reservations).
--
--    order_id references packets(id), NOT a standalone "orders" table —
--    confirmed 2026-09-23 that Vault has no orders table; /app/orders is
--    packets filtered by packet_type/order_source. This matches the
--    existing inventory_reservations.workshop_packet_id, which already
--    points at packets(id) for the same reason.
--
-- 2. Adds workshop_jobs.product_id, confirmed 2026-09-23 to reference
--    inventory_products (NOT inventory_designs/inventory_pieces.design_id —
--    inventory_designs is live-empty and unused; inventory_products is what
--    the real product detail page and live data actually use, including a
--    real live product named "Grace" itself).

ALTER TABLE public.inventory_reservations
  ADD COLUMN IF NOT EXISTS quote_id uuid REFERENCES public.quotes(id) ON DELETE SET NULL;

ALTER TABLE public.inventory_reservations
  ADD COLUMN IF NOT EXISTS order_id uuid REFERENCES public.packets(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS inventory_reservations_quote_id_idx
  ON public.inventory_reservations (quote_id);

CREATE INDEX IF NOT EXISTS inventory_reservations_order_id_idx
  ON public.inventory_reservations (order_id);

ALTER TABLE public.workshop_jobs
  ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES public.inventory_products(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS workshop_jobs_product_id_idx
  ON public.workshop_jobs (product_id);

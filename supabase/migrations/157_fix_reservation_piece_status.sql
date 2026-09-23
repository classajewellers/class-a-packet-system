-- Fixes the manual "Reserve" button (app/api/inventory/reservations),
-- broken on live staging — confirmed 2026-09-23: inventory_pieces has no
-- status_id column, and even if it did, 'reserved' was not a valid value
-- in inventory_pieces' own status text CHECK constraint (migration 030:
-- in_stock|on_order|sold|workshop|consignment|repair).
--
-- Adds a plain text previous_piece_status column to inventory_reservations
-- to support reverting a piece's status on release — the existing
-- previous_status_id column (uuid, references inventory_statuses) is left
-- in place untouched but is not usable for this, since inventory_pieces.
-- status is a free text value, not an inventory_statuses row. Named
-- previous_piece_status (not previous_status) to avoid colliding with the
-- existing "previous_status" PostgREST embed alias already used in
-- GET /api/inventory/reservations (previous_status:inventory_statuses!
-- previous_status_id(...)) — a same-named real column would collide with
-- that computed alias in the API response.

ALTER TABLE public.inventory_pieces
  DROP CONSTRAINT IF EXISTS inventory_pieces_status_check;

ALTER TABLE public.inventory_pieces
  ADD CONSTRAINT inventory_pieces_status_check
  CHECK (status IN (
    'in_stock', 'on_order', 'sold', 'workshop', 'consignment', 'repair', 'reserved'
  ));

ALTER TABLE public.inventory_reservations
  ADD COLUMN IF NOT EXISTS previous_piece_status text;

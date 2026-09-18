-- -----------------------------------------------------------------------------
-- 129: fields needed for the new customer-facing "Place Your Order" page
--
-- 1. Delivery address on quotes - collected from the customer on the new
--    /quote/[id]/order page before payment, since no address field existed
--    on quotes at all (confirmed gap during B3 scoping). Column names
--    deliberately match PacketFormData's field names exactly (see
--    lib/types.ts) so the auto-packet-creation logic planned for B3 can map
--    these across with zero translation.
--
-- 2. terms_and_conditions on tenants - per-tenant, freeform T&Cs text shown
--    on the order page with a required checkbox before payment. Confirmed
--    via a repo-wide search that no T&Cs text is stored anywhere today
--    (only a bare terms_accepted boolean on the unrelated layby packet
--    form, with no backing content) - this is genuinely new, not drift.
--    Same plain-column-on-tenants pattern as bank_name (055) and
--    deposit_percentage (128) - a single per-tenant value, no sub-structure.
--
-- Safe to re-run (ADD COLUMN IF NOT EXISTS throughout).
-- -----------------------------------------------------------------------------

ALTER TABLE quotes ADD COLUMN IF NOT EXISTS customer_street text;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS customer_suburb text;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS customer_state text;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS customer_postcode text;

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS terms_and_conditions text;

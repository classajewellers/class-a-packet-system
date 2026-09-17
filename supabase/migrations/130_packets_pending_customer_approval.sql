-- -----------------------------------------------------------------------------
-- 130: pending_customer_approval flag on packets (B3 auto-order-creation gate)
--
-- Packets auto-created from a paid quote (Stripe webhook -> lib/createPacket.ts)
-- land with this flag set true, and must be cleared by a manager before the
-- packet can progress through the workshop pipeline - mirrors the existing
-- workshop_needs_valuation gate pattern (069_workshop_rebuild.sql), enforced
-- server-side in app/api/workshop/packets/[id]/route.ts (and the qc/pickup
-- routes), not just in the UI.
--
-- Default false preserves current behaviour for every existing and
-- manually-created packet.
--
-- Safe to re-run (ADD COLUMN IF NOT EXISTS).
-- -----------------------------------------------------------------------------

ALTER TABLE packets ADD COLUMN IF NOT EXISTS pending_customer_approval boolean NOT NULL DEFAULT false;

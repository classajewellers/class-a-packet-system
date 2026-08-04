-- 082_inventory_locations_hierarchy.sql
--
-- Formalises hierarchical structure for inventory_locations
-- (Store → Area → Cabinet → Tray).
--
-- parent_id was first added in migration 024 with ON DELETE CASCADE.
-- The ADD COLUMN IF NOT EXISTS guard is a safe no-op in environments where
-- that migration already ran. In environments where it didn't, this adds the
-- column with ON DELETE SET NULL (orphans children as top-level on parent
-- delete rather than cascade-deleting them — the safer default for production).
--
-- Existing rows keep parent_id = NULL (top-level) by default.
-- No automatic hierarchy assignment is performed; Josh will arrange locations
-- manually via the Locations settings UI.

ALTER TABLE inventory_locations
  ADD COLUMN IF NOT EXISTS parent_id uuid
    REFERENCES inventory_locations(id) ON DELETE SET NULL;

-- Index for efficient "give me children of X" queries
CREATE INDEX IF NOT EXISTS inventory_locations_parent_idx
  ON inventory_locations (parent_id);

-- Confirm type CHECK values in use for reference:
-- Original CHECK: type in ('display','storage','workshop','transit','consignment')
-- No changes to the type column — existing values preserved.

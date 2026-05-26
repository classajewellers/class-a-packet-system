-- ─────────────────────────────────────────────────────
-- 024: Add parent/child hierarchy to inventory_locations
-- ─────────────────────────────────────────────────────

alter table inventory_locations
  add column if not exists parent_id uuid references inventory_locations(id) on delete cascade;

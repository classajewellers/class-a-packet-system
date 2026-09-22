-- 144: close the inventory_statuses / inventory_categories staging drift
--
-- STAGING DRIFT FOUND during the 2026-09-22 operational-readiness live-audit.
-- Direct read-only checks against staging found inventory_statuses and
-- inventory_categories missing entirely. Unlike every other drift found
-- this session, these two tables have NO migration file anywhere in the
-- repo — they were evidently hand-created directly against a database (per
-- production) rather than through the migration system, so there was no
-- committed source of truth to replay.
--
-- Schema confirmed directly by Josh from production (2026-09-22, via a
-- column listing), not inferred from code usage:
--   id uuid, tenant_id uuid, name text, sort_order integer,
--   is_active boolean, created_at timestamptz
--
-- inventory_statuses gates core inventory logic — "Mark as Sold"
-- (app/api/inventory/sales/route.ts) does an ilike '%sold%' name match
-- against it, and inventory_pieces.status_id references it throughout the
-- inventory UI. A structurally-correct-but-empty table would still break
-- that flow (no "Sold" status to resolve). Seed data is added in a
-- follow-up migration once the real row content is confirmed from
-- production (read-only) — see VAULT_BUILD_CHECKLIST.md.
--
-- Production was NOT checked for whether it's also missing these — that
-- would be a contradiction (Josh confirmed the schema FROM production, so
-- production has them) — this migration is staging-only by construction,
-- no risk of it needing production treatment.

CREATE TABLE IF NOT EXISTS inventory_statuses (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid        NOT NULL,
  name       text        NOT NULL,
  sort_order integer,
  is_active  boolean     NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE inventory_statuses ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS inventory_statuses_tenant_idx
  ON inventory_statuses (tenant_id);

CREATE TABLE IF NOT EXISTS inventory_categories (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid        NOT NULL,
  name       text        NOT NULL,
  sort_order integer,
  is_active  boolean     NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE inventory_categories ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS inventory_categories_tenant_idx
  ON inventory_categories (tenant_id);

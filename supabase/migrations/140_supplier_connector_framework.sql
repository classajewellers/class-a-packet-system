-- 140: Supplier Connector Framework — schema
--
-- Phase 2.1 of the 2026-09-22 operational-readiness build
-- (VAULT_BUILD_CHECKLIST.md). Extends the existing inventory_suppliers table
-- rather than inventing a parallel "connections" table — suppliers already
-- exist as first-class, tenant-scoped rows here, and migration 110 already
-- established the "supplier-specific config lives as JSONB on the supplier
-- row" pattern (catalog_import_config). This generalizes that same pattern
-- into a real connector model instead of one bespoke config column.
--
-- The only prior "connector-shaped" precedent in the codebase is
-- tenant_shopify_connections (migration 078) — single-provider, one row per
-- tenant, plaintext access_token. Not reused directly here because it's
-- Shopify-specific (webhook_registered, shop_domain) and one-per-tenant,
-- whereas a tenant can have many suppliers each with their own connector.
--
-- Staging drift found while writing this (checked directly, same read-only
-- method as the last two drifts this session): inventory_suppliers.
-- catalog_import_config (migration 110) does NOT exist on staging, despite
-- being referenced by the live catalog-import API route. Every other
-- inventory_suppliers column from migrations 035/085/099/123 is present —
-- this is a single missing column, not a broader gap. Re-applied here
-- defensively (IF NOT EXISTS) rather than opening a fourth micro-migration.
--
-- connector_type: nullable discriminator. NULL = no connector configured,
-- pure manual entry (today's default for every existing supplier — nothing
-- changes for them). 'prana_csv' is the first real value, matching the
-- deterministic monthly-file workflow that already exists and works
-- (lib/melee-import-shared.mjs, scripts/import-prana-melee.mjs) — this
-- migration does not change how that workflow operates, it just gives it a
-- home in the connector model instead of being implicit/undeclared.
--
-- connector_credentials: same plaintext-JSONB approach as
-- tenant_shopify_connections.access_token (an existing accepted pattern in
-- this codebase, not a new risk introduced here) — nullable, unused until a
-- connector actually needs live API credentials (none do yet; Prana's
-- connector today operates on an uploaded file, no stored credentials).
--
-- supplier_sync_log: one row per connector sync attempt, regardless of
-- connector_type or whether it succeeded — gives Phase 3's reporting engine
-- and any future "connector health" UI something real to read, and follows
-- the same "log first, always" principle as webhook_events (migration 136).

-- ── Close the small pre-existing drift found while working on this ──────────
ALTER TABLE inventory_suppliers
  ADD COLUMN IF NOT EXISTS catalog_import_config jsonb;

-- ── Connector fields on the existing supplier row ─────────────────────────────
ALTER TABLE inventory_suppliers
  ADD COLUMN IF NOT EXISTS connector_type text,
  ADD COLUMN IF NOT EXISTS connector_credentials jsonb,
  ADD COLUMN IF NOT EXISTS connector_last_synced_at timestamptz;

-- ── Sync log — durable record of every connector run ─────────────────────────
CREATE TABLE IF NOT EXISTS supplier_sync_log (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid        NOT NULL,
  supplier_id     uuid        NOT NULL REFERENCES inventory_suppliers(id) ON DELETE CASCADE,
  connector_type  text        NOT NULL,
  -- pending   — sync started, not yet finished
  -- succeeded — completed, rows_processed reflects real output
  -- failed    — threw before producing usable output; error_message set
  status          text        NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'succeeded', 'failed')),
  rows_processed  integer,
  rows_flagged    integer,    -- rows the deterministic parser couldn't confidently normalize
  error_message   text,
  source_label    text,       -- e.g. the uploaded filename — human-readable "what was synced"
  started_at      timestamptz NOT NULL DEFAULT now(),
  completed_at    timestamptz
);
ALTER TABLE supplier_sync_log DISABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS supplier_sync_log_tenant_idx   ON supplier_sync_log (tenant_id);
CREATE INDEX IF NOT EXISTS supplier_sync_log_supplier_idx ON supplier_sync_log (supplier_id, started_at DESC);

-- -----------------------------------------------------------------------------
-- 136: webhook_events staging table + Shopify order idempotency guard
--
-- Root cause context (order #3690, Tayla Gagliardi, 2026-09-21 investigation):
-- the Shopify webhook handler returns 200 to Shopify the instant the request
-- is received, then does all real processing asynchronously via waitUntil().
-- If that background processing is interrupted (as happened here — three
-- deliveries in a 20-minute window stalled with no trace at all, root cause
-- unconfirmed but consistent with a transient platform interruption), there
-- was previously NO durable record that the delivery ever happened — only
-- console.log/console.error output in Vercel's function logs, which has
-- limited retention and isn't queryable for "did we process every order."
--
-- This migration adds:
--   1. webhook_events — an append-only staging table written synchronously
--      BEFORE the webhook route responds to Shopify, independent of whether
--      downstream processing (packet creation) ever succeeds.
--   2. A partial unique index on packets(tenant_id, shopify_order_id) so a
--      retried/replayed webhook can never create a second packet for the
--      same Shopify order — confirmed via direct staging query that no such
--      constraint existed before this migration, and that no duplicate rows
--      currently exist to violate it.
--
-- Staging drift note: migration 077_shopify_pickup.sql (which added
-- packets.shopify_order_id / shopify_fulfillment_id) was found NOT to have
-- been applied to the vault-staging database, despite later migrations
-- (130+) being present there — an inconsistent gap, not a simple "staging is
-- N migrations behind." Re-running 077's two ADD COLUMN IF NOT EXISTS
-- statements here is a safe no-op wherever they already exist (production)
-- and self-heals staging's specific gap.
-- -----------------------------------------------------------------------------

-- ── Re-apply 077's columns (idempotent; closes the staging drift found above) ──
ALTER TABLE packets ADD COLUMN IF NOT EXISTS shopify_order_id TEXT;
ALTER TABLE packets ADD COLUMN IF NOT EXISTS shopify_fulfillment_id TEXT;

-- ── webhook_events ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS webhook_events (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID REFERENCES tenants(id),

  -- Where this came from and what it claims to be. topic/external_id are
  -- best-effort — populated from whatever we can read off the raw body
  -- without fully trusting it (a malformed payload still gets a row).
  source         TEXT NOT NULL DEFAULT 'shopify',
  topic          TEXT,                    -- e.g. Shopify's X-Shopify-Topic header value
  external_id    TEXT,                    -- Shopify order id/name if parseable
  shop_domain    TEXT,

  -- The raw request body, captured as TEXT before any JSON.parse attempt, so
  -- a malformed/unparseable body is still preserved verbatim rather than
  -- silently discarded (closes the exact blind spot the old JSON-parse-
  -- failure catch had: it returned 200 and logged nothing durable).
  raw_body       TEXT NOT NULL,

  -- received   — row inserted, response not yet sent to Shopify
  -- processing — response sent, background processing started
  -- processed  — packet created (or a duplicate was correctly skipped)
  -- failed     — background processing threw; error_message is set
  -- parse_failed — raw_body could not be parsed as JSON at all
  status         TEXT NOT NULL DEFAULT 'received'
                   CHECK (status IN ('received', 'processing', 'processed', 'failed', 'parse_failed')),
  error_message  TEXT,
  packet_id      UUID REFERENCES packets(id),

  -- Set when resolveTenantId() couldn't match shop_domain to a known tenant
  -- connection and fell back to the hardcoded default — previously this was
  -- fully invisible; it's now at least recorded on the row it affected.
  tenant_fallback_used BOOLEAN NOT NULL DEFAULT false,

  attempt_count  INT NOT NULL DEFAULT 0,
  received_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at   TIMESTAMPTZ
);

-- Used by the "stuck events" visibility check (received/processing rows
-- older than a threshold) and by the tenant-scoped Settings/Vault Brain view.
CREATE INDEX IF NOT EXISTS idx_webhook_events_status_received_at
  ON webhook_events (status, received_at);
CREATE INDEX IF NOT EXISTS idx_webhook_events_tenant_id
  ON webhook_events (tenant_id);

-- New table, same convention as every other table in this schema: tenancy is
-- enforced in application code (tenant_id filtered server-side), not RLS.
ALTER TABLE webhook_events DISABLE ROW LEVEL SECURITY;

-- ── Idempotency: one packet per (tenant, Shopify order), maximum ──────────────
-- Partial (not a plain UNIQUE column) so every non-Shopify packet — the
-- overwhelming majority of rows, all NULL on this column — is completely
-- unaffected. Only applies once shopify_order_id is actually set.
--
-- Safety note for whoever runs this against production: run the duplicate
-- check below FIRST. If it returns zero rows, the CREATE UNIQUE INDEX is
-- guaranteed to succeed. If it returns any rows, STOP — that means two
-- packets already exist for the same Shopify order today, and those need to
-- be manually reconciled (which one is real / merge / delete) before this
-- index can be created, or the CREATE UNIQUE INDEX statement will fail.
--
--   SELECT tenant_id, shopify_order_id, COUNT(*), array_agg(id) AS packet_ids
--   FROM packets
--   WHERE shopify_order_id IS NOT NULL
--   GROUP BY tenant_id, shopify_order_id
--   HAVING COUNT(*) > 1;
--
CREATE UNIQUE INDEX IF NOT EXISTS packets_tenant_shopify_order_id_unique
  ON packets (tenant_id, shopify_order_id)
  WHERE shopify_order_id IS NOT NULL;

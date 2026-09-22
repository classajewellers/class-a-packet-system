-- 150: notifications system (Phase 1) — real feature, new build
--
-- Confirmed missing from BOTH staging and production (2026-09-22) — unlike
-- every other "notifications" reference found this session (which turned
-- out to be dead code written against a table that was never built), this
-- is a genuine new feature: a bell/badge notification centre in Vault's
-- top nav. See VAULT_BUILD_CHECKLIST.md for the full design.
--
-- user_id is nullable BY DESIGN: some notifications have one obvious
-- recipient (a quote follow-up reminder, Phase 2 — goes to whoever it's
-- assigned to); others don't (a Stripe deposit-failure alert isn't "for"
-- any one person). NULL user_id = broadcast to every manager/admin in the
-- tenant; a real user_id = targeted to that one person. The API filters on
-- (user_id = me) OR (user_id IS NULL AND my role is manager/admin).
--
-- link_type/link_id is a generic pointer (not separate nullable
-- packet_id/quote_id columns) since more notification types are coming
-- and a fixed set of FK columns doesn't scale with that.
--
-- Follows this codebase's established convention: RLS disabled, tenant
-- isolation enforced entirely in app code via tenantScoped()
-- (lib/tenantScoped.ts) — not by RLS policies.

CREATE TABLE IF NOT EXISTS notifications (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id     uuid        REFERENCES profiles(id) ON DELETE CASCADE,
  type        text        NOT NULL,
  title       text        NOT NULL,
  message     text,
  link_type   text,
  link_id     uuid,
  is_read     boolean     NOT NULL DEFAULT false,
  read_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE notifications DISABLE ROW LEVEL SECURITY;

-- The hot-path query is "my unread notifications for this tenant, newest
-- first" — this index covers it directly, including the broadcast case
-- (user_id IS NULL rows still match a partial index on (tenant_id, is_read)
-- but a plain composite index handles both since Postgres treats NULL
-- consistently within a btree column).
CREATE INDEX IF NOT EXISTS notifications_tenant_user_unread_idx
  ON notifications (tenant_id, user_id, is_read, created_at DESC);

CREATE INDEX IF NOT EXISTS notifications_link_idx
  ON notifications (link_type, link_id);

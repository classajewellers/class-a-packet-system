-- Migration 068: two-way SMS thread storage
-- Stores outbound (direction='out') and inbound (direction='in') messages per customer.
-- Tenant-scoped. No RLS — service role key used throughout.

CREATE TABLE IF NOT EXISTS sms_messages (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID        NOT NULL,
  customer_id UUID        NOT NULL,
  direction   TEXT        NOT NULL CHECK (direction IN ('out', 'in')),
  body        TEXT        NOT NULL,
  twilio_sid  TEXT        NULL,
  staff_id    UUID        NULL,
  read_at     TIMESTAMPTZ NULL,
  sent_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE sms_messages DISABLE ROW LEVEL SECURITY;

ALTER TABLE sms_messages ADD COLUMN IF NOT EXISTS twilio_sid TEXT        NULL;
ALTER TABLE sms_messages ADD COLUMN IF NOT EXISTS staff_id   UUID        NULL;
ALTER TABLE sms_messages ADD COLUMN IF NOT EXISTS read_at    TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS sms_messages_tenant_customer_idx
  ON sms_messages (tenant_id, customer_id, sent_at DESC);

-- Partial index for fast unread-badge queries
CREATE INDEX IF NOT EXISTS sms_messages_tenant_unread_idx
  ON sms_messages (tenant_id, read_at)
  WHERE read_at IS NULL AND direction = 'in';

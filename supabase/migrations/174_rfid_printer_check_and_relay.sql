-- 174_rfid_printer_check_and_relay.sql
--
-- NOT APPLIED in the printer-direct prep slice. Apply on staging only when
-- the printer check and the relay flag are ready to be stored.
--
-- last_check      — latest read-only getvar report from the bridge, as JSON
-- head_dpi        — head.resolution.in_dpi from that report (null if no reply)
-- relay_enabled   — when true AND RFID_PRINT_RELAY=1, print jobs go to the
--                   weblink relay. Default false, so today's bridge path stays.
-- relay_token_hash — SHA-256 hex of the per-printer weblink token. The raw
--                   token is shown once by the seed route and is not stored.

ALTER TABLE rfid_printers
  ADD COLUMN IF NOT EXISTS last_check jsonb,
  ADD COLUMN IF NOT EXISTS head_dpi integer,
  ADD COLUMN IF NOT EXISTS relay_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS relay_token_hash text;

COMMENT ON COLUMN rfid_printers.last_check IS
  'Latest read-only printer check posted by the bridge.';
COMMENT ON COLUMN rfid_printers.head_dpi IS
  'head.resolution.in_dpi from the latest printer check.';
COMMENT ON COLUMN rfid_printers.relay_enabled IS
  'Send print jobs to the weblink relay only when this is true and RFID_PRINT_RELAY is on.';

-- 087_po_lines_packet_link.sql
-- Links PO lines to the packets table (which is the unified record for both
-- customer orders and workshop jobs in this codebase — the Orders and Workshop
-- views both query the same packets table, just with different filters).
--
-- NULL packet_id = general stock line (the common case, no extra step required).
-- Non-null = this line is earmarked for a specific customer order/job.
--
-- Uses ON DELETE SET NULL so a deleted packet does not cascade-delete PO data.

ALTER TABLE inventory_po_lines
  ADD COLUMN IF NOT EXISTS packet_id UUID REFERENCES packets(id) ON DELETE SET NULL;

ALTER TABLE inventory_po_lines DISABLE ROW LEVEL SECURITY;

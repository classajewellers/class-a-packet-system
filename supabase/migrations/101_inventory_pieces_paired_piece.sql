-- ─────────────────────────────────────────────────────────────────────────────
-- 101: Add paired_piece_id to inventory_pieces
--
-- Supports earrings (and other paired items) stored as two independent pieces,
-- each priced and inventoried separately, linked to each other for display.
--
-- paired_piece_id is stored on ONE piece only (not both). The detail page
-- queries for the back-reference (any piece where paired_piece_id = this piece's id)
-- so both earrings show the pairing regardless of which side stores the FK.
--
-- ON DELETE SET NULL: deleting either earring automatically clears the link
-- on the other piece rather than blocking the delete.
--
-- Targets: production giucusqyobfsdfwwfyue only.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE inventory_pieces
  ADD COLUMN IF NOT EXISTS paired_piece_id uuid
    REFERENCES inventory_pieces(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS inventory_pieces_paired_idx
  ON inventory_pieces (paired_piece_id)
  WHERE paired_piece_id IS NOT NULL;

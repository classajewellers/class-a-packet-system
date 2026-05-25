-- ── 018_claim_slip.sql ────────────────────────────────────────────────────────
-- Adds claim slip tracking columns to the packets table.
-- Also creates the claim-slips Storage bucket with public read access.
-- Run in Supabase SQL Editor.

-- Packets table columns
ALTER TABLE packets
  ADD COLUMN IF NOT EXISTS claim_slip_sent     boolean   DEFAULT false,
  ADD COLUMN IF NOT EXISTS claim_slip_url      text,
  ADD COLUMN IF NOT EXISTS claim_slip_sent_at  timestamptz;

-- Storage bucket (public — customers access via direct URL in SMS)
INSERT INTO storage.buckets (id, name, public, allowed_mime_types)
VALUES (
  'claim-slips',
  'claim-slips',
  true,
  ARRAY['text/html']
)
ON CONFLICT (id) DO NOTHING;

-- Allow public reads on the claim-slips bucket (required for public = true to work)
CREATE POLICY IF NOT EXISTS "Public read claim-slips"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'claim-slips');

-- Allow service role to insert / update objects in claim-slips
CREATE POLICY IF NOT EXISTS "Service role write claim-slips"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'claim-slips');

CREATE POLICY IF NOT EXISTS "Service role update claim-slips"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'claim-slips');

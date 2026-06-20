-- Add speciality field to profiles for workshop staff configuration
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS speciality TEXT;

-- Backfill job_type on existing workshop packets based on packet_type
UPDATE packets
SET job_type = CASE
  WHEN packet_type ILIKE '%repair%' OR packet_type ILIKE '%service%' THEN 'repair'
  WHEN packet_type ILIKE '%custom%' OR packet_type ILIKE '%bespoke%' OR packet_type ILIKE '%commission%' THEN 'custom_order'
  WHEN packet_type ILIKE '%stock%' OR packet_type ILIKE '%internal%' THEN 'stock_work'
  ELSE 'repair'
END
WHERE job_type IS NOT NULL
  AND job_type IN ('repair', 'custom_order', 'stock_work')
  AND packet_type IS NOT NULL
  AND (
    (packet_type ILIKE '%custom%' OR packet_type ILIKE '%bespoke%' OR packet_type ILIKE '%commission%') AND job_type = 'repair'
    OR (packet_type ILIKE '%stock%' OR packet_type ILIKE '%internal%') AND job_type = 'repair'
    OR (packet_type ILIKE '%repair%' OR packet_type ILIKE '%service%') AND job_type != 'repair'
  );

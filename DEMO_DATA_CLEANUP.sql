-- ============================================================
-- DEMO DATA CLEANUP
-- Run this in the Supabase SQL editor (staging only) to remove
-- all demo/marketing data seeded by scripts/demo-data-seed.sql.
-- Every object created by the seed has reference_number LIKE 'DEMO-%'
-- or customer email LIKE '%.demo@example.com'.
-- ============================================================

-- 1. Packets (workshop board)
DELETE FROM packets
WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
  AND reference_number LIKE 'DEMO-%';

-- 2. Quotes
DELETE FROM quotes
WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
  AND reference_number LIKE 'DEMO-%';

-- 3. Manager noticeboard messages (matched by content prefix)
DELETE FROM workshop_manager_messages
WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
  AND (
    text LIKE 'New CAD software%'
    OR text LIKE 'Reminder: subcontractor invoices%'
  );

-- 4. Customers (matched by demo email domain)
DELETE FROM customers
WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
  AND email LIKE '%.demo@example.com';

-- Lead times are real config — intentionally NOT deleted.
-- If you want to reset them: DELETE FROM workshop_lead_times WHERE tenant_id = '00000000-0000-0000-0000-000000000001';

-- ============================================================
-- DEMO DATA SEED — Vault marketing screenshots
-- Tenant: 00000000-0000-0000-0000-000000000001 (Class A staging)
-- ALL reference numbers prefixed "DEMO-" for easy bulk-delete.
-- Delete everything with: DELETE FROM packets WHERE reference_number LIKE 'DEMO-%';
-- See DEMO_DATA_CLEANUP.sql for the full cleanup script.
-- DO NOT run against production.
-- ============================================================

DO $$
DECLARE
  tid  UUID := '00000000-0000-0000-0000-000000000001';

  -- Customer IDs (declared so packets + quotes can reference them)
  c1   UUID; -- Sophie Mitchell    (Argyle VIP)
  c2   UUID; -- James Hartley      (Gold)
  c3   UUID; -- Emily Chen         (Diamond)
  c4   UUID; -- Oliver Blackwood   (Silver)
  c5   UUID; -- Amelia Nguyen      (no tier)
  c6   UUID; -- William Forsythe   (Silver)
  c7   UUID; -- Charlotte Brennan  (Diamond)
  c8   UUID; -- Noah Walsh         (no tier)
  c9   UUID; -- Isabella Grant     (Gold)
  c10  UUID; -- Jack Carmichael    (no tier)
  c11  UUID; -- Mia Poulton        (Silver)
  c12  UUID; -- Liam Stefanidis    (Platinum)
  c13  UUID; -- Ava Morrison       (no tier)
  c14  UUID; -- Ethan Kowalski     (Silver)
  c15  UUID; -- Grace Tanaka       (Gold)

BEGIN

-- ── 1. CUSTOMERS ─────────────────────────────────────────────────────────────

INSERT INTO customers (tenant_id, first_name, last_name, email, phone,
  address, suburb, state, postcode, referral_source,
  total_orders, total_spend, last_visit_date, notes)
VALUES
  (tid, 'Sophie',    'Mitchell',   'sophie.mitchell.demo@example.com',   '0412 111 001',
   '14 Flinders Way',       'Hawthorn',       'VIC', '3122', 'Word of Mouth',
   22, 32000.00, '2026-07-15', 'Prefers rose gold. Engaged 2024.')
RETURNING id INTO c1;

INSERT INTO customers (tenant_id, first_name, last_name, email, phone,
  address, suburb, state, postcode, referral_source,
  total_orders, total_spend, last_visit_date, notes)
VALUES
  (tid, 'James',     'Hartley',    'james.hartley.demo@example.com',     '0423 222 002',
   '7 Acacia Drive',         'Toorak',         'VIC', '3142', 'Instagram',
   7, 11500.00, '2026-06-28', 'Anniversary pieces every year.')
RETURNING id INTO c2;

INSERT INTO customers (tenant_id, first_name, last_name, email, phone,
  address, suburb, state, postcode, referral_source,
  total_orders, total_spend, last_visit_date, notes)
VALUES
  (tid, 'Emily',     'Chen',       'emily.chen.demo@example.com',        '0434 333 003',
   '29 High Street',         'Malvern',        'VIC', '3144', 'Referral',
   16, 22800.00, '2026-07-22', 'Collects coloured sapphires. Budget flexible.')
RETURNING id INTO c3;

INSERT INTO customers (tenant_id, first_name, last_name, email, phone,
  address, suburb, state, postcode, referral_source,
  total_orders, total_spend, last_visit_date, notes)
VALUES
  (tid, 'Oliver',    'Blackwood',  'oliver.blackwood.demo@example.com',  '0445 444 004',
   '3 Ormond Road',          'Glen Waverley',  'VIC', '3150', 'Google',
   4, 6200.00, '2026-05-14', 'Prefers yellow gold.')
RETURNING id INTO c4;

INSERT INTO customers (tenant_id, first_name, last_name, email, phone,
  address, suburb, state, postcode, referral_source,
  total_orders, total_spend, last_visit_date, notes)
VALUES
  (tid, 'Amelia',    'Nguyen',     'amelia.nguyen.demo@example.com',     '0456 555 005',
   '88 Station Street',      'Box Hill',       'VIC', '3128', 'Facebook',
   2, 2300.00, '2026-07-01', 'First engagement ring enquiry.')
RETURNING id INTO c5;

INSERT INTO customers (tenant_id, first_name, last_name, email, phone,
  address, suburb, state, postcode, referral_source,
  total_orders, total_spend, last_visit_date, notes)
VALUES
  (tid, 'William',   'Forsythe',   'william.forsythe.demo@example.com',  '0467 666 006',
   '11 Park Crescent',       'South Yarra',    'VIC', '3141', 'Walk-in',
   5, 7800.00, '2026-06-10', 'Custom signet ring for 50th birthday.')
RETURNING id INTO c6;

INSERT INTO customers (tenant_id, first_name, last_name, email, phone,
  address, suburb, state, postcode, referral_source,
  total_orders, total_spend, last_visit_date, notes)
VALUES
  (tid, 'Charlotte', 'Brennan',    'charlotte.brennan.demo@example.com', '0478 777 007',
   '52 Collins Street',      'Melbourne',      'VIC', '3000', 'Referral',
   18, 24500.00, '2026-07-18', 'Bridal party of 4 — wedding Nov 2026.')
RETURNING id INTO c7;

INSERT INTO customers (tenant_id, first_name, last_name, email, phone,
  address, suburb, state, postcode, referral_source,
  total_orders, total_spend, last_visit_date, notes)
VALUES
  (tid, 'Noah',      'Walsh',      'noah.walsh.demo@example.com',        '0489 888 008',
   '66 Glenferrie Road',     'Kooyong',        'VIC', '3144', 'Google',
   1, 1500.00, '2026-07-25', 'Gift for wife — 10th anniversary.')
RETURNING id INTO c8;

INSERT INTO customers (tenant_id, first_name, last_name, email, phone,
  address, suburb, state, postcode, referral_source,
  total_orders, total_spend, last_visit_date, notes)
VALUES
  (tid, 'Isabella',  'Grant',      'isabella.grant.demo@example.com',    '0491 999 009',
   '22 Auburn Road',         'Hawthorn East',  'VIC', '3123', 'Instagram',
   8, 13200.00, '2026-07-20', 'Lab grown diamonds preferred.')
RETURNING id INTO c9;

INSERT INTO customers (tenant_id, first_name, last_name, email, phone,
  address, suburb, state, postcode, referral_source,
  total_orders, total_spend, last_visit_date, notes)
VALUES
  (tid, 'Jack',      'Carmichael', 'jack.carmichael.demo@example.com',   '0402 010 010',
   '5 Boundary Road',        'Prahran',        'VIC', '3181', 'Walk-in',
   3, 3400.00, '2026-06-05', 'Repairs only so far.')
RETURNING id INTO c10;

INSERT INTO customers (tenant_id, first_name, last_name, email, phone,
  address, suburb, state, postcode, referral_source,
  total_orders, total_spend, last_visit_date, notes)
VALUES
  (tid, 'Mia',       'Poulton',    'mia.poulton.demo@example.com',       '0413 011 011',
   '39 Burke Road',          'Camberwell',     'VIC', '3124', 'Word of Mouth',
   6, 8900.00, '2026-07-08', 'Interested in coloured stones.')
RETURNING id INTO c11;

INSERT INTO customers (tenant_id, first_name, last_name, email, phone,
  address, suburb, state, postcode, referral_source,
  total_orders, total_spend, last_visit_date, notes)
VALUES
  (tid, 'Liam',      'Stefanidis', 'liam.stefanidis.demo@example.com',   '0424 012 012',
   '101 Toorak Road',        'South Yarra',    'VIC', '3141', 'Referral',
   11, 17600.00, '2026-07-19', 'Greek Orthodox wedding Nov 2026.')
RETURNING id INTO c12;

INSERT INTO customers (tenant_id, first_name, last_name, email, phone,
  address, suburb, state, postcode, referral_source,
  total_orders, total_spend, last_visit_date, notes)
VALUES
  (tid, 'Ava',       'Morrison',   'ava.morrison.demo@example.com',      '0435 013 013',
   '14 Koonung Street',      'Mont Albert',    'VIC', '3127', 'Google',
   1, 1200.00, '2026-07-26', 'New customer, walked in for collection order.')
RETURNING id INTO c13;

INSERT INTO customers (tenant_id, first_name, last_name, email, phone,
  address, suburb, state, postcode, referral_source,
  total_orders, total_spend, last_visit_date, notes)
VALUES
  (tid, 'Ethan',     'Kowalski',   'ethan.kowalski.demo@example.com',    '0446 014 014',
   '77 Riversdale Road',     'Camberwell',     'VIC', '3124', 'Walk-in',
   4, 5500.00, '2026-06-20', 'Simple repairs and chain work only.')
RETURNING id INTO c14;

INSERT INTO customers (tenant_id, first_name, last_name, email, phone,
  address, suburb, state, postcode, referral_source,
  total_orders, total_spend, last_visit_date, notes)
VALUES
  (tid, 'Grace',     'Tanaka',     'grace.tanaka.demo@example.com',      '0457 015 015',
   '8 Whitehorse Road',      'Balwyn',         'VIC', '3103', 'Referral',
   9, 12400.00, '2026-07-12', 'Engagement ring custom. Loves sapphires.')
RETURNING id INTO c15;


-- ── 2. QUOTES ────────────────────────────────────────────────────────────────

INSERT INTO quotes (tenant_id, reference_number, quote_type, status,
  customer_first_name, customer_last_name, customer_email, customer_phone,
  item_description, line_items, total, metal_type, stone_details,
  estimated_turnaround, staff_member, notes)
VALUES

-- Q1: Engagement ring quote — pending
(tid, 'DEMO-Q001', 'custom_order', 'pending',
 'Grace', 'Tanaka', 'grace.tanaka.demo@example.com', '0457 015 015',
 '18ct white gold engagement ring, oval sapphire with diamond halo',
 '[{"description":"18ct white gold band, knife-edge profile","amount":2200},{"description":"2ct oval royal blue sapphire (heated, Ceylon)","amount":4800},{"description":"0.45ct total weight diamond halo pavé set","amount":3200},{"description":"Setting labour","amount":800}]'::jsonb,
 11000.00, '18ct White Gold', '2ct oval sapphire + 0.45ct diamond halo',
 '5–6 weeks', 'Josh', 'Customer wants to compare with platinum option too.'),

-- Q2: Repair quote — converted
(tid, 'DEMO-Q002', 'repair', 'converted',
 'Sophie', 'Mitchell', 'sophie.mitchell.demo@example.com', '0412 111 001',
 'Rhodium plate and re-tip 4 prongs on round brilliant solitaire',
 '[{"description":"Re-tip 4 claws, 18ct white gold","amount":320},{"description":"Rhodium plating","amount":180},{"description":"Clean and polish","amount":80}]'::jsonb,
 580.00, '18ct White Gold', '0.8ct round brilliant solitaire',
 '1–2 weeks', 'Josh', NULL),

-- Q3: Custom pendant — pending
(tid, 'DEMO-Q003', 'custom_order', 'pending',
 'James', 'Hartley', 'james.hartley.demo@example.com', '0423 222 002',
 '18ct yellow gold diamond halo pendant, 0.5ct round brilliant centre',
 '[{"description":"18ct yellow gold pendant mount","amount":1400},{"description":"0.5ct round brilliant diamond (F/VS2, GIA)","amount":3600},{"description":"0.3ct total diamond halo","amount":2100},{"description":"18ct yellow gold cable chain 45cm","amount":900}]'::jsonb,
 8000.00, '18ct Yellow Gold', '0.5ct round brilliant + 0.3ct halo',
 '4–5 weeks', 'Josh', 'Anniversary gift for wife. Delivery before Aug 14.'),

-- Q4: Pearl restring — pending
(tid, 'DEMO-Q004', 'repair', 'pending',
 'Amelia', 'Nguyen', 'amelia.nguyen.demo@example.com', '0456 555 005',
 'Restring Mikimoto multi-strand pearl necklace, new silver clasp',
 '[{"description":"Multi-strand pearl restring (silk, knotted)","amount":380},{"description":"New silver lobster clasp","amount":95},{"description":"Clean and inspect all pearls","amount":45}]'::jsonb,
 520.00, 'Sterling Silver', 'Mikimoto cultured pearls',
 '1 week', 'Josh', NULL),

-- Q5: Custom eternity band — converted
(tid, 'DEMO-Q005', 'custom_order', 'converted',
 'Liam', 'Stefanidis', 'liam.stefanidis.demo@example.com', '0424 012 012',
 '18ct rose gold pavé diamond full eternity band, 0.75ct total',
 '[{"description":"18ct rose gold band, comfort-fit 2.4mm","amount":1800},{"description":"0.75ct total round brilliants, micro-pavé set (F/G, VS)","amount":4900},{"description":"Setting labour","amount":700},{"description":"Rhodium flash white gold signature","amount":0}]'::jsonb,
 7400.00, '18ct Rose Gold', '0.75ct total pavé round brilliants',
 '4–5 weeks', 'Josh', 'Wedding band to match engagement ring already ordered.'),

-- Q6: Men''s signet ring — pending
(tid, 'DEMO-Q006', 'custom_order', 'pending',
 'William', 'Forsythe', 'william.forsythe.demo@example.com', '0467 666 006',
 '18ct yellow gold men''s flat-top signet ring, engraved initials WF',
 '[{"description":"18ct yellow gold signet ring, 12g, flat top","amount":3200},{"description":"Hand engraving — WF monogram, serif font","amount":280}]'::jsonb,
 3480.00, '18ct Yellow Gold', NULL,
 '3–4 weeks', 'Josh', '50th birthday gift from wife. Initials WRF not WF — confirm with customer.'),

-- Q7: Tennis bracelet repair — converted
(tid, 'DEMO-Q007', 'repair', 'converted',
 'Oliver', 'Blackwood', 'oliver.blackwood.demo@example.com', '0445 444 004',
 'Rhodium plate 18ct white gold tennis bracelet, 15 x 0.15ct diamonds',
 '[{"description":"Full rhodium plating","amount":320},{"description":"Inspect and tighten all 15 settings","amount":180},{"description":"Clean and polish","amount":80}]'::jsonb,
 580.00, '18ct White Gold', '15 x 0.15ct round brilliant',
 '1 week', 'Josh', NULL),

-- Q8: Cocktail ring — pending
(tid, 'DEMO-Q008', 'custom_order', 'pending',
 'Mia', 'Poulton', 'mia.poulton.demo@example.com', '0413 011 011',
 '18ct rose gold dress ring, 2.1ct oval morganite, diamond shoulders',
 '[{"description":"18ct rose gold ring mount","amount":1600},{"description":"2.1ct oval morganite (peach-pink, eye clean)","amount":1900},{"description":"0.28ct total diamond shoulders (round brilliants)","amount":1800},{"description":"Setting labour","amount":600}]'::jsonb,
 5900.00, '18ct Rose Gold', '2.1ct oval morganite + 0.28ct diamond shoulders',
 '4–5 weeks', 'Josh', NULL),

-- Q9: Vintage-style engagement ring — converted
(tid, 'DEMO-Q009', 'custom_order', 'converted',
 'Isabella', 'Grant', 'isabella.grant.demo@example.com', '0491 999 009',
 '18ct yellow gold vintage-style ring, 0.9ct round brilliant lab grown, milgrain',
 '[{"description":"18ct yellow gold band, vintage milgrain border","amount":1900},{"description":"0.9ct round brilliant lab grown diamond (E/VS1)","amount":2800},{"description":"Setting labour, fishtail claws","amount":600}]'::jsonb,
 5300.00, '18ct Yellow Gold', '0.9ct round brilliant lab grown (E/VS1)',
 '4 weeks', 'Josh', 'Lab grown specifically requested. Under $6k budget.'),

-- Q10: 3-stone ring — pending
(tid, 'DEMO-Q010', 'custom_order', 'pending',
 'Charlotte', 'Brennan', 'charlotte.brennan.demo@example.com', '0478 777 007',
 '18ct white gold 3-stone ring, 2ct oval centre, trapeze side stones',
 '[{"description":"18ct white gold cathedral setting band","amount":2400},{"description":"2ct oval lab grown diamond (F/VS2) centre","amount":5800},{"description":"Matched trapeze side stones, 0.5ct each","amount":2800},{"description":"Setting and finishing","amount":900}]'::jsonb,
 11900.00, '18ct White Gold', '2ct oval + 2x 0.5ct trapeze',
 '5–6 weeks', 'Josh', 'Centre stone on order from supplier. ETA 2 weeks.');


-- ── 3. PACKETS (WORKSHOP BOARD) ──────────────────────────────────────────────
-- status values: intake | on_bench | quality_check | to_be_valued | ready | collected
-- job_type: repair | custom_order | stock_work | online_order | collection_order
-- workshop_intake_substatus: NULL (Intake col) | 'pre_check' | 'on_order'

-- ─── INTAKE (4 cards) ────────────────────────────────────────────────────────

INSERT INTO packets (tenant_id, reference_number, packet_type, job_type,
  customer_id, customer_first_name, customer_last_name,
  customer_email, customer_phone,
  status, workshop_intake_substatus,
  instructions, articles,
  in_date, due_date, total_charges, deposit,
  staff_initials, status_updated_at)
VALUES
(tid, 'DEMO-001', 'repair', 'repair',
 c3, 'Emily', 'Chen', 'emily.chen.demo@example.com', '0434 333 003',
 'intake', NULL,
 'Re-tip 4 claws on round brilliant solitaire. Check shank thickness while in — may need rhodium after.',
 '1x 18ct white gold solitaire ring with 1.1ct round brilliant',
 '2026-07-28', '2026-08-11', 480.00, 100.00,
 'JM', now() - interval '1 day'),

(tid, 'DEMO-002', 'custom_order', 'custom_order',
 c2, 'James', 'Hartley', 'james.hartley.demo@example.com', '0423 222 002',
 'intake', NULL,
 '18ct yellow gold and diamond halo pendant. Customer approved quote DEMO-Q003. CAD sign-off required before casting.',
 NULL,
 '2026-07-28', '2026-09-01', 8000.00, 2000.00,
 'JM', now() - interval '1 day'),

(tid, 'DEMO-003', 'repair', 'repair',
 c4, 'Oliver', 'Blackwood', 'oliver.blackwood.demo@example.com', '0445 444 004',
 'intake', NULL,
 'Full rhodium plate and tighten all settings on tennis bracelet. Do not resize.',
 '1x 18ct white gold tennis bracelet, 15 diamonds approx 0.15ct each',
 '2026-07-25', '2026-08-08', 580.00, 0.00,
 'JM', now() - interval '4 days'),

(tid, 'DEMO-004', 'client_intake', 'collection_order',
 c8, 'Noah', 'Walsh', 'noah.walsh.demo@example.com', '0489 888 008',
 'intake', NULL,
 'Georg Jensen Fusion ring size L in sterling silver. Customer collecting from store.',
 NULL,
 '2026-07-29', '2026-08-12', 1500.00, 750.00,
 'JM', now());


-- ─── PRE-CHECK (2 cards) ─────────────────────────────────────────────────────

INSERT INTO packets (tenant_id, reference_number, packet_type, job_type,
  customer_id, customer_first_name, customer_last_name,
  customer_email, customer_phone,
  status, workshop_intake_substatus,
  instructions, articles,
  in_date, due_date, total_charges, deposit,
  staff_initials, status_updated_at)
VALUES
(tid, 'DEMO-005', 'repair', 'repair',
 c5, 'Amelia', 'Nguyen', 'amelia.nguyen.demo@example.com', '0456 555 005',
 'intake', 'pre_check',
 'Restring Mikimoto multi-strand pearl necklace on silk with knots. Fit new sterling silver lobster clasp. Inspect each pearl for damage before restringing.',
 '1x Mikimoto pearl necklace, 3 strands, silver clasp (broken)',
 '2026-07-24', '2026-08-04', 520.00, 0.00,
 'JM', now() - interval '3 days'),

(tid, 'DEMO-006', 'custom_order', 'custom_order',
 c12, 'Liam', 'Stefanidis', 'liam.stefanidis.demo@example.com', '0424 012 012',
 'intake', 'pre_check',
 '18ct rose gold pavé diamond full eternity band 0.75ct total. Customer approved design. Confirm ring size before casting — currently M½, check with customer if P fits better.',
 NULL,
 '2026-07-22', '2026-08-26', 7400.00, 1850.00,
 'JM', now() - interval '2 days');


-- ─── ON ORDER (1 card) ───────────────────────────────────────────────────────

INSERT INTO packets (tenant_id, reference_number, packet_type, job_type,
  customer_id, customer_first_name, customer_last_name,
  customer_email, customer_phone,
  status, workshop_intake_substatus,
  instructions, articles,
  in_date, due_date, total_charges, deposit,
  staff_initials, workshop_supplier, workshop_po_number,
  status_updated_at)
VALUES
(tid, 'DEMO-007', 'custom_order', 'custom_order',
 c7, 'Charlotte', 'Brennan', 'charlotte.brennan.demo@example.com', '0478 777 007',
 'intake', 'on_order',
 '18ct white gold 3-stone ring. Centre stone (2ct oval lab grown) on order. Side trapeze stones in stock. Begin setting once centre stone arrives.',
 NULL,
 '2026-07-18', '2026-09-05', 11900.00, 3000.00,
 'JM', 'Melee Diamonds Pty Ltd', 'PO-2026-0147',
 now() - interval '5 days');


-- ─── QUALITY CONTROL (2 cards) ───────────────────────────────────────────────

INSERT INTO packets (tenant_id, reference_number, packet_type, job_type,
  customer_id, customer_first_name, customer_last_name,
  customer_email, customer_phone,
  status, workshop_intake_substatus,
  instructions, articles,
  in_date, due_date, total_charges, deposit,
  staff_initials, assigned_to, workshop_subcontractor_name,
  status_updated_at)
VALUES
(tid, 'DEMO-008', 'repair', 'repair',
 c4, 'Oliver', 'Blackwood', 'oliver.blackwood.demo@example.com', '0445 444 004',
 'quality_check', NULL,
 'Rhodium plate complete. Check all 15 settings secure — 2 were loose on intake. Polish to mirror finish. No sizing.',
 '1x 18ct white gold tennis bracelet',
 '2026-07-14', '2026-08-08', 580.00, 0.00,
 'JM', NULL, NULL,
 now() - interval '2 days'),

(tid, 'DEMO-009', 'custom_order', 'custom_order',
 c9, 'Isabella', 'Grant', 'isabella.grant.demo@example.com', '0491 999 009',
 'quality_check', NULL,
 'Vintage-style 18ct yellow gold ring, 0.9ct round brilliant lab grown. Check milgrain border integrity and fishtail claw alignment. Polish before photography.',
 NULL,
 '2026-07-01', '2026-07-31', 5300.00, 1325.00,
 'JM', NULL, NULL,
 now() - interval '1 day');


-- ─── UNASSIGNED QUEUES (4 cards) ─────────────────────────────────────────────
-- on_bench + assigned_to IS NULL + workshop_subcontractor_name IS NULL
-- job_type routes them to the correct location column

-- Manufacturing Orders (custom_order)
INSERT INTO packets (tenant_id, reference_number, packet_type, job_type,
  customer_id, customer_first_name, customer_last_name,
  customer_email, customer_phone,
  status, instructions, articles,
  in_date, due_date, total_charges, deposit,
  staff_initials, status_updated_at)
VALUES
(tid, 'DEMO-010', 'custom_order', 'custom_order',
 c6, 'William', 'Forsythe', 'william.forsythe.demo@example.com', '0467 666 006',
 'on_bench',
 '18ct yellow gold men''s signet ring, flat top 14x10mm, hand-engraved initials WRF serif. 12g minimum. Comfort-fit inside profile.',
 NULL,
 '2026-07-15', '2026-08-19', 3480.00, 870.00,
 'JM', now() - interval '3 days');

-- Repairs
INSERT INTO packets (tenant_id, reference_number, packet_type, job_type,
  customer_id, customer_first_name, customer_last_name,
  customer_email, customer_phone,
  status, instructions, articles,
  in_date, due_date, total_charges, deposit,
  staff_initials, status_updated_at)
VALUES
(tid, 'DEMO-011', 'repair', 'repair',
 c10, 'Jack', 'Carmichael', 'jack.carmichael.demo@example.com', '0402 010 010',
 'on_bench',
 'Replace broken box clasp on 9ct rose gold chain bracelet. After repair, engrave inside clasp: "With Love 2019". No polishing — customer wants patina.',
 '1x 9ct rose gold curb bracelet, broken box clasp',
 '2026-07-26', '2026-08-05', 210.00, 0.00,
 'JM', now() - interval '2 days');

-- Stock Work / Online Orders
INSERT INTO packets (tenant_id, reference_number, packet_type, job_type,
  customer_id, customer_first_name, customer_last_name,
  customer_email, customer_phone,
  status, instructions, articles,
  in_date, due_date, total_charges, deposit,
  staff_initials, status_updated_at)
VALUES
(tid, 'DEMO-012', 'client_intake', 'online_order',
 c11, 'Mia', 'Poulton', 'mia.poulton.demo@example.com', '0413 011 011',
 'on_bench',
 'Online order: sterling silver 3mm curb chain 60cm — repair broken link at clasp end. Return in original box.',
 '1x sterling silver curb chain 60cm, broken link',
 '2026-07-29', '2026-08-05', 95.00, 0.00,
 'JM', now());

-- Collection Orders
INSERT INTO packets (tenant_id, reference_number, packet_type, job_type,
  customer_id, customer_first_name, customer_last_name,
  customer_email, customer_phone,
  status, instructions, articles,
  in_date, due_date, total_charges, deposit,
  staff_initials, status_updated_at)
VALUES
(tid, 'DEMO-013', 'client_intake', 'collection_order',
 c13, 'Ava', 'Morrison', 'ava.morrison.demo@example.com', '0435 013 013',
 'on_bench',
 'Pandora charm bracelet: add 3 new charms (Daisy #798783C01, Heart #793075C01, Feather #797123CZ), clean bracelet with steam before return.',
 '1x Pandora Moments bracelet + 3 new charms in boxes',
 '2026-07-29', '2026-08-07', 1200.00, 1200.00,
 'JM', now());


-- ─── TEAM COLUMNS (5 cards, assigned via workshop_subcontractor_name) ─────────
-- Ben (repair + OVERDUE), Viv (custom), Joe (repair + custom + STALE)

-- Ben — OVERDUE repair
INSERT INTO packets (tenant_id, reference_number, packet_type, job_type,
  customer_id, customer_first_name, customer_last_name,
  customer_email, customer_phone,
  status, workshop_subcontractor_name,
  instructions, articles,
  in_date, due_date, total_charges, deposit,
  staff_initials, status_updated_at)
VALUES
(tid, 'DEMO-014', 'repair', 'repair',
 c1, 'Sophie', 'Mitchell', 'sophie.mitchell.demo@example.com', '0412 111 001',
 'on_bench', 'Ben',
 'Re-tip 6 claws on princess cut diamond ring. Rhodium plate after. Size currently M — customer OK with M½ if easier.',
 '1x 18ct white gold ring, 0.8ct princess diamond, 6 worn claws',
 '2026-07-10', '2026-07-21', 640.00, 200.00,
 'JM', now() - interval '2 days');
-- ^ due_date 2026-07-21 < today 2026-07-29 → OVERDUE

-- Viv — custom order
INSERT INTO packets (tenant_id, reference_number, packet_type, job_type,
  customer_id, customer_first_name, customer_last_name,
  customer_email, customer_phone,
  status, workshop_subcontractor_name,
  instructions, articles,
  in_date, due_date, total_charges, deposit,
  staff_initials, status_updated_at)
VALUES
(tid, 'DEMO-015', 'custom_order', 'custom_order',
 c15, 'Grace', 'Tanaka', 'grace.tanaka.demo@example.com', '0457 015 015',
 'on_bench', 'Viv',
 'Custom 18ct white gold engagement ring: 2ct oval royal blue sapphire with 0.45ct diamond halo. CAD approved. Cast and assemble — sapphire setting by Ryan externally.',
 NULL,
 '2026-07-21', '2026-09-08', 11000.00, 2750.00,
 'JM', now() - interval '1 day');

-- Joe — repair
INSERT INTO packets (tenant_id, reference_number, packet_type, job_type,
  customer_id, customer_first_name, customer_last_name,
  customer_email, customer_phone,
  status, workshop_subcontractor_name,
  instructions, articles,
  in_date, due_date, total_charges, deposit,
  staff_initials, status_updated_at)
VALUES
(tid, 'DEMO-016', 'repair', 'repair',
 c14, 'Ethan', 'Kowalski', 'ethan.kowalski.demo@example.com', '0446 014 014',
 'on_bench', 'Joe',
 'Shorten 18ct yellow gold Figaro chain by 5.5cm. Add lobster clasp safety extender 5cm. Polish whole piece after.',
 '1x 18ct yellow gold Figaro chain 55cm, lobster clasp (working)',
 '2026-07-23', '2026-08-04', 180.00, 0.00,
 'JM', now() - interval '2 days');

-- Joe — custom (STALE: status_updated_at 6 days ago)
INSERT INTO packets (tenant_id, reference_number, packet_type, job_type,
  customer_id, customer_first_name, customer_last_name,
  customer_email, customer_phone,
  status, workshop_subcontractor_name,
  instructions, articles,
  in_date, due_date, total_charges, deposit,
  staff_initials, status_updated_at)
VALUES
(tid, 'DEMO-017', 'custom_order', 'custom_order',
 c11, 'Mia', 'Poulton', 'mia.poulton.demo@example.com', '0413 011 011',
 'on_bench', 'Joe',
 '18ct rose gold cocktail ring, 2.1ct oval morganite, 0.28ct diamond shoulders. Stone setting complete — awaiting final polish and rhodium clean-up.',
 NULL,
 '2026-07-12', '2026-08-18', 5900.00, 1475.00,
 'JM', now() - interval '6 days');
-- ^ status_updated_at 6 days ago, not overdue → STALE (⏸ at-risk banner)


-- ─── SUB-CONTRACTOR COLUMNS (2 cards) ────────────────────────────────────────

-- Ryan (custom)
INSERT INTO packets (tenant_id, reference_number, packet_type, job_type,
  customer_id, customer_first_name, customer_last_name,
  customer_email, customer_phone,
  status, workshop_subcontractor_name,
  instructions, articles,
  in_date, due_date, total_charges, deposit,
  staff_initials, status_updated_at)
VALUES
(tid, 'DEMO-018', 'custom_order', 'custom_order',
 c7, 'Charlotte', 'Brennan', 'charlotte.brennan.demo@example.com', '0478 777 007',
 'on_bench', 'Ryan',
 'Ring mount cast and assembled in-house. Sent to Ryan for sapphire setting. Due back by 6 Aug. PO raised.',
 NULL,
 '2026-07-16', '2026-08-20', 11000.00, 2750.00,
 'JM', now() - interval '3 days');

-- Nam (repair)
INSERT INTO packets (tenant_id, reference_number, packet_type, job_type,
  customer_id, customer_first_name, customer_last_name,
  customer_email, customer_phone,
  status, workshop_subcontractor_name,
  instructions, articles,
  in_date, due_date, total_charges, deposit,
  staff_initials, status_updated_at)
VALUES
(tid, 'DEMO-019', 'repair', 'repair',
 c2, 'James', 'Hartley', 'james.hartley.demo@example.com', '0423 222 002',
 'on_bench', 'Nam',
 'Laser-weld crack in shank of 9ct yellow gold signet ring. Crack at 6 o'clock, 4mm. No resize. Return polished.',
 '1x 9ct yellow gold signet ring, cracked shank',
 '2026-07-25', '2026-08-06', 240.00, 0.00,
 'JM', now() - interval '1 day');


-- ─── TO-BE-VALUED (2 cards) ───────────────────────────────────────────────────

INSERT INTO packets (tenant_id, reference_number, packet_type, job_type,
  customer_id, customer_first_name, customer_last_name,
  customer_email, customer_phone,
  status, workshop_needs_valuation,
  instructions, articles,
  in_date, due_date, total_charges, deposit,
  staff_initials, workshop_valuer,
  status_updated_at)
VALUES
-- Over $3,000 — needs valuation flag
(tid, 'DEMO-020', 'repair', 'repair',
 c3, 'Emily', 'Chen', 'emily.chen.demo@example.com', '0434 333 003',
 'to_be_valued', true,
 'Full inspection and service of antique pearl drop earrings: re-tip 9ct gold mounts, restring drops, re-plate. Insured value $4,200 — valuation required before return.',
 '1x pair antique pearl drop earrings, 9ct gold fittings (x4 drop mounts)',
 '2026-07-20', '2026-08-10', 420.00, 0.00,
 'JM', 'Sam',
 now() - interval '2 days'),

-- Under $3,000 — no valuation flag
(tid, 'DEMO-021', 'custom_order', 'custom_order',
 c12, 'Liam', 'Stefanidis', 'liam.stefanidis.demo@example.com', '0424 012 012',
 'to_be_valued', false,
 'Custom 18ct white gold and ruby cocktail ring complete. 1.8ct oval Burmese ruby, 0.3ct diamond surround. Requires insurance valuation before client pickup.',
 NULL,
 '2026-06-25', '2026-08-01', 8200.00, 2050.00,
 'JM', 'Brad',
 now() - interval '1 day');


-- ─── READY FOR COLLECTION (2 cards) ──────────────────────────────────────────

INSERT INTO packets (tenant_id, reference_number, packet_type, job_type,
  customer_id, customer_first_name, customer_last_name,
  customer_email, customer_phone,
  status, instructions, articles,
  in_date, due_date, total_charges, deposit,
  staff_initials, status_updated_at)
VALUES
(tid, 'DEMO-022', 'repair', 'repair',
 c1, 'Sophie', 'Mitchell', 'sophie.mitchell.demo@example.com', '0412 111 001',
 'ready',
 'Cartier Love bracelet overhaul complete: deep polished, clasp mechanism replaced, screws re-checked. Bagged and tagged. SMS sent 27 Jul.',
 '1x Cartier Love bracelet 18ct yellow gold',
 '2026-06-30', '2026-07-25', 980.00, 250.00,
 'JM', now() - interval '2 days'),

(tid, 'DEMO-023', 'custom_order', 'custom_order',
 c9, 'Isabella', 'Grant', 'isabella.grant.demo@example.com', '0491 999 009',
 'ready',
 'Vintage-style engagement ring complete and QC passed. Photography done. Box, cert, and receipt in envelope. Customer booked for collection Tue 29 Jul.',
 NULL,
 '2026-07-01', '2026-07-29', 5300.00, 1325.00,
 'JM', now() - interval '1 day');


-- ─── COLLECTED (2 cards) ─────────────────────────────────────────────────────

INSERT INTO packets (tenant_id, reference_number, packet_type, job_type,
  customer_id, customer_first_name, customer_last_name,
  customer_email, customer_phone,
  status, instructions, articles,
  in_date, due_date, total_charges, deposit,
  collected_date, signed_by,
  staff_initials, status_updated_at)
VALUES
(tid, 'DEMO-024', 'repair', 'repair',
 c5, 'Amelia', 'Nguyen', 'amelia.nguyen.demo@example.com', '0456 555 005',
 'collected',
 'Inscription inside 9ct white gold wedding band: "J & E 14.02.25", Arial font size 8. Clean after engraving.',
 '1x 9ct white gold band, size N',
 '2026-07-07', '2026-07-21', 185.00, 0.00,
 '2026-07-23', 'Amelia Nguyen',
 'JM', '2026-07-23 14:30:00+10'),

(tid, 'DEMO-025', 'client_intake', 'collection_order',
 c8, 'Noah', 'Walsh', 'noah.walsh.demo@example.com', '0489 888 008',
 'collected',
 'Tiffany Return to Tiffany sterling silver bracelet: ultrasonic clean, hand polish, re-tag. Return in Tiffany pouch if available.',
 '1x Tiffany Return to Tiffany bracelet, sterling silver',
 '2026-07-15', '2026-07-22', 95.00, 0.00,
 '2026-07-24', 'Noah Walsh',
 'JM', '2026-07-24 11:15:00+10');


-- ── 4. MANAGER NOTICEBOARD + LEAD TIMES ──────────────────────────────────────

INSERT INTO workshop_manager_messages (tenant_id, text, created_at) VALUES
  (tid, 'New CAD software (Rhino 8) training this Friday 10am–1pm in the design studio. Attendance mandatory for anyone doing custom work. BYO laptop if you have one.', now() - interval '1 day'),
  (tid, 'Reminder: subcontractor invoices from Ryan and Nam are due by end of month. Submit to Josh before 5pm Friday so they can be processed before the July cut-off.', now() - interval '3 days');

-- Upsert lead times (all 5 job types)
INSERT INTO workshop_lead_times (tenant_id, job_type, weeks)
VALUES
  (tid, 'repair',           1.5),
  (tid, 'custom_order',     5.0),
  (tid, 'collection_order', 2.0),
  (tid, 'stock_work',       1.0),
  (tid, 'online_order',     1.0)
ON CONFLICT (tenant_id, job_type) DO UPDATE SET weeks = EXCLUDED.weeks;

END $$;

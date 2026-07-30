-- ============================================================
-- Repair Quoting Seed — tenant 00000000-0000-0000-0000-000000000001
-- Review this file BEFORE running against production Supabase.
-- Flags to verify:
--   claw_rates.is_confirmed=false  → all except 18ct variants
--   parts_catalogue.is_estimated=true → all jump_ring category rows
-- ============================================================

DO $$
DECLARE
  tid UUID := '00000000-0000-0000-0000-000000000001';
BEGIN

-- ── quoting_settings ──────────────────────────────────────────────
INSERT INTO quoting_settings (tenant_id, ownership_label_yes, ownership_label_no, ownership_label_unknown, labour_rate_per_minute, labour_increment_minutes)
VALUES (tid, 'Purchased From Us', 'Not Purchased From Us', 'Unknown', 1.00, 5)
ON CONFLICT (tenant_id) DO UPDATE
  SET ownership_label_yes       = EXCLUDED.ownership_label_yes,
      ownership_label_no        = EXCLUDED.ownership_label_no,
      ownership_label_unknown   = EXCLUDED.ownership_label_unknown,
      labour_rate_per_minute    = EXCLUDED.labour_rate_per_minute,
      labour_increment_minutes  = EXCLUDED.labour_increment_minutes;

-- ── fitting_fee_config ────────────────────────────────────────────
INSERT INTO fitting_fee_config (tenant_id, fee_per_end)
VALUES (tid, 35)
ON CONFLICT (tenant_id) DO UPDATE SET fee_per_end = EXCLUDED.fee_per_end;

-- ── discount_tiers ────────────────────────────────────────────────
-- DELETE existing so re-run is idempotent
DELETE FROM discount_tiers WHERE tenant_id = tid;
INSERT INTO discount_tiers (tenant_id, name, discount_percent, eligible_ownership_only, sort_order) VALUES
  (tid, 'VIP',   10, false, 1),
  (tid, 'Trade', 15, true,  2),  -- trade discount applies to our-stock items only
  (tid, 'Staff', 20, false, 3);

-- ── pricing_brackets ──────────────────────────────────────────────
DELETE FROM pricing_brackets WHERE tenant_id = tid;

-- Parts / metal cost → retail price multipliers
INSERT INTO pricing_brackets (tenant_id, bracket_type, cost_lower_bound, multiplier, sort_order) VALUES
  (tid, 'parts_metal',   0,   2.8,  1),
  (tid, 'parts_metal',  50,   2.5,  2),
  (tid, 'parts_metal', 100,   2.2,  3),
  (tid, 'parts_metal', 250,   2.0,  4),
  (tid, 'parts_metal', 500,  NULL,  5);  -- POA above $500 cost

-- Labour cost → retail price multipliers
INSERT INTO pricing_brackets (tenant_id, bracket_type, cost_lower_bound, multiplier, sort_order) VALUES
  (tid, 'labour',   0,   2.5,  1),
  (tid, 'labour',  30,   2.2,  2),
  (tid, 'labour',  75,   2.0,  3),
  (tid, 'labour', 150,  NULL,  4);  -- POA above $150 cost

-- ── metal_rates ───────────────────────────────────────────────────
DELETE FROM metal_rates WHERE tenant_id = tid;
INSERT INTO metal_rates (tenant_id, metal_name, rate_per_gram, excluded_from_resize_rebuild, sort_order) VALUES
  (tid, '9ct Yellow Gold',   50.00,  false, 1),
  (tid, '9ct White Gold',    52.00,  false, 2),
  (tid, '9ct Rose Gold',     51.00,  false, 3),
  (tid, '18ct Yellow Gold', 100.00,  false, 4),
  (tid, '18ct White Gold',  105.00,  false, 5),
  (tid, '18ct Rose Gold',   102.00,  false, 6),
  (tid, 'Platinum 950',      90.00,  false, 7),
  (tid, 'Sterling Silver',    1.10,  false, 8);

-- ── claw_rates ────────────────────────────────────────────────────
-- is_confirmed = TRUE  → 18ct yellow, white, rose only
-- is_confirmed = FALSE → all other metals (estimated, needs confirmation)
DELETE FROM claw_rates WHERE tenant_id = tid;
INSERT INTO claw_rates (tenant_id, metal_name, price_per_claw, is_confirmed) VALUES
  (tid, '9ct Yellow Gold',   15.00, false),  -- UNCONFIRMED
  (tid, '9ct White Gold',    18.00, false),  -- UNCONFIRMED
  (tid, '9ct Rose Gold',     16.00, false),  -- UNCONFIRMED
  (tid, '18ct Yellow Gold',  28.00, true),   -- CONFIRMED
  (tid, '18ct White Gold',   32.00, true),   -- CONFIRMED
  (tid, '18ct Rose Gold',    30.00, true),   -- CONFIRMED
  (tid, 'Platinum 950',      45.00, false),  -- UNCONFIRMED
  (tid, 'Sterling Silver',    8.00, false);  -- UNCONFIRMED

-- ── setting_tiers ─────────────────────────────────────────────────
DELETE FROM setting_tiers WHERE tenant_id = tid;
INSERT INTO setting_tiers (tenant_id, tier_key, label, fee, sort_order) VALUES
  (tid, 'simple',   'Simple Setting',   45.00,  1),
  (tid, 'standard', 'Standard Setting', 75.00,  2),
  (tid, 'complex',  'Complex Setting',  120.00, 3),
  (tid, 'custom',   'Custom Setting',   180.00, 4);

-- ── restring_prices ───────────────────────────────────────────────
DELETE FROM restring_prices WHERE tenant_id = tid;
INSERT INTO restring_prices (tenant_id, length_label, unknotted_straight, unknotted_graduated, knotted_straight, knotted_graduated, sort_order) VALUES
  (tid, 'Bracelet', 45.00,  55.00,  75.00,  95.00,  1),
  (tid, '40cm',     55.00,  65.00,  85.00, 105.00,  2),
  (tid, '45cm',     60.00,  70.00,  90.00, 115.00,  3),
  (tid, '50cm',     65.00,  75.00,  95.00, 120.00,  4),
  (tid, '60cm',     70.00,  82.00, 105.00, 130.00,  5),
  (tid, '80cm+',    80.00,  95.00, 120.00, 150.00,  6);

-- ── repair_actions ────────────────────────────────────────────────
DELETE FROM repair_actions WHERE tenant_id = tid;
INSERT INTO repair_actions (tenant_id, name, pricing_mode, guide_key, default_price, default_minutes, hint, sort_order) VALUES
  (tid, 'Ring Resize',             'guided',             'resize',       NULL,  NULL, 'Size up or down — calculates metal added/removed plus labour', 1),
  (tid, 'Restring',                'guided',             'restring',     NULL,  NULL, 'Selects from the length × style price matrix',                2),
  (tid, 'Laser Engraving',         'guided',             'laserengrave', NULL,  NULL, 'Per-character rate, calculates from text length',             3),
  (tid, 'Hand Engraving',          'guided',             'handengrave',  NULL,  NULL, 'Time-based; guide calculates minutes from script + area',     4),
  (tid, 'Replace Claws',           'guided',             'newclaws',     NULL,  NULL, 'Per-claw rate by metal; calculates from claw count',          5),
  (tid, 'Rebuild / Remodel',       'guided',             'rebuild',      NULL,  NULL, 'Full rebuild — weight, metal rate, labour combined',          6),
  (tid, 'New Setting',             'guided',             'newsetting',   NULL,  NULL, 'Selects setting tier fee',                                    7),
  (tid, 'Clasp Replacement',       'flat',               NULL,           45.00, NULL, 'Includes fitting; select part from catalogue separately',     8),
  (tid, 'Solder Break Repair',     'minutes',            NULL,           NULL,   30,  'Simple break solder',                                         9),
  (tid, 'Chain Repair (Solder)',   'minutes',            NULL,           NULL,   20,  'Single link solder',                                         10),
  (tid, 'Polish & Rhodium Plate',  'flat',               NULL,           85.00, NULL, 'Full service polish plus rhodium plate',                     11),
  (tid, 'Ring Shank Replacement',  'description_labour', NULL,           NULL,   60,  'New shank supplied from catalogue; fitting plus solder',      12),
  (tid, 'Stone Tightening',        'flat',               NULL,           35.00, NULL, 'Up to 4 stones; per-stone rate above that',                  13),
  (tid, 'Earring Post Replacement','minutes',            NULL,           NULL,   20,  'Solder new post; gold or silver',                            14),
  (tid, 'Hallmark Stamp',          'flat',               NULL,           25.00, NULL, 'Punch hallmark on existing piece',                           15);

-- ── service_actions ───────────────────────────────────────────────
DELETE FROM service_actions WHERE tenant_id = tid;
INSERT INTO service_actions (tenant_id, name, pricing_mode, default_price, default_minutes, hint, sort_order) VALUES
  (tid, 'Clean & Polish',          'flat',    55.00, NULL, 'Hand polish + steam clean',               1),
  (tid, 'Full Service (w/ Rhodium)','flat',   95.00, NULL, 'Polish, steam, ultrasonic + rhodium',      2),
  (tid, 'Ultrasonic Clean',        'flat',    35.00, NULL, 'Machine ultrasonic only',                  3),
  (tid, 'Rhodium Plate Only',      'flat',    65.00, NULL, 'Rhodium on white gold or silver',          4),
  (tid, 'Insurance Valuation',     'flat',   150.00, NULL, 'Written valuation certificate',            5),
  (tid, 'Insurance Val. (Verbal)', 'flat',    75.00, NULL, 'Verbal replacement estimate, no cert',     6),
  (tid, 'Presentation Box',        'flat',    15.00, NULL, 'Branded gift box',                         7),
  (tid, 'Repacking / Repackaging', 'flat',    20.00, NULL, 'Repack into pouch or replacement box',     8);

-- ── parts_catalogue ───────────────────────────────────────────────
-- is_estimated = TRUE  on ALL jump_ring rows
-- is_estimated = FALSE on clasps, ear_fittings, shanks, misc
DELETE FROM parts_catalogue WHERE tenant_id = tid;

-- Clasps
INSERT INTO parts_catalogue (tenant_id, product_code, category, material, name, size, cost, fittable, is_estimated) VALUES
  (tid, 'CL-9Y-S',  'clasp', '9ct Yellow Gold',  'Lobster Clasp',  'Small (9mm)',  18.00, true,  false),
  (tid, 'CL-9Y-L',  'clasp', '9ct Yellow Gold',  'Lobster Clasp',  'Large (12mm)', 25.00, true,  false),
  (tid, 'CL-18Y',   'clasp', '18ct Yellow Gold', 'Lobster Clasp',  '10mm',         38.00, true,  false),
  (tid, 'CL-18W',   'clasp', '18ct White Gold',  'Lobster Clasp',  '10mm',         42.00, true,  false),
  (tid, 'CL-SS',    'clasp', 'Sterling Silver',  'Lobster Clasp',  '10mm',          5.00, true,  false),
  (tid, 'CL-9Y-B',  'clasp', '9ct Yellow Gold',  'Barrel Clasp',   '6mm',          22.00, true,  false),
  (tid, 'CL-SS-B',  'clasp', 'Sterling Silver',  'Barrel Clasp',   '6mm',           4.00, true,  false);

-- Ear fittings
INSERT INTO parts_catalogue (tenant_id, product_code, category, material, name, size, cost, fittable, is_estimated) VALUES
  (tid, 'EF-9Y',    'ear_fitting', '9ct Yellow Gold', 'Butterfly Backs', 'Pair',   8.00, true,  false),
  (tid, 'EF-9W',    'ear_fitting', '9ct White Gold',  'Butterfly Backs', 'Pair',   9.00, true,  false),
  (tid, 'EF-18Y',   'ear_fitting', '18ct Yellow Gold','Butterfly Backs', 'Pair',  15.00, true,  false),
  (tid, 'EF-18W',   'ear_fitting', '18ct White Gold', 'Butterfly Backs', 'Pair',  17.00, true,  false),
  (tid, 'EF-SS',    'ear_fitting', 'Sterling Silver', 'Butterfly Backs', 'Pair',   3.00, true,  false),
  (tid, 'EF-9Y-SB', 'ear_fitting', '9ct Yellow Gold', 'Screw Backs',     'Pair',  12.00, true,  false);

-- Shanks
INSERT INTO parts_catalogue (tenant_id, product_code, category, material, name, size, cost, fittable, is_estimated) VALUES
  (tid, 'SH-9Y-2',  'shank', '9ct Yellow Gold',  'Half Round Shank',   '2mm',  35.00, false, false),
  (tid, 'SH-9Y-3',  'shank', '9ct Yellow Gold',  'Comfort Fit Shank',  '3mm',  55.00, false, false),
  (tid, 'SH-18Y-2', 'shank', '18ct Yellow Gold', 'Half Round Shank',   '2mm',  70.00, false, false),
  (tid, 'SH-18W-2', 'shank', '18ct White Gold',  'Half Round Shank',   '2mm',  75.00, false, false),
  (tid, 'SH-18Y-3', 'shank', '18ct Yellow Gold', 'Comfort Fit Shank',  '3mm', 110.00, false, false),
  (tid, 'SH-PT-2',  'shank', 'Platinum 950',     'Half Round Shank',   '2mm',  95.00, false, false);

-- Jump rings (ALL is_estimated = true)
INSERT INTO parts_catalogue (tenant_id, product_code, category, material, name, size, cost, fittable, is_estimated, data_note) VALUES
  (tid, 'JR-9Y-4',  'jump_ring', '9ct Yellow Gold',  'Round Jump Ring', '4mm',  6.00,  false, true, 'Estimated — confirm with supplier'),
  (tid, 'JR-9Y-6',  'jump_ring', '9ct Yellow Gold',  'Round Jump Ring', '6mm',  8.00,  false, true, 'Estimated — confirm with supplier'),
  (tid, 'JR-9W-4',  'jump_ring', '9ct White Gold',   'Round Jump Ring', '4mm',  7.00,  false, true, 'Estimated — confirm with supplier'),
  (tid, 'JR-9W-6',  'jump_ring', '9ct White Gold',   'Round Jump Ring', '6mm',  9.00,  false, true, 'Estimated — confirm with supplier'),
  (tid, 'JR-18Y-4', 'jump_ring', '18ct Yellow Gold', 'Round Jump Ring', '4mm', 12.00,  false, true, 'Estimated — confirm with supplier'),
  (tid, 'JR-18Y-6', 'jump_ring', '18ct Yellow Gold', 'Round Jump Ring', '6mm', 15.00,  false, true, 'Estimated — confirm with supplier'),
  (tid, 'JR-18W-4', 'jump_ring', '18ct White Gold',  'Round Jump Ring', '4mm', 13.00,  false, true, 'Estimated — confirm with supplier'),
  (tid, 'JR-SS-4',  'jump_ring', 'Sterling Silver',  'Round Jump Ring', '4mm',  2.00,  false, true, 'Estimated — confirm with supplier'),
  (tid, 'JR-SS-6',  'jump_ring', 'Sterling Silver',  'Round Jump Ring', '6mm',  3.00,  false, true, 'Estimated — confirm with supplier');

-- Misc
INSERT INTO parts_catalogue (tenant_id, product_code, category, material, name, size, cost, fittable, is_estimated) VALUES
  (tid, 'MS-THRD',  'misc', 'Silk Thread',    'Knotting Thread', 'Per strand',  3.00, false, false),
  (tid, 'MS-CORD',  'misc', 'Silk Cord',      'Silk Cord',       'Per strand',  4.00, false, false),
  (tid, 'MS-NYLON', 'misc', 'Nylon',          'Nylon Thread',    'Per strand',  2.00, false, false);

END $$;

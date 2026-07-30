-- ============================================================
-- Repair Quoting Seed — tenant 00000000-0000-0000-0000-000000000001
-- Source: Class_A_Workshop_Repair_Quoting.html (verbatim values)
--
-- Review before running against production Supabase:
--   claw_rates.is_confirmed=false  → all except 18ct variants (5 confirmed, 6 unconfirmed)
--   parts_catalogue: OMITTED — re-share Class_A_Workshop_Repair_Quoting (2) (1).html
--                    to parse the real PRODUCTS array (~350 SKUs)
--
-- NOTE: metal_rates table removed — Repair Quoting reads per-gram
-- rates from the existing pricing_gold_prices table instead.
-- KNOWN LIMITATION: pricing_gold_prices has no tenant_id — shared
-- across all Vault tenants. Fine while Class A is the only real
-- tenant; must be fixed before other tenants go live.
--
-- repair_quoting_metal_exclusions: seeded empty — no metals excluded
-- at this 11-metal granularity. Platinum stays available for
-- resize/rebuild. Revisit if the table is expanded further.
--
-- pricing_gold_prices additions: 4 new rows added below (global table,
-- outside the tenant-scoped DO block). Rates are PLACEHOLDERS —
-- confirm with Josh before relying on these for real quotes.
-- ============================================================

-- ── pricing_gold_prices — gap-fill for Repair Quoting metals ─────
-- GLOBAL TABLE (no tenant_id) — affects all Vault tenants.
-- Gold Plated and Rolled Gold intentionally excluded: these are
-- always bought as finished parts at a flat cost — never priced by
-- weight — so a per-gram rate makes no sense for them.
-- Sterling Silver and 14ct Yellow Gold ARE used in resize/rebuild
-- by weight, but real rates are not yet confirmed. Stored as NULL
-- (requires migration 073 to drop the NOT NULL constraint first).
-- price_per_gram = NULL means "rate not set — block calculation /
-- show check-with-manager" in the Repair Quoting calculators.
INSERT INTO pricing_gold_prices (metal_type, price_per_gram, effective_date, notes) VALUES
  ('Sterling Silver',  NULL, CURRENT_DATE, 'Rate not yet set — confirm with Josh before using in a live quote'),
  ('14ct Yellow Gold', NULL, CURRENT_DATE, 'Rate not yet set — confirm with Josh before using in a live quote')
ON CONFLICT DO NOTHING;

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
DELETE FROM discount_tiers WHERE tenant_id = tid;
INSERT INTO discount_tiers (tenant_id, name, discount_percent, eligible_ownership_only, sort_order) VALUES
  (tid, 'VIP',   10, false, 1),
  (tid, 'Trade', 15, true,  2),
  (tid, 'Staff', 20, false, 3);

-- ── pricing_brackets ──────────────────────────────────────────────
DELETE FROM pricing_brackets WHERE tenant_id = tid;

-- Parts / metal cost → retail price multipliers
INSERT INTO pricing_brackets (tenant_id, bracket_type, cost_lower_bound, multiplier, sort_order) VALUES
  (tid, 'parts_metal',     0, 3.20, 1),
  (tid, 'parts_metal',   501, 2.95, 2),
  (tid, 'parts_metal',  1001, 2.85, 3),
  (tid, 'parts_metal',  1501, 2.75, 4),
  (tid, 'parts_metal',  2001, 2.50, 5),
  (tid, 'parts_metal',  5001, 2.40, 6),
  (tid, 'parts_metal',  7501, NULL, 7);  -- POA above $7,501 cost

-- Labour cost → retail price multipliers
INSERT INTO pricing_brackets (tenant_id, bracket_type, cost_lower_bound, multiplier, sort_order) VALUES
  (tid, 'labour',     0, 3.60, 1),
  (tid, 'labour',   501, 3.30, 2),
  (tid, 'labour',  1001, 3.20, 3),
  (tid, 'labour',  1501, 3.10, 4),
  (tid, 'labour',  2001, 2.80, 5),
  (tid, 'labour',  5001, 2.70, 6),
  (tid, 'labour',  7501, 2.60, 7),
  (tid, 'labour', 12501, NULL, 8);  -- POA above $12,501 cost

-- ── metal_rates ───────────────────────────────────────────────────
-- excluded_from_resize_rebuild = true:
--   Brass, Bronze, Sterling Silver (TRS), Sterling Silver (AGPD),
--   Sterling Silver (AGPT), 10ct Yellow, 10ct White, 10ct Rose,
--   Palladium 950, Platinum Puro 950
DELETE FROM metal_rates WHERE tenant_id = tid;
INSERT INTO metal_rates (tenant_id, metal_name, rate_per_gram, excluded_from_resize_rebuild, sort_order) VALUES
  (tid, 'Brass',                          0.49,   true,   1),
  (tid, 'Bronze',                         0.49,   true,   2),
  (tid, 'Sterling Silver (Standard)',      5.45,   false,  3),
  (tid, 'Sterling Silver (TRS)',           5.45,   true,   4),
  (tid, 'Sterling Silver (AGPD)',         10.92,   true,   5),
  (tid, 'Sterling Silver (AGPT)',         11.13,   true,   6),
  (tid, '9ct Yellow',                    100.15,   false,  7),
  (tid, '9ct White (Palladium)',         108.67,   false,  8),
  (tid, '9ct White (Nickel Free Hard)',  101.15,   false,  9),
  (tid, '9ct Rose',                      100.11,   false, 10),
  (tid, '9ct Pink',                      100.11,   false, 11),
  (tid, '10ct Yellow',                   121.68,   true,  12),
  (tid, '10ct White',                    126.52,   true,  13),
  (tid, '10ct Rose',                     119.64,   true,  14),
  (tid, '14ct Yellow',                   164.62,   false, 15),
  (tid, '14ct White',                    170.55,   false, 16),
  (tid, '14ct Rose',                     168.24,   false, 17),
  (tid, '14ct Pink',                     168.24,   false, 18),
  (tid, '18ct Yellow (Standard)',        197.75,   false, 19),
  (tid, '18ct Yellow (Rich)',            201.71,   false, 20),
  (tid, '18ct White Hard (13.2% PGM)',   206.99,   false, 21),
  (tid, '18ct White Premium (15% PD)',   208.76,   false, 22),
  (tid, '18ct Rose',                     204.60,   false, 23),
  (tid, '22ct Yellow',                   249.79,   false, 24),
  (tid, 'Palladium 950',                  78.26,   true,  25),
  (tid, 'Platinum Puro 950',              NULL,    true,  26),  -- rate N/A, excluded from resize/rebuild
  (tid, 'PlatinumG 950',                 122.21,   false, 27);

-- ── claw_rates ────────────────────────────────────────────────────
-- is_confirmed = TRUE  → 18ct variants only (5 rows)
-- is_confirmed = FALSE → all other metals (scaled estimates from source, not real quotes)
DELETE FROM claw_rates WHERE tenant_id = tid;
INSERT INTO claw_rates (tenant_id, metal_name, price_per_claw, is_confirmed) VALUES
  (tid, '9ct Yellow',                   65.00, false),  -- UNCONFIRMED (estimated)
  (tid, '9ct White (Palladium)',         70.00, false),  -- UNCONFIRMED (estimated)
  (tid, '9ct White (Nickel Free Hard)',  66.00, false),  -- UNCONFIRMED (estimated)
  (tid, '9ct Rose',                      65.00, false),  -- UNCONFIRMED (estimated)
  (tid, '18ct Yellow (Standard)',       130.00, true),   -- CONFIRMED
  (tid, '18ct Yellow (Rich)',           130.00, true),   -- CONFIRMED
  (tid, '18ct White Hard (13.2% PGM)', 135.00, true),   -- CONFIRMED
  (tid, '18ct White Premium (15% PD)', 135.00, true),   -- CONFIRMED
  (tid, '18ct Rose',                    135.00, true),   -- CONFIRMED
  (tid, 'PlatinumG 950',                 90.00, false),  -- UNCONFIRMED (estimated)
  (tid, 'Sterling Silver (Standard)',    20.00, false);  -- UNCONFIRMED (estimated)

-- ── setting_tiers ─────────────────────────────────────────────────
DELETE FROM setting_tiers WHERE tenant_id = tid;
INSERT INTO setting_tiers (tenant_id, tier_key, label, fee, sort_order) VALUES
  (tid, 'small',  'Small / Simple',   150.00, 1),
  (tid, 'medium', 'Medium / Complex', 250.00, 2),
  (tid, 'heavy',  'Heavy / Difficult',300.00, 3);

-- ── restring_prices ───────────────────────────────────────────────
DELETE FROM restring_prices WHERE tenant_id = tid;
INSERT INTO restring_prices (tenant_id, length_label, unknotted_straight, unknotted_graduated, knotted_straight, knotted_graduated, sort_order) VALUES
  (tid, 'Bracelet',  70, 90,  90, 110,  1),
  (tid, '40cm',     110, 130, 130, 150,  2),
  (tid, '45cm',     120, 140, 140, 160,  3),
  (tid, '50cm',     130, 150, 150, 170,  4),
  (tid, '55cm',     140, 160, 160, 180,  5),
  (tid, '60cm',     150, 170, 170, 190,  6),
  (tid, '65cm',     160, 180, 180, 200,  7),
  (tid, '70cm',     170, 190, 190, 210,  8),
  (tid, '75cm',     180, 200, 200, 220,  9),
  (tid, '80cm',     190, 210, 210, 230, 10);

-- ── repair_actions ────────────────────────────────────────────────
DELETE FROM repair_actions WHERE tenant_id = tid;
INSERT INTO repair_actions (tenant_id, name, pricing_mode, guide_key, default_price, default_minutes, hint, sort_order) VALUES
  (tid, 'Ring Resizing',          'guided',             'resize',       NULL,  NULL, 'Up or down — choose which',                                    1),
  (tid, 'Cleaning and Polishing', 'flat',               NULL,           30.00, NULL, 'Base rate — extra labour available',                           2),
  (tid, 'Cleaning (Ultrasonic)',  'flat',               NULL,           20.00, NULL, 'Base rate — extra labour available',                           3),
  (tid, 'Solder',                 'minutes',            NULL,           NULL,   30,  '$1/min cost, marked up · 30-min blocks',                       4),
  (tid, 'Restringing',            'guided',             'restring',     NULL,  NULL, 'Priced from your pearl restring chart',                        5),
  (tid, 'Laser Engraving',        'guided',             'laserengrave', NULL,  NULL, 'Minimum charge depends on ownership status',                   6),
  (tid, 'Hand Engraving',         'guided',             'handengrave',  NULL,  NULL, '$250/hr cost — requires manager quote/approval',               7),
  (tid, 'New Claws',              'guided',             'newclaws',     NULL,  NULL, 'Priced per claw by metal',                                     8),
  (tid, 'Rebuilding',             'guided',             'rebuild',      NULL,  NULL, 'Metal weight + labour',                                        9),
  (tid, 'New Setting',            'guided',             'newsetting',   NULL,  NULL, 'Tiered fee + metal + labour',                                 10),
  (tid, 'Filing',                 'minutes',            NULL,           NULL,   30,  '$1/min cost, marked up · 30-min blocks',                      11),
  (tid, 'Stone Polishing',        'flat',               NULL,          120.00, NULL, 'Starting price — extra labour available',                     12),
  (tid, 'Stone Testing',          'flat',               NULL,           65.00, NULL, 'Starting price — extra labour available',                     13),
  (tid, 'Metal Testing',          'flat',               NULL,           65.00, NULL, 'Starting price — extra labour available',                     14),
  (tid, 'Watch Repair',           'manual',             NULL,           NULL,  NULL, 'Enter price directly — no fixed formula',                     15),
  (tid, 'Tightening',             'flat',               NULL,           25.00, NULL, 'Base rate — extra labour available',                          16),
  (tid, 'Miscellaneous',          'description_labour', NULL,           NULL,   30,  '$1/min cost, marked up · 30-min blocks',                      17),
  (tid, 'New Spring in Clasp',    'flat',               NULL,           95.00, NULL, 'Starting price — extra labour available',                     18);

-- ── service_actions ───────────────────────────────────────────────
DELETE FROM service_actions WHERE tenant_id = tid;
INSERT INTO service_actions (tenant_id, name, pricing_mode, default_price, default_minutes, hint, sort_order) VALUES
  (tid, 'Cleaning and Polishing',   'flat',               30.00, NULL, 'Base rate — extra labour available',          1),
  (tid, 'Cleaning (Ultrasonic)',     'flat',               20.00, NULL, 'Base rate — extra labour available',          2),
  (tid, 'Valuation',                'minutes',             NULL,   30,  '$1/min cost, marked up · 30-min blocks',      3),
  (tid, 'Polish and Rhodium Plating','minutes',            NULL,   30,  '$1/min cost, marked up · 30-min blocks',      4),
  (tid, 'Cleaning',                 'minutes',             NULL,   30,  '$1/min cost, marked up · 30-min blocks',      5),
  (tid, 'Miscellaneous',            'description_labour',  NULL,   30,  '$1/min cost, marked up · 30-min blocks',      6);

-- ── repair_quoting_metal_exclusions ──────────────────────────────
-- No exclusions at this 11-metal granularity. Platinum stays
-- available for resize/rebuild per decision 2026-07-30.
DELETE FROM repair_quoting_metal_exclusions WHERE tenant_id = tid;
-- (no INSERTs — empty by design for now)

-- ── parts_catalogue ───────────────────────────────────────────────
-- 337 rows — 13 categories — source: Class_A_Workshop_Repair_Quoting.html
-- is_estimated = true on all 112 Jump Ring rows only
DELETE FROM parts_catalogue WHERE tenant_id = tid;
INSERT INTO parts_catalogue (tenant_id, product_code, category, material, name, size, cost, fittable, is_estimated, data_note) VALUES
  ('00000000-0000-0000-0000-000000000001', 'CHR718YG', 'Parrot Clasp', '18ct Yellow Gold', 'Parrot Clasp', '7mm', 125.92, true, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'CHR818YG', 'Parrot Clasp', '18ct Yellow Gold', 'Parrot Clasp', '8mm', 153.45, true, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'CHR918YG', 'Parrot Clasp', '18ct Yellow Gold', 'Parrot Clasp', '9mm', 180.98, true, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'CHR1118YG', 'Parrot Clasp', '18ct Yellow Gold', 'Parrot Clasp', '11mm', 258.62, true, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'CHR1318YG', 'Parrot Clasp', '18ct Yellow Gold', 'Parrot Clasp', '13mm', 406.42, true, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'CHR1618YG', 'Parrot Clasp', '18ct Yellow Gold', 'Parrot Clasp', '16mm', 518.21, true, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'CHR1718YG', 'Parrot Clasp', '18ct Yellow Gold', 'Parrot Clasp', '17mm', 1019.87, true, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'AS159RG', 'Albert Swivel', '9ct Rose Gold', 'Albert Swivel', '15mm', 121.02, true, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'AS199RG', 'Albert Swivel', '9ct Rose Gold', 'Albert Swivel', '19mm', 236.32, true, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'AS229RG', 'Albert Swivel', '9ct Rose Gold', 'Albert Swivel', '22mm', 293.28, true, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'AS269RG', 'Albert Swivel', '9ct Rose Gold', 'Albert Swivel', '26mm', 313.37, true, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'AS159YG', 'Albert Swivel', '9ct Yellow Gold', 'Albert Swivel', '15mm', 121.02, true, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'AS199YG', 'Albert Swivel', '9ct Yellow Gold', 'Albert Swivel', '19mm', 236.32, true, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'AS229YG', 'Albert Swivel', '9ct Yellow Gold', 'Albert Swivel', '22mm', 293.28, true, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'AS269YG', 'Albert Swivel', '9ct Yellow Gold', 'Albert Swivel', '26mm', 313.37, true, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'AS1518YG', 'Albert Swivel', '18ct Yellow Gold', 'Albert Swivel', '15mm', 439.08, true, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'AS1918YG', 'Albert Swivel', '18ct Yellow Gold', 'Albert Swivel', '19mm', 473.22, true, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'AS2218YG', 'Albert Swivel', '18ct Yellow Gold', 'Albert Swivel', '22mm', 617.06, true, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'AS15SS', 'Albert Swivel', 'Sterling Silver', 'Albert Swivel', '15mm', 10.91, true, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'AS19SS', 'Albert Swivel', 'Sterling Silver', 'Albert Swivel', '19mm', 16.97, true, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'AS22SS', 'Albert Swivel', 'Sterling Silver', 'Albert Swivel', '22mm', 20.94, true, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'AS26SS', 'Albert Swivel', 'Sterling Silver', 'Albert Swivel', '26mm', 24.06, true, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'BR129RG', 'Heavy Bolt Ring', '9ct Rose Gold', 'Heavy Bolt Ring', '12mm', 273.09, true, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'BR149RG', 'Heavy Bolt Ring', '9ct Rose Gold', 'Heavy Bolt Ring', '14mm', 288.3, true, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'BR169RG', 'Heavy Bolt Ring', '9ct Rose Gold', 'Heavy Bolt Ring', '16mm', 495.57, true, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'BR189RG', 'Heavy Bolt Ring', '9ct Rose Gold', 'Heavy Bolt Ring', '18mm', 461.78, true, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'BR209RG', 'Heavy Bolt Ring', '9ct Rose Gold', 'Heavy Bolt Ring', '20mm', 720.34, true, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'BR129WG', 'Heavy Bolt Ring', '9ct White Gold', 'Heavy Bolt Ring', '12mm', 286.74, true, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'BR149WG', 'Heavy Bolt Ring', '9ct White Gold', 'Heavy Bolt Ring', '14mm', 311.89, true, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'BR129YG', 'Heavy Bolt Ring', '9ct Yellow Gold', 'Heavy Bolt Ring', '12mm', 273.09, true, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'BR149YG', 'Heavy Bolt Ring', '9ct Yellow Gold', 'Heavy Bolt Ring', '14mm', 288.3, true, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'BR169YG', 'Heavy Bolt Ring', '9ct Yellow Gold', 'Heavy Bolt Ring', '16mm', 495.57, true, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'BR189YG', 'Heavy Bolt Ring', '9ct Yellow Gold', 'Heavy Bolt Ring', '18mm', 556.36, true, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'BR209YG', 'Heavy Bolt Ring', '9ct Yellow Gold', 'Heavy Bolt Ring', '20mm', 720.34, true, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'BR1218YG', 'Heavy Bolt Ring', '18ct Yellow Gold', 'Heavy Bolt Ring', '12mm', 575.96, true, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'BR1418YG', 'Heavy Bolt Ring', '18ct Yellow Gold', 'Heavy Bolt Ring', '14mm', 657.58, true, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'BR1618YG', 'Heavy Bolt Ring', '18ct Yellow Gold', 'Heavy Bolt Ring', '16mm', 1068.27, true, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'BR1818YG', 'Heavy Bolt Ring', '18ct Yellow Gold', 'Heavy Bolt Ring', '18mm', 1131.4, true, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'BR2018YG', 'Heavy Bolt Ring', '18ct Yellow Gold', 'Heavy Bolt Ring', '20mm', 1200.0, true, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'BR12SS', 'Heavy Bolt Ring', 'Sterling Silver', 'Heavy Bolt Ring', '12mm', 22.35, true, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'BR14SS', 'Heavy Bolt Ring', 'Sterling Silver', 'Heavy Bolt Ring', '14mm', 31.4, true, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'BR16SS', 'Heavy Bolt Ring', 'Sterling Silver', 'Heavy Bolt Ring', '16mm', 34.49, true, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'BR18SS', 'Heavy Bolt Ring', 'Sterling Silver', 'Heavy Bolt Ring', '18mm', 37.58, true, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'BR20SS', 'Heavy Bolt Ring', 'Sterling Silver', 'Heavy Bolt Ring', '20mm', 41.33, true, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'BR25SS', 'Heavy Bolt Ring', 'Sterling Silver', 'Heavy Bolt Ring', '25mm', 60.9, true, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'BR59RG', 'Bolt Ring', '9ct Rose Gold', 'Bolt Ring', '5mm', 20.53, true, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'BR69RG', 'Bolt Ring', '9ct Rose Gold', 'Bolt Ring', '6mm', 33.3, true, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'BR79RG', 'Bolt Ring', '9ct Rose Gold', 'Bolt Ring', '7mm', 41.25, true, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'BR89RG', 'Bolt Ring', '9ct Rose Gold', 'Bolt Ring', '8mm', 54.6, true, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'BR559RG', 'Bolt Ring', '9ct Rose Gold', 'Bolt Ring', '5.5mm', 23.7, true, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'BR59WG', 'Bolt Ring', '9ct White Gold', 'Bolt Ring', '5mm', 23.32, true, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'BR69WG', 'Bolt Ring', '9ct White Gold', 'Bolt Ring', '6mm', 34.97, true, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'BR79WG', 'Bolt Ring', '9ct White Gold', 'Bolt Ring', '7mm', 42.24, true, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'BR89WG', 'Bolt Ring', '9ct White Gold', 'Bolt Ring', '8mm', 59.65, true, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'BR59YG', 'Bolt Ring', '9ct Yellow Gold', 'Bolt Ring', '5mm', 20.53, true, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'BR69YG', 'Bolt Ring', '9ct Yellow Gold', 'Bolt Ring', '6mm', 33.3, true, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'BR79YG', 'Bolt Ring', '9ct Yellow Gold', 'Bolt Ring', '7mm', 41.25, true, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'BR89YG', 'Bolt Ring', '9ct Yellow Gold', 'Bolt Ring', '8mm', 54.6, true, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'BR459YG', 'Bolt Ring', '9ct Yellow Gold', 'Bolt Ring', '4.5mm', 12.24, true, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'BR559YG', 'Bolt Ring', '9ct Yellow Gold', 'Bolt Ring', '5.5mm', 23.7, true, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'BR518WG', 'Bolt Ring', '18ct White Gold', 'Bolt Ring', '5mm', 57.31, true, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'BR518YG', 'Bolt Ring', '18ct Yellow Gold', 'Bolt Ring', '5mm', 56.19, true, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'BR618YG', 'Bolt Ring', '18ct Yellow Gold', 'Bolt Ring', '6mm', 65.42, true, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'BR718YG', 'Bolt Ring', '18ct Yellow Gold', 'Bolt Ring', '7mm', 86.28, true, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'BR818YG', 'Bolt Ring', '18ct Yellow Gold', 'Bolt Ring', '8mm', 114.81, true, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'BR5518YG', 'Bolt Ring', '18ct Yellow Gold', 'Bolt Ring', '5.5mm', 61.81, true, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'BR5SS', 'Bolt Ring', 'Sterling Silver', 'Bolt Ring', '5.0mm', 0.98, true, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'BR6SS', 'Bolt Ring', 'Sterling Silver', 'Bolt Ring', '6.0mm', 2.25, true, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'BR7SS', 'Bolt Ring', 'Sterling Silver', 'Bolt Ring', '7mm', 4.01, true, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'BR8SS', 'Bolt Ring', 'Sterling Silver', 'Bolt Ring', '8mm', 5.2, true, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'BR45SS', 'Bolt Ring', 'Sterling Silver', 'Bolt Ring', 'lightweight 5.0mm', 0.73, true, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'BR55SS', 'Bolt Ring', 'Sterling Silver', 'Bolt Ring', '5.5mm', 1.47, true, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'DISC59WG', 'Fancy Butterfly', '9ct White Gold', 'Disc Butterfly', '5mm', 62.62, false, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'DISC69WG', 'Fancy Butterfly', '9ct White Gold', 'Disc Butterfly', '6mm', 108.16, false, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'DISC79WG', 'Fancy Butterfly', '9ct White Gold', 'Disc Butterfly', '7mm', 149.2, false, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'DISC59YG', 'Fancy Butterfly', '9ct Yellow Gold', 'Disc Butterfly', '5mm', 59.22, false, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'DISC69YG', 'Fancy Butterfly', '9ct Yellow Gold', 'Disc Butterfly', '6mm', 95.36, false, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'DISC79YG', 'Fancy Butterfly', '9ct Yellow Gold', 'Disc Butterfly', '7mm', 113.64, false, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'DISC518WG', 'Fancy Butterfly', '18ct White Gold', 'Disc Butterfly', '5mm', 163.14, false, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'DISC618WG', 'Fancy Butterfly', '18ct White Gold', 'Disc Butterfly', '6mm', 279.76, false, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'DISC718WG', 'Fancy Butterfly', '18ct White Gold', 'Disc Butterfly', '7mm', 287.72, false, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'DISC518YG', 'Fancy Butterfly', '18ct Yellow Gold', 'Disc Butterfly', '5mm', 128.42, false, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'DISC618YG', 'Fancy Butterfly', '18ct Yellow Gold', 'Disc Butterfly', '6mm', 250.8, false, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'DISC718YG', 'Fancy Butterfly', '18ct Yellow Gold', 'Disc Butterfly', '7mm', 263.34, false, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'DISC5SS', 'Fancy Butterfly', 'Sterling Silver', 'Disc Butterfly', '5mm', 13.37, false, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'DISC6SS', 'Fancy Butterfly', 'Sterling Silver', 'Disc Butterfly', '6mm', 14.67, false, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'DISC7SS', 'Fancy Butterfly', 'Sterling Silver', 'Disc Butterfly', '7mm', 15.73, false, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'BUTTH9RG', 'Generic Butterfly', '9ct Rose Gold', 'Butterfly - Heavy', '6x4.5mm', 67.12, false, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'BUTTM9RG', 'Generic Butterfly', '9ct Rose Gold', 'Butterfly - Medium', '6x4.5mm', 52.15, false, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'BUTTH9WG', 'Generic Butterfly', '9ct White Gold', 'Butterfly - Heavy', '6x4.5mm', 68.46, false, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'BUTTM9WG', 'Generic Butterfly', '9ct White Gold', 'Butterfly - Medium', '6x4.5mm', 61.14, false, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'BUTTMB9WG', 'Generic Butterfly', '9ct White Gold', 'Butterfly - Medium (B)', '4.85x4.25mm', 40.21, false, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'BUTTH9YG', 'Generic Butterfly', '9ct Yellow Gold', 'Butterfly - Heavy', '6x4.5mm', 67.12, false, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'BUTTM9YG', 'Generic Butterfly', '9ct Yellow Gold', 'Butterfly - Medium', '6x4.5mm', 52.15, false, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'BUTTMB9YG', 'Generic Butterfly', '9ct Yellow Gold', 'Butterfly - Medium (B)', '4.85x4.25mm', 40.12, false, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'BUTTS9YG', 'Generic Butterfly', '9ct Yellow Gold', 'Butterfly - Small', '5mm', 41.78, false, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'BUTTH18YG', 'Generic Butterfly', '18ct Yellow Gold', 'Butterfly - Heavy', '6x4.5mm', 136.32, false, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'BUTTM18YG', 'Generic Butterfly', '18ct Yellow Gold', 'Butterfly - Medium', '6x4.5mm', 129.74, false, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'BUTTS18YG', 'Generic Butterfly', '18ct Yellow Gold', 'Butterfly - Small', '5x3mm', 78.0, false, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'BUTTHSS', 'Generic Butterfly', 'Sterling Silver', 'Butterfly - Heavy', '6x4.5mm', 5.95, false, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'BUTTMBSS', 'Generic Butterfly', 'Sterling Silver', 'Butterfly - Medium (B)', '4.85x4.25mm', 5.94, false, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'BUTTMSS', 'Generic Butterfly', 'Sterling Silver', 'Butterfly - Medium', '6x4.5mm', 5.31, false, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'BUTTRMSS', 'Generic Butterfly', 'Sterling Silver', 'Butterfly - Round Medium', '5.5mm', 10.4, false, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'THREADH18WG', 'Threaded Post & Butterfly', '18ct White Gold', 'Threaded Post & Butterfly - Heavy', NULL, 485.72, false, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'THREADH18YG', 'Threaded Post & Butterfly', '18ct Yellow Gold', 'Threaded Post & Butterfly - Heavy', NULL, 436.7, false, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'THREADH9WG', 'Threaded Post & Butterfly', '9ct White Gold', 'Threaded Post & Butterfly - Heavy', NULL, 242.91, false, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'THREADH9YG', 'Threaded Post & Butterfly', '9ct Yellow Gold', 'Threaded Post & Butterfly - Heavy', NULL, 231.34, false, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'THREADH18RG', 'Threaded Post & Butterfly', '18ct Rose Gold', 'Threaded Post & Butterfly - Heavy', NULL, 436.7, false, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'THREAD9RG', 'Threaded Post & Butterfly', '9ct Rose Gold', 'Threaded Post & Butterfly - Standard', NULL, 132.26, false, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'THREAD9WG', 'Threaded Post & Butterfly', '9ct White Gold', 'Threaded Post & Butterfly - Standard', NULL, 138.48, false, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'THREAD9YG', 'Threaded Post & Butterfly', '9ct Yellow Gold', 'Threaded Post & Butterfly - Standard', NULL, 132.26, false, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'THREAD18RG', 'Threaded Post & Butterfly', '18ct Rose Gold', 'Threaded Post & Butterfly - Standard', NULL, 318.02, false, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'THREAD18WG', 'Threaded Post & Butterfly', '18ct White Gold', 'Threaded Post & Butterfly - Standard', NULL, 324.38, false, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'THREAD18YG', 'Threaded Post & Butterfly', '18ct Yellow Gold', 'Threaded Post & Butterfly - Standard', NULL, 318.02, false, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'THREADSS', 'Threaded Post & Butterfly', 'Sterling Silver', 'Threaded Post & Butterfly - Standard', NULL, 10.18, false, false, 'Standard price used (was on clearance at $7.64)'),
  ('00000000-0000-0000-0000-000000000001', 'HP109RG', 'Cartier Clasp', '9ct Rose Gold', 'Cartier Clasp', '10mm', 119.15, true, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'HP129RG', 'Cartier Clasp', '9ct Rose Gold', 'Cartier Clasp', '12mm', 139.4, true, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'HP18S9WG', 'Cartier Clasp', '9ct White Gold', 'Cartier Clasp (Swivel)', '8x18mm', 397.16, true, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'HP89WG', 'Cartier Clasp', '9ct White Gold', 'Cartier Clasp', '8mm', 56.91, true, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'HP109WG', 'Cartier Clasp', '9ct White Gold', 'Cartier Clasp', '10mm', 121.0, true, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'HP129WG', 'Cartier Clasp', '9ct White Gold', 'Cartier Clasp', '12mm', 142.19, true, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'HP99WP', 'Cartier Clasp', '9ct Yellow Gold (Rhodium Plated)', 'Cartier Clasp', '9mm', 77.34, true, false, 'Standard price used (was on sale at $44.01)'),
  ('00000000-0000-0000-0000-000000000001', 'HP139WP', 'Cartier Clasp', '9ct Yellow Gold (Rhodium Plated)', 'Cartier Clasp', '13mm', 189.2, true, false, 'Standard price used (was on sale at $110.56)'),
  ('00000000-0000-0000-0000-000000000001', 'HP169WP', 'Cartier Clasp', '9ct Yellow Gold (Rhodium Plated)', 'Cartier Clasp', '16mm', 270.32, true, false, 'Standard price used (was on sale at $181.40)'),
  ('00000000-0000-0000-0000-000000000001', 'HP89YG', 'Cartier Clasp', '9ct Yellow Gold', 'Cartier Clasp', '8mm', 54.2, true, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'HP99YG', 'Cartier Clasp', '9ct Yellow Gold', 'Cartier Clasp', '9mm', 88.72, true, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'HP119YG', 'Cartier Clasp', '9ct Yellow Gold', 'Cartier Clasp', '11mm', 141.69, true, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'HP139YG', 'Cartier Clasp', '9ct Yellow Gold', 'Cartier Clasp', '13mm', 192.04, true, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'HP169YG', 'Cartier Clasp', '9ct Yellow Gold', 'Cartier Clasp', '16mm', 250.35, true, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'HP918WG', 'Cartier Clasp', '18ct White Gold', 'Cartier Clasp', '9mm', 203.88, true, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'HP1118WG', 'Cartier Clasp', '18ct White Gold', 'Cartier Clasp', '11mm', 322.16, true, false, 'Standard price used (was on sale at $241.62)'),
  ('00000000-0000-0000-0000-000000000001', 'HP918YG', 'Cartier Clasp', '18ct Yellow Gold', 'Cartier Clasp', '9mm', 188.78, true, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'HP1118YG', 'Cartier Clasp', '18ct Yellow Gold', 'Cartier Clasp', '11mm', 315.84, true, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'HP9SS', 'Cartier Clasp', 'Sterling Silver', 'Cartier Clasp', '9mm', 5.03, true, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'HP11SS', 'Cartier Clasp', 'Sterling Silver', 'Cartier Clasp', '11mm', 7.58, true, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'HP13SS', 'Cartier Clasp', 'Sterling Silver', 'Cartier Clasp', '13mm', 11.76, true, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'HP16SS', 'Cartier Clasp', 'Sterling Silver', 'Cartier Clasp', '16mm', 21.71, true, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'CHR89RG', 'Parrot Clasp', '9ct Rose Gold', 'Parrot Clasp', '8mm', 46.85, true, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'CHR99RG', 'Parrot Clasp', '9ct Rose Gold', 'Parrot Clasp', '9mm', 72.83, true, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'CHR119RG', 'Parrot Clasp', '9ct Rose Gold', 'Parrot Clasp', '11mm', 100.15, true, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'CHR139RG', 'Parrot Clasp', '9ct Rose Gold', 'Parrot Clasp', '13mm', 148.32, true, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'CHR169RG', 'Parrot Clasp', '9ct Rose Gold', 'Parrot Clasp', '16mm', 239.42, true, false, 'Standard price used (was on sale at $179.57)'),
  ('00000000-0000-0000-0000-000000000001', 'CHR89WG', 'Parrot Clasp', '9ct White Gold', 'Parrot Clasp', '8mm', 50.66, true, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'CHR99WG', 'Parrot Clasp', '9ct White Gold', 'Parrot Clasp', '9mm', 84.3, true, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'CHR119WG', 'Parrot Clasp', '9ct White Gold', 'Parrot Clasp', '11mm', 105.16, true, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'CHR139WG', 'Parrot Clasp', '9ct White Gold', 'Parrot Clasp', '13mm', 159.87, true, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'CHR169WG', 'Parrot Clasp', '9ct White Gold', 'Parrot Clasp', '16mm', 256.99, true, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'CHR79YG', 'Parrot Clasp', '9ct Yellow Gold', 'Parrot Clasp', '7mm', 35.98, true, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'CHR89YG', 'Parrot Clasp', '9ct Yellow Gold', 'Parrot Clasp', '8mm', 46.85, true, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'CHR99YG', 'Parrot Clasp', '9ct Yellow Gold', 'Parrot Clasp', '9mm', 72.83, true, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'CHR119YG', 'Parrot Clasp', '9ct Yellow Gold', 'Parrot Clasp', '11mm', 100.15, true, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'CHR139YG', 'Parrot Clasp', '9ct Yellow Gold', 'Parrot Clasp', '13mm', 148.32, true, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'CHR169YG', 'Parrot Clasp', '9ct Yellow Gold', 'Parrot Clasp', '16mm', 239.42, true, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'CHR179YG', 'Parrot Clasp', '9ct Yellow Gold', 'Parrot Clasp', '17mm', 373.57, true, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'CHR189YG', 'Parrot Clasp', '9ct Yellow Gold', 'Parrot Clasp', '18mm', 496.72, true, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'CHR718WG', 'Parrot Clasp', '18ct White Gold', 'Parrot Clasp', '7mm', 128.49, true, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'CHR818WG', 'Parrot Clasp', '18ct White Gold', 'Parrot Clasp', '8mm', 156.52, true, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'CHR918WG', 'Parrot Clasp', '18ct White Gold', 'Parrot Clasp', '9mm', 182.98, true, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'CHR1118WG', 'Parrot Clasp', '18ct White Gold', 'Parrot Clasp', '11mm', 266.34, true, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'CHR1318WG', 'Parrot Clasp', '18ct White Gold', 'Parrot Clasp', '13mm', 426.74, true, false, 'Standard price used (was on sale at $248.62)'),
  ('00000000-0000-0000-0000-000000000001', 'CHR1618WG', 'Parrot Clasp', '18ct White Gold', 'Parrot Clasp', '16mm', 528.57, true, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'CHR7SS', 'Parrot Clasp', 'Sterling Silver', 'Parrot Clasp', '7mm', 1.98, true, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'CHR8SS', 'Parrot Clasp', 'Sterling Silver', 'Parrot Clasp', '8mm', 3.44, true, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'CHR9SS', 'Parrot Clasp', 'Sterling Silver', 'Parrot Clasp', '9mm', 5.45, true, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'CHR11SS', 'Parrot Clasp', 'Sterling Silver', 'Parrot Clasp', '11mm', 8.1, true, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'CHR13SS', 'Parrot Clasp', 'Sterling Silver', 'Parrot Clasp', '13mm', 10.98, true, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'CHR16SS', 'Parrot Clasp', 'Sterling Silver', 'Parrot Clasp', '16mm', 14.86, true, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'CHR17SS', 'Parrot Clasp', 'Sterling Silver', 'Parrot Clasp', '17mm', 19.0, true, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'CHR18SS', 'Parrot Clasp', 'Sterling Silver', 'Parrot Clasp', '18mm', 25.08, true, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'FINL39WG', 'Flat Final', '9ct White Gold', 'Flat Final', '3mm', 19.87, false, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'FINL49WG', 'Flat Final', '9ct White Gold', 'Flat Final', '4mm', 32.2, false, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'FINL59WG', 'Flat Final', '9ct White Gold', 'Flat Final', '5mm', 44.44, false, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'FINL39YG', 'Flat Final', '9ct Yellow Gold', 'Flat Final', '3mm', 19.48, false, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'FINL49YG', 'Flat Final', '9ct Yellow Gold', 'Flat Final', '4mm', 28.02, false, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'FINL59YG', 'Flat Final', '9ct Yellow Gold', 'Flat Final', '5mm', 35.94, false, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'FINL69YG', 'Flat Final', '9ct Yellow Gold', 'Flat Final', '6mm', 48.24, false, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'FINL79YG', 'Flat Final', '9ct Yellow Gold', 'Flat Final', '7mm', 54.4, false, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'FINL89YG', 'Flat Final', '9ct Yellow Gold', 'Flat Final', '8mm', 67.28, false, false, 'Standard price used (was on sale at $38.64)'),
  ('00000000-0000-0000-0000-000000000001', 'FINL518WG', 'Flat Final', '18ct White Gold', 'Flat Final', '5mm', 115.93, false, false, 'Standard price used (was on clearance at $51.89)'),
  ('00000000-0000-0000-0000-000000000001', 'FINL318YG', 'Flat Final', '18ct Yellow Gold', 'Flat Final', '3mm', 47.46, false, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'FINL418YG', 'Flat Final', '18ct Yellow Gold', 'Flat Final', '4mm', 70.13, false, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'FINL518YG', 'Flat Final', '18ct Yellow Gold', 'Flat Final', '5mm', 87.66, false, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'FINL3518YG', 'Flat Final', '18ct Yellow Gold', 'Flat Final', '3.5mm', 56.1, false, false, 'Standard price used (was on sale at $42.08)'),
  ('00000000-0000-0000-0000-000000000001', 'FINL3SS', 'Flat Final', 'Sterling Silver', 'Flat Final', '3mm', 1.0, false, false, 'Standard price used (was on sale at $0.42)'),
  ('00000000-0000-0000-0000-000000000001', 'FINL4SS', 'Flat Final', 'Sterling Silver', 'Flat Final', '4mm', 1.56, false, false, 'Standard price used (was on sale at $0.64)'),
  ('00000000-0000-0000-0000-000000000001', 'FINL5SS', 'Flat Final', 'Sterling Silver', 'Flat Final', '5mm', 1.77, false, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'FINL6SS', 'Flat Final', 'Sterling Silver', 'Flat Final', '6mm', 2.1, false, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'FINL7SS', 'Flat Final', 'Sterling Silver', 'Flat Final', '7mm', 3.05, false, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'FINL8SS', 'Flat Final', 'Sterling Silver', 'Flat Final', '8mm', 4.33, false, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'FINL35SS', 'Flat Final', 'Sterling Silver', 'Flat Final', '3.5mm', 1.22, false, false, 'Standard price used (was on sale at $0.32)'),
  ('00000000-0000-0000-0000-000000000001', 'PCMB12RG', 'Magnetic Ball Clasp', 'Gold Plated', 'Magnetic Ball Clasp', '12mm', 49.49, false, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'PCMBL8GF', 'Magnetic Ball Clasp', 'Rolled Gold', 'Magnetic Ball (Pressed)', '8mm', 34.97, false, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'PCMBL10GF', 'Magnetic Ball Clasp', 'Rolled Gold', 'Magnetic Ball (Pressed)', '10mm', 43.23, false, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'PCMBL109YG', 'Magnetic Ball Clasp', '9ct Yellow Gold', 'Magnetic Ball (Pressed)', '10mm', 231.36, false, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'PCMBL814YG', 'Magnetic Ball Clasp', '14ct Yellow Gold', 'Magnetic Ball (Pressed)', '8mm', 214.94, false, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'PCMBL1014YG', 'Magnetic Ball Clasp', '14ct Yellow Gold', 'Magnetic Ball (Pressed)', '10mm', 371.88, false, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'PCMB12SS', 'Magnetic Ball Clasp', 'Sterling Silver', 'Magnetic Ball Clasp (Cast)', '12mm', 48.52, false, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'PCMBL8SS', 'Magnetic Ball Clasp', 'Sterling Silver', 'Magnetic Ball (Pressed)', '8mm', 20.8, false, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'PCMBL10SS', 'Magnetic Ball Clasp', 'Sterling Silver', 'Magnetic Ball (Pressed)', '10mm', 26.26, false, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'POST-DISC-SS', 'Earring Post', 'Sterling Silver', 'Disc Headed Post', '6mm', 12.49, false, false, 'No product code provided on source page'),
  ('00000000-0000-0000-0000-000000000001', 'POST-18WG', 'Earring Post', '18ct White Gold', 'Post Plain', NULL, 81.42, false, false, 'No product code provided on source page'),
  ('00000000-0000-0000-0000-000000000001', 'POST-18YG', 'Earring Post', '18ct Yellow Gold', 'Post Plain', NULL, 77.54, false, false, 'No product code provided on source page'),
  ('00000000-0000-0000-0000-000000000001', 'POST-9RG', 'Earring Post', '9ct Rose Gold', 'Post Plain', NULL, 42.44, false, false, 'No product code provided on source page'),
  ('00000000-0000-0000-0000-000000000001', 'POST-9WG', 'Earring Post', '9ct White Gold', 'Post Plain', NULL, 44.56, false, false, 'No product code provided on source page'),
  ('00000000-0000-0000-0000-000000000001', 'POST-9YG', 'Earring Post', '9ct Yellow Gold', 'Post Plain', NULL, 42.44, false, false, 'No product code provided on source page'),
  ('00000000-0000-0000-0000-000000000001', 'POST-SS-A', 'Earring Post', 'Sterling Silver', 'Post Plain', NULL, 4.43, false, false, 'No product code provided on source page'),
  ('00000000-0000-0000-0000-000000000001', 'POST-SS-B', 'Earring Post', 'Sterling Silver', 'Post Plain', NULL, 2.17, false, false, 'No product code provided; page shows ''View Options'' for size/style variants'),
  ('00000000-0000-0000-0000-000000000001', 'SC409RG', 'Safety Chain', '9ct Rose Gold', 'Safety Chain - Light Trace', NULL, 81.18, true, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'SC509RG', 'Safety Chain', '9ct Rose Gold', 'Safety Chain - Medium Curb', NULL, 145.1, true, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'SC609RG', 'Safety Chain', '9ct Rose Gold', 'Safety Chain - Heavy Curb', NULL, 174.12, true, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'SC509WG', 'Safety Chain', '9ct White Gold', 'Safety Chain - Medium Curb', NULL, 159.61, true, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'SC409YG', 'Safety Chain', '9ct Yellow Gold', 'Safety Chain - Light Trace', NULL, 81.18, true, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'SC459YG', 'Safety Chain', '9ct Yellow Gold', 'Safety Chain - Light Curb', NULL, 86.05, true, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'SC509YG', 'Safety Chain', '9ct Yellow Gold', 'Safety Chain - Medium Curb', NULL, 145.1, true, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'SC609YG', 'Safety Chain', '9ct Yellow Gold', 'Safety Chain - Heavy Curb', NULL, 174.12, true, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'SC809YG', 'Safety Chain', '9ct Yellow Gold', 'Safety Chain - Extra Heavy Curb', NULL, 373.34, true, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'SC5018WG', 'Safety Chain', '18ct White Gold', 'Safety Chain - Medium Curb', NULL, 350.41, true, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'SC4018YG', 'Safety Chain', '18ct Yellow Gold', 'Safety Chain - Light Trace', NULL, 218.64, true, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'SC4518YG', 'Safety Chain', '18ct Yellow Gold', 'Safety Chain - Light Curb', NULL, 76.14, true, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'SC5018YG', 'Safety Chain', '18ct Yellow Gold', 'Safety Chain - Medium Curb', NULL, 340.2, true, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'SC6018YG', 'Safety Chain', '18ct Yellow Gold', 'Safety Chain - Heavy Curb', NULL, 426.8, true, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'SC40SS', 'Safety Chain', 'Sterling Silver', 'Safety Chain - Light Trace', NULL, 6.31, true, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'SC50SS', 'Safety Chain', 'Sterling Silver', 'Safety Chain - Medium Curb', NULL, 10.33, true, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'SC60SS', 'Safety Chain', 'Sterling Silver', 'Safety Chain - Heavy Curb', NULL, 11.36, true, false, 'Standard price used (was on sale at $3.98)'),
  ('00000000-0000-0000-0000-000000000001', 'SC80SS', 'Safety Chain', 'Sterling Silver', 'Safety Chain - Extra Heavy Curb', NULL, 22.37, true, false, NULL),
  ('00000000-0000-0000-0000-000000000001', 'JR19YG', 'Jump Ring', '9ct Yellow Gold', 'Jump Ring', '1mm', 1.35, false, true, 'ESTIMATED placeholder cost -- no supplier price sheet provided for jump rings yet, replace with real cost'),
  ('00000000-0000-0000-0000-000000000001', 'JR29YG', 'Jump Ring', '9ct Yellow Gold', 'Jump Ring', '2mm', 2.7, false, true, 'ESTIMATED placeholder cost -- no supplier price sheet provided for jump rings yet, replace with real cost'),
  ('00000000-0000-0000-0000-000000000001', 'JR39YG', 'Jump Ring', '9ct Yellow Gold', 'Jump Ring', '3mm', 4.05, false, true, 'ESTIMATED placeholder cost -- no supplier price sheet provided for jump rings yet, replace with real cost'),
  ('00000000-0000-0000-0000-000000000001', 'JR49YG', 'Jump Ring', '9ct Yellow Gold', 'Jump Ring', '4mm', 5.4, false, true, 'ESTIMATED placeholder cost -- no supplier price sheet provided for jump rings yet, replace with real cost'),
  ('00000000-0000-0000-0000-000000000001', 'JR59YG', 'Jump Ring', '9ct Yellow Gold', 'Jump Ring', '5mm', 6.75, false, true, 'ESTIMATED placeholder cost -- no supplier price sheet provided for jump rings yet, replace with real cost'),
  ('00000000-0000-0000-0000-000000000001', 'JR69YG', 'Jump Ring', '9ct Yellow Gold', 'Jump Ring', '6mm', 8.1, false, true, 'ESTIMATED placeholder cost -- no supplier price sheet provided for jump rings yet, replace with real cost'),
  ('00000000-0000-0000-0000-000000000001', 'JR79YG', 'Jump Ring', '9ct Yellow Gold', 'Jump Ring', '7mm', 9.45, false, true, 'ESTIMATED placeholder cost -- no supplier price sheet provided for jump rings yet, replace with real cost'),
  ('00000000-0000-0000-0000-000000000001', 'JR89YG', 'Jump Ring', '9ct Yellow Gold', 'Jump Ring', '8mm', 10.8, false, true, 'ESTIMATED placeholder cost -- no supplier price sheet provided for jump rings yet, replace with real cost'),
  ('00000000-0000-0000-0000-000000000001', 'JR99YG', 'Jump Ring', '9ct Yellow Gold', 'Jump Ring', '9mm', 12.15, false, true, 'ESTIMATED placeholder cost -- no supplier price sheet provided for jump rings yet, replace with real cost'),
  ('00000000-0000-0000-0000-000000000001', 'JR109YG', 'Jump Ring', '9ct Yellow Gold', 'Jump Ring', '10mm', 13.5, false, true, 'ESTIMATED placeholder cost -- no supplier price sheet provided for jump rings yet, replace with real cost'),
  ('00000000-0000-0000-0000-000000000001', 'JR129YG', 'Jump Ring', '9ct Yellow Gold', 'Jump Ring', '12mm', 16.2, false, true, 'ESTIMATED placeholder cost -- no supplier price sheet provided for jump rings yet, replace with real cost'),
  ('00000000-0000-0000-0000-000000000001', 'JR149YG', 'Jump Ring', '9ct Yellow Gold', 'Jump Ring', '14mm', 18.9, false, true, 'ESTIMATED placeholder cost -- no supplier price sheet provided for jump rings yet, replace with real cost'),
  ('00000000-0000-0000-0000-000000000001', 'JR169YG', 'Jump Ring', '9ct Yellow Gold', 'Jump Ring', '16mm', 21.6, false, true, 'ESTIMATED placeholder cost -- no supplier price sheet provided for jump rings yet, replace with real cost'),
  ('00000000-0000-0000-0000-000000000001', 'JR189YG', 'Jump Ring', '9ct Yellow Gold', 'Jump Ring', '18mm', 24.3, false, true, 'ESTIMATED placeholder cost -- no supplier price sheet provided for jump rings yet, replace with real cost'),
  ('00000000-0000-0000-0000-000000000001', 'JR19WG', 'Jump Ring', '9ct White Gold', 'Jump Ring', '1mm', 1.45, false, true, 'ESTIMATED placeholder cost -- no supplier price sheet provided for jump rings yet, replace with real cost'),
  ('00000000-0000-0000-0000-000000000001', 'JR29WG', 'Jump Ring', '9ct White Gold', 'Jump Ring', '2mm', 2.9, false, true, 'ESTIMATED placeholder cost -- no supplier price sheet provided for jump rings yet, replace with real cost'),
  ('00000000-0000-0000-0000-000000000001', 'JR39WG', 'Jump Ring', '9ct White Gold', 'Jump Ring', '3mm', 4.35, false, true, 'ESTIMATED placeholder cost -- no supplier price sheet provided for jump rings yet, replace with real cost'),
  ('00000000-0000-0000-0000-000000000001', 'JR49WG', 'Jump Ring', '9ct White Gold', 'Jump Ring', '4mm', 5.8, false, true, 'ESTIMATED placeholder cost -- no supplier price sheet provided for jump rings yet, replace with real cost'),
  ('00000000-0000-0000-0000-000000000001', 'JR59WG', 'Jump Ring', '9ct White Gold', 'Jump Ring', '5mm', 7.25, false, true, 'ESTIMATED placeholder cost -- no supplier price sheet provided for jump rings yet, replace with real cost'),
  ('00000000-0000-0000-0000-000000000001', 'JR69WG', 'Jump Ring', '9ct White Gold', 'Jump Ring', '6mm', 8.7, false, true, 'ESTIMATED placeholder cost -- no supplier price sheet provided for jump rings yet, replace with real cost'),
  ('00000000-0000-0000-0000-000000000001', 'JR79WG', 'Jump Ring', '9ct White Gold', 'Jump Ring', '7mm', 10.15, false, true, 'ESTIMATED placeholder cost -- no supplier price sheet provided for jump rings yet, replace with real cost'),
  ('00000000-0000-0000-0000-000000000001', 'JR89WG', 'Jump Ring', '9ct White Gold', 'Jump Ring', '8mm', 11.6, false, true, 'ESTIMATED placeholder cost -- no supplier price sheet provided for jump rings yet, replace with real cost'),
  ('00000000-0000-0000-0000-000000000001', 'JR99WG', 'Jump Ring', '9ct White Gold', 'Jump Ring', '9mm', 13.05, false, true, 'ESTIMATED placeholder cost -- no supplier price sheet provided for jump rings yet, replace with real cost'),
  ('00000000-0000-0000-0000-000000000001', 'JR109WG', 'Jump Ring', '9ct White Gold', 'Jump Ring', '10mm', 14.5, false, true, 'ESTIMATED placeholder cost -- no supplier price sheet provided for jump rings yet, replace with real cost'),
  ('00000000-0000-0000-0000-000000000001', 'JR129WG', 'Jump Ring', '9ct White Gold', 'Jump Ring', '12mm', 17.4, false, true, 'ESTIMATED placeholder cost -- no supplier price sheet provided for jump rings yet, replace with real cost'),
  ('00000000-0000-0000-0000-000000000001', 'JR149WG', 'Jump Ring', '9ct White Gold', 'Jump Ring', '14mm', 20.3, false, true, 'ESTIMATED placeholder cost -- no supplier price sheet provided for jump rings yet, replace with real cost'),
  ('00000000-0000-0000-0000-000000000001', 'JR169WG', 'Jump Ring', '9ct White Gold', 'Jump Ring', '16mm', 23.2, false, true, 'ESTIMATED placeholder cost -- no supplier price sheet provided for jump rings yet, replace with real cost'),
  ('00000000-0000-0000-0000-000000000001', 'JR189WG', 'Jump Ring', '9ct White Gold', 'Jump Ring', '18mm', 26.1, false, true, 'ESTIMATED placeholder cost -- no supplier price sheet provided for jump rings yet, replace with real cost'),
  ('00000000-0000-0000-0000-000000000001', 'JR19RG', 'Jump Ring', '9ct Rose Gold', 'Jump Ring', '1mm', 1.35, false, true, 'ESTIMATED placeholder cost -- no supplier price sheet provided for jump rings yet, replace with real cost'),
  ('00000000-0000-0000-0000-000000000001', 'JR29RG', 'Jump Ring', '9ct Rose Gold', 'Jump Ring', '2mm', 2.7, false, true, 'ESTIMATED placeholder cost -- no supplier price sheet provided for jump rings yet, replace with real cost'),
  ('00000000-0000-0000-0000-000000000001', 'JR39RG', 'Jump Ring', '9ct Rose Gold', 'Jump Ring', '3mm', 4.05, false, true, 'ESTIMATED placeholder cost -- no supplier price sheet provided for jump rings yet, replace with real cost'),
  ('00000000-0000-0000-0000-000000000001', 'JR49RG', 'Jump Ring', '9ct Rose Gold', 'Jump Ring', '4mm', 5.4, false, true, 'ESTIMATED placeholder cost -- no supplier price sheet provided for jump rings yet, replace with real cost'),
  ('00000000-0000-0000-0000-000000000001', 'JR59RG', 'Jump Ring', '9ct Rose Gold', 'Jump Ring', '5mm', 6.75, false, true, 'ESTIMATED placeholder cost -- no supplier price sheet provided for jump rings yet, replace with real cost'),
  ('00000000-0000-0000-0000-000000000001', 'JR69RG', 'Jump Ring', '9ct Rose Gold', 'Jump Ring', '6mm', 8.1, false, true, 'ESTIMATED placeholder cost -- no supplier price sheet provided for jump rings yet, replace with real cost'),
  ('00000000-0000-0000-0000-000000000001', 'JR79RG', 'Jump Ring', '9ct Rose Gold', 'Jump Ring', '7mm', 9.45, false, true, 'ESTIMATED placeholder cost -- no supplier price sheet provided for jump rings yet, replace with real cost'),
  ('00000000-0000-0000-0000-000000000001', 'JR89RG', 'Jump Ring', '9ct Rose Gold', 'Jump Ring', '8mm', 10.8, false, true, 'ESTIMATED placeholder cost -- no supplier price sheet provided for jump rings yet, replace with real cost'),
  ('00000000-0000-0000-0000-000000000001', 'JR99RG', 'Jump Ring', '9ct Rose Gold', 'Jump Ring', '9mm', 12.15, false, true, 'ESTIMATED placeholder cost -- no supplier price sheet provided for jump rings yet, replace with real cost'),
  ('00000000-0000-0000-0000-000000000001', 'JR109RG', 'Jump Ring', '9ct Rose Gold', 'Jump Ring', '10mm', 13.5, false, true, 'ESTIMATED placeholder cost -- no supplier price sheet provided for jump rings yet, replace with real cost'),
  ('00000000-0000-0000-0000-000000000001', 'JR129RG', 'Jump Ring', '9ct Rose Gold', 'Jump Ring', '12mm', 16.2, false, true, 'ESTIMATED placeholder cost -- no supplier price sheet provided for jump rings yet, replace with real cost'),
  ('00000000-0000-0000-0000-000000000001', 'JR149RG', 'Jump Ring', '9ct Rose Gold', 'Jump Ring', '14mm', 18.9, false, true, 'ESTIMATED placeholder cost -- no supplier price sheet provided for jump rings yet, replace with real cost'),
  ('00000000-0000-0000-0000-000000000001', 'JR169RG', 'Jump Ring', '9ct Rose Gold', 'Jump Ring', '16mm', 21.6, false, true, 'ESTIMATED placeholder cost -- no supplier price sheet provided for jump rings yet, replace with real cost'),
  ('00000000-0000-0000-0000-000000000001', 'JR189RG', 'Jump Ring', '9ct Rose Gold', 'Jump Ring', '18mm', 24.3, false, true, 'ESTIMATED placeholder cost -- no supplier price sheet provided for jump rings yet, replace with real cost'),
  ('00000000-0000-0000-0000-000000000001', 'JR118YG', 'Jump Ring', '18ct Yellow Gold', 'Jump Ring', '1mm', 2.85, false, true, 'ESTIMATED placeholder cost -- no supplier price sheet provided for jump rings yet, replace with real cost'),
  ('00000000-0000-0000-0000-000000000001', 'JR218YG', 'Jump Ring', '18ct Yellow Gold', 'Jump Ring', '2mm', 5.7, false, true, 'ESTIMATED placeholder cost -- no supplier price sheet provided for jump rings yet, replace with real cost'),
  ('00000000-0000-0000-0000-000000000001', 'JR318YG', 'Jump Ring', '18ct Yellow Gold', 'Jump Ring', '3mm', 8.55, false, true, 'ESTIMATED placeholder cost -- no supplier price sheet provided for jump rings yet, replace with real cost'),
  ('00000000-0000-0000-0000-000000000001', 'JR418YG', 'Jump Ring', '18ct Yellow Gold', 'Jump Ring', '4mm', 11.4, false, true, 'ESTIMATED placeholder cost -- no supplier price sheet provided for jump rings yet, replace with real cost'),
  ('00000000-0000-0000-0000-000000000001', 'JR518YG', 'Jump Ring', '18ct Yellow Gold', 'Jump Ring', '5mm', 14.25, false, true, 'ESTIMATED placeholder cost -- no supplier price sheet provided for jump rings yet, replace with real cost'),
  ('00000000-0000-0000-0000-000000000001', 'JR618YG', 'Jump Ring', '18ct Yellow Gold', 'Jump Ring', '6mm', 17.1, false, true, 'ESTIMATED placeholder cost -- no supplier price sheet provided for jump rings yet, replace with real cost'),
  ('00000000-0000-0000-0000-000000000001', 'JR718YG', 'Jump Ring', '18ct Yellow Gold', 'Jump Ring', '7mm', 19.95, false, true, 'ESTIMATED placeholder cost -- no supplier price sheet provided for jump rings yet, replace with real cost'),
  ('00000000-0000-0000-0000-000000000001', 'JR818YG', 'Jump Ring', '18ct Yellow Gold', 'Jump Ring', '8mm', 22.8, false, true, 'ESTIMATED placeholder cost -- no supplier price sheet provided for jump rings yet, replace with real cost'),
  ('00000000-0000-0000-0000-000000000001', 'JR918YG', 'Jump Ring', '18ct Yellow Gold', 'Jump Ring', '9mm', 25.65, false, true, 'ESTIMATED placeholder cost -- no supplier price sheet provided for jump rings yet, replace with real cost'),
  ('00000000-0000-0000-0000-000000000001', 'JR1018YG', 'Jump Ring', '18ct Yellow Gold', 'Jump Ring', '10mm', 28.5, false, true, 'ESTIMATED placeholder cost -- no supplier price sheet provided for jump rings yet, replace with real cost'),
  ('00000000-0000-0000-0000-000000000001', 'JR1218YG', 'Jump Ring', '18ct Yellow Gold', 'Jump Ring', '12mm', 34.2, false, true, 'ESTIMATED placeholder cost -- no supplier price sheet provided for jump rings yet, replace with real cost'),
  ('00000000-0000-0000-0000-000000000001', 'JR1418YG', 'Jump Ring', '18ct Yellow Gold', 'Jump Ring', '14mm', 39.9, false, true, 'ESTIMATED placeholder cost -- no supplier price sheet provided for jump rings yet, replace with real cost'),
  ('00000000-0000-0000-0000-000000000001', 'JR1618YG', 'Jump Ring', '18ct Yellow Gold', 'Jump Ring', '16mm', 45.6, false, true, 'ESTIMATED placeholder cost -- no supplier price sheet provided for jump rings yet, replace with real cost'),
  ('00000000-0000-0000-0000-000000000001', 'JR1818YG', 'Jump Ring', '18ct Yellow Gold', 'Jump Ring', '18mm', 51.3, false, true, 'ESTIMATED placeholder cost -- no supplier price sheet provided for jump rings yet, replace with real cost'),
  ('00000000-0000-0000-0000-000000000001', 'JR118WG', 'Jump Ring', '18ct White Gold', 'Jump Ring', '1mm', 3.05, false, true, 'ESTIMATED placeholder cost -- no supplier price sheet provided for jump rings yet, replace with real cost'),
  ('00000000-0000-0000-0000-000000000001', 'JR218WG', 'Jump Ring', '18ct White Gold', 'Jump Ring', '2mm', 6.1, false, true, 'ESTIMATED placeholder cost -- no supplier price sheet provided for jump rings yet, replace with real cost'),
  ('00000000-0000-0000-0000-000000000001', 'JR318WG', 'Jump Ring', '18ct White Gold', 'Jump Ring', '3mm', 9.15, false, true, 'ESTIMATED placeholder cost -- no supplier price sheet provided for jump rings yet, replace with real cost'),
  ('00000000-0000-0000-0000-000000000001', 'JR418WG', 'Jump Ring', '18ct White Gold', 'Jump Ring', '4mm', 12.2, false, true, 'ESTIMATED placeholder cost -- no supplier price sheet provided for jump rings yet, replace with real cost'),
  ('00000000-0000-0000-0000-000000000001', 'JR518WG', 'Jump Ring', '18ct White Gold', 'Jump Ring', '5mm', 15.25, false, true, 'ESTIMATED placeholder cost -- no supplier price sheet provided for jump rings yet, replace with real cost'),
  ('00000000-0000-0000-0000-000000000001', 'JR618WG', 'Jump Ring', '18ct White Gold', 'Jump Ring', '6mm', 18.3, false, true, 'ESTIMATED placeholder cost -- no supplier price sheet provided for jump rings yet, replace with real cost'),
  ('00000000-0000-0000-0000-000000000001', 'JR718WG', 'Jump Ring', '18ct White Gold', 'Jump Ring', '7mm', 21.35, false, true, 'ESTIMATED placeholder cost -- no supplier price sheet provided for jump rings yet, replace with real cost'),
  ('00000000-0000-0000-0000-000000000001', 'JR818WG', 'Jump Ring', '18ct White Gold', 'Jump Ring', '8mm', 24.4, false, true, 'ESTIMATED placeholder cost -- no supplier price sheet provided for jump rings yet, replace with real cost'),
  ('00000000-0000-0000-0000-000000000001', 'JR918WG', 'Jump Ring', '18ct White Gold', 'Jump Ring', '9mm', 27.45, false, true, 'ESTIMATED placeholder cost -- no supplier price sheet provided for jump rings yet, replace with real cost'),
  ('00000000-0000-0000-0000-000000000001', 'JR1018WG', 'Jump Ring', '18ct White Gold', 'Jump Ring', '10mm', 30.5, false, true, 'ESTIMATED placeholder cost -- no supplier price sheet provided for jump rings yet, replace with real cost'),
  ('00000000-0000-0000-0000-000000000001', 'JR1218WG', 'Jump Ring', '18ct White Gold', 'Jump Ring', '12mm', 36.6, false, true, 'ESTIMATED placeholder cost -- no supplier price sheet provided for jump rings yet, replace with real cost'),
  ('00000000-0000-0000-0000-000000000001', 'JR1418WG', 'Jump Ring', '18ct White Gold', 'Jump Ring', '14mm', 42.7, false, true, 'ESTIMATED placeholder cost -- no supplier price sheet provided for jump rings yet, replace with real cost'),
  ('00000000-0000-0000-0000-000000000001', 'JR1618WG', 'Jump Ring', '18ct White Gold', 'Jump Ring', '16mm', 48.8, false, true, 'ESTIMATED placeholder cost -- no supplier price sheet provided for jump rings yet, replace with real cost'),
  ('00000000-0000-0000-0000-000000000001', 'JR1818WG', 'Jump Ring', '18ct White Gold', 'Jump Ring', '18mm', 54.9, false, true, 'ESTIMATED placeholder cost -- no supplier price sheet provided for jump rings yet, replace with real cost'),
  ('00000000-0000-0000-0000-000000000001', 'JR118RG', 'Jump Ring', '18ct Rose Gold', 'Jump Ring', '1mm', 2.85, false, true, 'ESTIMATED placeholder cost -- no supplier price sheet provided for jump rings yet, replace with real cost'),
  ('00000000-0000-0000-0000-000000000001', 'JR218RG', 'Jump Ring', '18ct Rose Gold', 'Jump Ring', '2mm', 5.7, false, true, 'ESTIMATED placeholder cost -- no supplier price sheet provided for jump rings yet, replace with real cost'),
  ('00000000-0000-0000-0000-000000000001', 'JR318RG', 'Jump Ring', '18ct Rose Gold', 'Jump Ring', '3mm', 8.55, false, true, 'ESTIMATED placeholder cost -- no supplier price sheet provided for jump rings yet, replace with real cost'),
  ('00000000-0000-0000-0000-000000000001', 'JR418RG', 'Jump Ring', '18ct Rose Gold', 'Jump Ring', '4mm', 11.4, false, true, 'ESTIMATED placeholder cost -- no supplier price sheet provided for jump rings yet, replace with real cost'),
  ('00000000-0000-0000-0000-000000000001', 'JR518RG', 'Jump Ring', '18ct Rose Gold', 'Jump Ring', '5mm', 14.25, false, true, 'ESTIMATED placeholder cost -- no supplier price sheet provided for jump rings yet, replace with real cost'),
  ('00000000-0000-0000-0000-000000000001', 'JR618RG', 'Jump Ring', '18ct Rose Gold', 'Jump Ring', '6mm', 17.1, false, true, 'ESTIMATED placeholder cost -- no supplier price sheet provided for jump rings yet, replace with real cost'),
  ('00000000-0000-0000-0000-000000000001', 'JR718RG', 'Jump Ring', '18ct Rose Gold', 'Jump Ring', '7mm', 19.95, false, true, 'ESTIMATED placeholder cost -- no supplier price sheet provided for jump rings yet, replace with real cost'),
  ('00000000-0000-0000-0000-000000000001', 'JR818RG', 'Jump Ring', '18ct Rose Gold', 'Jump Ring', '8mm', 22.8, false, true, 'ESTIMATED placeholder cost -- no supplier price sheet provided for jump rings yet, replace with real cost'),
  ('00000000-0000-0000-0000-000000000001', 'JR918RG', 'Jump Ring', '18ct Rose Gold', 'Jump Ring', '9mm', 25.65, false, true, 'ESTIMATED placeholder cost -- no supplier price sheet provided for jump rings yet, replace with real cost'),
  ('00000000-0000-0000-0000-000000000001', 'JR1018RG', 'Jump Ring', '18ct Rose Gold', 'Jump Ring', '10mm', 28.5, false, true, 'ESTIMATED placeholder cost -- no supplier price sheet provided for jump rings yet, replace with real cost'),
  ('00000000-0000-0000-0000-000000000001', 'JR1218RG', 'Jump Ring', '18ct Rose Gold', 'Jump Ring', '12mm', 34.2, false, true, 'ESTIMATED placeholder cost -- no supplier price sheet provided for jump rings yet, replace with real cost'),
  ('00000000-0000-0000-0000-000000000001', 'JR1418RG', 'Jump Ring', '18ct Rose Gold', 'Jump Ring', '14mm', 39.9, false, true, 'ESTIMATED placeholder cost -- no supplier price sheet provided for jump rings yet, replace with real cost'),
  ('00000000-0000-0000-0000-000000000001', 'JR1618RG', 'Jump Ring', '18ct Rose Gold', 'Jump Ring', '16mm', 45.6, false, true, 'ESTIMATED placeholder cost -- no supplier price sheet provided for jump rings yet, replace with real cost'),
  ('00000000-0000-0000-0000-000000000001', 'JR1818RG', 'Jump Ring', '18ct Rose Gold', 'Jump Ring', '18mm', 51.3, false, true, 'ESTIMATED placeholder cost -- no supplier price sheet provided for jump rings yet, replace with real cost'),
  ('00000000-0000-0000-0000-000000000001', 'JR1SS', 'Jump Ring', 'Sterling Silver', 'Jump Ring', '1mm', 0.1, false, true, 'ESTIMATED placeholder cost -- no supplier price sheet provided for jump rings yet, replace with real cost'),
  ('00000000-0000-0000-0000-000000000001', 'JR2SS', 'Jump Ring', 'Sterling Silver', 'Jump Ring', '2mm', 0.2, false, true, 'ESTIMATED placeholder cost -- no supplier price sheet provided for jump rings yet, replace with real cost'),
  ('00000000-0000-0000-0000-000000000001', 'JR3SS', 'Jump Ring', 'Sterling Silver', 'Jump Ring', '3mm', 0.3, false, true, 'ESTIMATED placeholder cost -- no supplier price sheet provided for jump rings yet, replace with real cost'),
  ('00000000-0000-0000-0000-000000000001', 'JR4SS', 'Jump Ring', 'Sterling Silver', 'Jump Ring', '4mm', 0.4, false, true, 'ESTIMATED placeholder cost -- no supplier price sheet provided for jump rings yet, replace with real cost'),
  ('00000000-0000-0000-0000-000000000001', 'JR5SS', 'Jump Ring', 'Sterling Silver', 'Jump Ring', '5mm', 0.5, false, true, 'ESTIMATED placeholder cost -- no supplier price sheet provided for jump rings yet, replace with real cost'),
  ('00000000-0000-0000-0000-000000000001', 'JR6SS', 'Jump Ring', 'Sterling Silver', 'Jump Ring', '6mm', 0.6, false, true, 'ESTIMATED placeholder cost -- no supplier price sheet provided for jump rings yet, replace with real cost'),
  ('00000000-0000-0000-0000-000000000001', 'JR7SS', 'Jump Ring', 'Sterling Silver', 'Jump Ring', '7mm', 0.7, false, true, 'ESTIMATED placeholder cost -- no supplier price sheet provided for jump rings yet, replace with real cost'),
  ('00000000-0000-0000-0000-000000000001', 'JR8SS', 'Jump Ring', 'Sterling Silver', 'Jump Ring', '8mm', 0.8, false, true, 'ESTIMATED placeholder cost -- no supplier price sheet provided for jump rings yet, replace with real cost'),
  ('00000000-0000-0000-0000-000000000001', 'JR9SS', 'Jump Ring', 'Sterling Silver', 'Jump Ring', '9mm', 0.9, false, true, 'ESTIMATED placeholder cost -- no supplier price sheet provided for jump rings yet, replace with real cost'),
  ('00000000-0000-0000-0000-000000000001', 'JR10SS', 'Jump Ring', 'Sterling Silver', 'Jump Ring', '10mm', 1.0, false, true, 'ESTIMATED placeholder cost -- no supplier price sheet provided for jump rings yet, replace with real cost'),
  ('00000000-0000-0000-0000-000000000001', 'JR12SS', 'Jump Ring', 'Sterling Silver', 'Jump Ring', '12mm', 1.2, false, true, 'ESTIMATED placeholder cost -- no supplier price sheet provided for jump rings yet, replace with real cost'),
  ('00000000-0000-0000-0000-000000000001', 'JR14SS', 'Jump Ring', 'Sterling Silver', 'Jump Ring', '14mm', 1.4, false, true, 'ESTIMATED placeholder cost -- no supplier price sheet provided for jump rings yet, replace with real cost'),
  ('00000000-0000-0000-0000-000000000001', 'JR16SS', 'Jump Ring', 'Sterling Silver', 'Jump Ring', '16mm', 1.6, false, true, 'ESTIMATED placeholder cost -- no supplier price sheet provided for jump rings yet, replace with real cost'),
  ('00000000-0000-0000-0000-000000000001', 'JR18SS', 'Jump Ring', 'Sterling Silver', 'Jump Ring', '18mm', 1.8, false, true, 'ESTIMATED placeholder cost -- no supplier price sheet provided for jump rings yet, replace with real cost'),
  ('00000000-0000-0000-0000-000000000001', 'JR1PT950', 'Jump Ring', 'Platinum 950', 'Jump Ring', '1mm', 4.2, false, true, 'ESTIMATED placeholder cost -- no supplier price sheet provided for jump rings yet, replace with real cost'),
  ('00000000-0000-0000-0000-000000000001', 'JR2PT950', 'Jump Ring', 'Platinum 950', 'Jump Ring', '2mm', 8.4, false, true, 'ESTIMATED placeholder cost -- no supplier price sheet provided for jump rings yet, replace with real cost'),
  ('00000000-0000-0000-0000-000000000001', 'JR3PT950', 'Jump Ring', 'Platinum 950', 'Jump Ring', '3mm', 12.6, false, true, 'ESTIMATED placeholder cost -- no supplier price sheet provided for jump rings yet, replace with real cost'),
  ('00000000-0000-0000-0000-000000000001', 'JR4PT950', 'Jump Ring', 'Platinum 950', 'Jump Ring', '4mm', 16.8, false, true, 'ESTIMATED placeholder cost -- no supplier price sheet provided for jump rings yet, replace with real cost'),
  ('00000000-0000-0000-0000-000000000001', 'JR5PT950', 'Jump Ring', 'Platinum 950', 'Jump Ring', '5mm', 21.0, false, true, 'ESTIMATED placeholder cost -- no supplier price sheet provided for jump rings yet, replace with real cost'),
  ('00000000-0000-0000-0000-000000000001', 'JR6PT950', 'Jump Ring', 'Platinum 950', 'Jump Ring', '6mm', 25.2, false, true, 'ESTIMATED placeholder cost -- no supplier price sheet provided for jump rings yet, replace with real cost'),
  ('00000000-0000-0000-0000-000000000001', 'JR7PT950', 'Jump Ring', 'Platinum 950', 'Jump Ring', '7mm', 29.4, false, true, 'ESTIMATED placeholder cost -- no supplier price sheet provided for jump rings yet, replace with real cost'),
  ('00000000-0000-0000-0000-000000000001', 'JR8PT950', 'Jump Ring', 'Platinum 950', 'Jump Ring', '8mm', 33.6, false, true, 'ESTIMATED placeholder cost -- no supplier price sheet provided for jump rings yet, replace with real cost'),
  ('00000000-0000-0000-0000-000000000001', 'JR9PT950', 'Jump Ring', 'Platinum 950', 'Jump Ring', '9mm', 37.8, false, true, 'ESTIMATED placeholder cost -- no supplier price sheet provided for jump rings yet, replace with real cost'),
  ('00000000-0000-0000-0000-000000000001', 'JR10PT950', 'Jump Ring', 'Platinum 950', 'Jump Ring', '10mm', 42.0, false, true, 'ESTIMATED placeholder cost -- no supplier price sheet provided for jump rings yet, replace with real cost'),
  ('00000000-0000-0000-0000-000000000001', 'JR12PT950', 'Jump Ring', 'Platinum 950', 'Jump Ring', '12mm', 50.4, false, true, 'ESTIMATED placeholder cost -- no supplier price sheet provided for jump rings yet, replace with real cost'),
  ('00000000-0000-0000-0000-000000000001', 'JR14PT950', 'Jump Ring', 'Platinum 950', 'Jump Ring', '14mm', 58.8, false, true, 'ESTIMATED placeholder cost -- no supplier price sheet provided for jump rings yet, replace with real cost'),
  ('00000000-0000-0000-0000-000000000001', 'JR16PT950', 'Jump Ring', 'Platinum 950', 'Jump Ring', '16mm', 67.2, false, true, 'ESTIMATED placeholder cost -- no supplier price sheet provided for jump rings yet, replace with real cost'),
  ('00000000-0000-0000-0000-000000000001', 'JR18PT950', 'Jump Ring', 'Platinum 950', 'Jump Ring', '18mm', 75.6, false, true, 'ESTIMATED placeholder cost -- no supplier price sheet provided for jump rings yet, replace with real cost');

END $$;

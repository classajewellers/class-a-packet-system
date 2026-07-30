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
-- These 4 metals appear in parts_catalogue but were missing from the
-- original migration 048 seed. Rates are placeholder estimates only.
INSERT INTO pricing_gold_prices (metal_type, price_per_gram, effective_date, notes) VALUES
  ('Sterling Silver', 1.50,  CURRENT_DATE, 'Placeholder rate — confirm with Josh before relying on this for real quotes'),
  ('14ct Yellow Gold', 45.00, CURRENT_DATE, 'Placeholder rate — confirm with Josh before relying on this for real quotes'),
  ('Rolled Gold',      2.00,  CURRENT_DATE, 'Placeholder rate — confirm with Josh before relying on this for real quotes'),
  ('Gold Plated',      1.00,  CURRENT_DATE, 'Placeholder rate — confirm with Josh before relying on this for real quotes')
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
-- OMITTED — awaiting re-share of Class_A_Workshop_Repair_Quoting (2) (1).html
-- to parse the real PRODUCTS array (~350 SKUs).
-- Real categories: Parrot Clasp, Albert Swivel, Heavy Bolt Ring, Bolt Ring,
-- Fancy Butterfly, Generic Butterfly, Threaded Post & Butterfly, Cartier Clasp,
-- Flat Final, Magnetic Ball Clasp, Earring Post, Safety Chain, Jump Ring
-- Rules once that file is provided:
--   is_estimated = true  → every row where category = 'Jump Ring'
--   is_estimated = false → all other categories
--   Flag rows with no product_code and empty note for double-check
DELETE FROM parts_catalogue WHERE tenant_id = tid;

END $$;

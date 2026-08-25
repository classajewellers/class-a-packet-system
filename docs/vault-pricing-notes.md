# Vault Pricing Engine — Reference Notes
*August 2026 — Phase 0 / September launch critical path*

## Core principle

One live pricing function used everywhere: Ring Builder, cabinet pieces, staff iPad scans. No page re-implements pricing logic. No price is ever cached or frozen except an accepted quote's locked snapshot for its validity window (e.g. 7 days).

This was proven necessary by a real competitor (Cullen) who priced an identical ready-to-ship stone higher than a build-your-own equivalent — their cabinet price was calculated once and frozen while their builder stayed live. Vault must not repeat this.

## Three-layer product model

| Layer | Table | Role |
|---|---|---|
| 1 — Design | `inventory_products` | Template: name, category, collection, labour/setting costs, component recipe |
| 2 — Variant | `inventory_product_variants` | Sellable config: metal/karat/colour, band width, claw config → Shopify variant |
| 3 — Physical Piece | `inventory_pieces` | Actual unit: specific stone, weighed gold, RFID identity, status |

## Six pricing components

| Component | Wholesale cost source | Markup |
|---|---|---|
| Metal | `pricing_gold_prices` (live, synced on cadence) | Lower — customers can verify gold price themselves |
| Labour & Setting | `inventory_products.labour_cost` + `setting_cost` | Standard fixed markup |
| Centre Stone — Natural | Nivoda API, resolved by app before calling `calculate_price()` | Tiered: <1ct = 2.5×, 1–2ct = 2×, >2ct = 1.25× |
| Centre Stone — Lab | Nivoda API, resolved by app | Flat 11× — confirmed across 8 real comparison stones, no exception for IF/Flawless |
| Melee / accent | `pricing_melee_stones` — internally maintained flat table | Highest tier (3.5× default) — priced flat off size M (~20 × 0.01ct lab stones) |
| Birthstone | Manually maintained price list | List price + fitting fee (no markup applied) |
| Personalisation | Fixed fee passed by app | No markup — passed through as-is |

All multipliers are stored in `pricing_component_rules` (tenant-configurable) — never hardcoded in the function.

## Two calculation modes

`calculate_price()` accepts either:

- **Made-to-order**: `p_design_id` + `p_band_width_mm` + metal selection — gram weight comes from `design_band_recipes`
- **Ready-to-wear**: `p_piece_id` — gram weight and metal come from the actual `inventory_pieces` row

Both modes return an identical JSONB structure. For the same spec, the totals must match — the test harness in `docs/test-pricing-engine.sql` verifies this.

## Open decisions requiring sign-off

- **Brad**: confirm metal markup multiplier (seeded as 1.40) and labour multiplier (seeded as 1.80)
- **Brad**: confirm melee multiplier (seeded as 3.50)
- **Brad/Josh**: confirm natural diamond tier breakpoints — <1ct = 2.5×, 1–2ct = 2×, >2ct = 1.25×
- **Ben**: exact gram weight per band width per karat — needed to populate `design_band_recipes`
- **Ben/Sam**: standard melee config for size M diamond band (count and size) — affects melee cost baseline

## Engineering constraints

- `calculate_price()` is a pure SQL function — never calls Nivoda or any external API
- Application layer resolves stone wholesale cost from Nivoda BEFORE calling the function
- Gold price is read directly from `pricing_gold_prices` (synced externally, never called live inside the function)
- Every table has `tenant_id` — multi-tenant from day one

## Key table naming

| What the brief calls it | Actual table | Notes |
|---|---|---|
| Layer 1 Design | `inventory_products` | 079 version (rich). NOT the thin 026 version |
| Layer 2 Variant | `inventory_product_variants` | New table (095) — the 026 `inventory_variants` is legacy, wrong FK, not extended |
| Layer 3 Physical Piece | `inventory_pieces` | Exists since 029, extended through 094 |
| Melee costs | `pricing_melee_stones` | Exists since 016, tenant_id added in 095 |
| Gold prices | `pricing_gold_prices` | Exists since 048, tenant_id added in 095 |
| Component multipliers | `pricing_component_rules` | New table (095) |
| Quote price lock | `price_calculation_snapshots` | New table (095) |

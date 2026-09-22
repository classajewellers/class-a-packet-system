# Vault Build Checklist

Persistent tracking file for the full operational-readiness backlog Josh set on 2026-09-22.
Target: as much as technically possible by Friday 2026-09-25, stretch goal is everything.
Rule: staging-first, no production changes without explicit sign-off. Blocked items are marked
and explained but never halt other work — see "Blocked, needs Josh" section.

Status values: NOT STARTED / IN PROGRESS / BLOCKED / READY FOR TESTING / COMPLETE

Last updated: 2026-09-22 (initial audit + plan)

---

## Already complete (confirmed by code audit — no work needed unless a bug is found)

| Item | Evidence |
|---|---|
| Inventory core (pieces/products/variants) | `supabase/migrations/029_inventory_designs_pieces.sql`, `079_inventory_products_and_sales.sql` |
| Locations (CRUD + hierarchy) | `app/inventory/locations/page.tsx`, `082_inventory_locations_hierarchy.sql` |
| Stock reservations | `081_inventory_reservations.sql`, `app/api/inventory/reservations/*`, wired into `app/inventory/[id]/page.tsx` |
| RFID (end-to-end) | `app/settings/rfid/page.tsx`, `app/api/rfid/*`, `091_rfid_system.sql`, `vault-rfid-bridge/` |
| Purchase orders + packet linking | `app/api/inventory/purchase-orders/*`, `087_po_lines_packet_link.sql` |
| Workshop (list/Board/History) | `app/workshop/{page,board/page,history/page}.tsx`, shared `WorkshopJobDrawer` |
| Workshop manager noticeboard | `app/workshop/board/page.tsx` (`ManagerNoticeboard`, manager-gated) |
| Attachments (universal) | `components/AttachmentsSection.tsx`, wired identically into orders + workshop |
| workshop_required manual toggle | migration 137, this session — real persisted flag, active-queue gated, History ungated |
| Quotes builders (new item + repair) | `app/quotes/builder/{new,repair}/page.tsx` |
| Quote pricing automation | rule-based via `pricing_component_rules` family + settings routes, not AI |
| Quote Stripe payment links | `app/api/quotes/[id]/payment-link/route.ts`, `lib/generatePaymentLink.ts` |
| Pricing engine (`calculate_price`) | migrations 095, 109, 121, 123-126, 132-134 |
| AI extraction pattern (reusable template) | `app/api/pricing/melee-import/extract/route.ts` — forced tool-use, flag/confirm, never auto-commits |
| PWA viewport/manifest | `app/layout.tsx`, `public/manifest.json` — correctly configured |
| Mobile app shell (Sidebar/TopBar drawer) | `components/Sidebar.tsx`, `components/TopBar.tsx` — working mobile drawer nav |

---

## Phase 1 — Foundational fixes (small, unblocks downstream phases)

| # | Item | Status | Notes |
|---|---|---|---|
| 1.1 | Reorder point / low-stock threshold — serialized designs (`inventory_products`) | READY FOR TESTING | Migration `138_inventory_reorder_points.sql` written + pglite-verified (3/3 checks pass). Adds `reorder_point` + a reusable `inventory_low_stock` view. Needs Josh to apply to staging, same as every other migration this session. |
| 1.1b | Reorder point — quantity-tracked variants (`inventory_product_variants`) | BLOCKED | **New drift found**: `inventory_product_variants` (migration 095) and `inventory_stock_levels` (migration 113) don't exist on staging at all — same class of gap as 077/115 found earlier this session. Deferred rather than guessing at re-applying migrations I didn't author onto an unknown-state DB. Need Josh to confirm these are live on production, then decide whether/how to bring staging in line before the variant-side reorder point can be added. |
| 1.2 | Unify "sell from stock" into the packets/order pipeline | NOT STARTED | `app/api/inventory/sales/route.ts` currently only writes `inventory_sales`, never touches `packets`. This is the single highest-leverage fix — POS, auto-workshop-detection, and QR all depend on sales and orders being one system. |

## Phase 2 — Reusable engines (parallel workstreams, both unblocked)

| # | Item | Status | Notes |
|---|---|---|---|
| 2.1 | Supplier Connector Framework — schema + interface | IN PROGRESS | Generalizing `tenant_shopify_connections` (single-provider) into a multi-provider `provider_type` + credentials/config model. |
| 2.2 | Prana connector (first real implementation) | NOT STARTED | Reuse existing deterministic parser (`lib/melee-import-shared.mjs`, `scripts/import-prana-melee.mjs`) already proven on Prana's real monthly file — deterministic first, AI fallback only per Josh's instruction. |
| 2.3 | Reporting engine — dimensions/metrics/filter abstraction | NOT STARTED | Replaces the 791-line if-chain in `app/api/reporting/route.ts` (7 sections, inventory is a stub, no shared query builder). |

## Phase 3 — Built on the engines

| # | Item | Status | Notes |
|---|---|---|---|
| 3.1 | MAP pricing sync | NOT STARTED | Depends on 2.1. No MAP concept exists anywhere today. |
| 3.2 | Named reports (sales/product/inventory/purchasing/workshop/customers/marketing/staff/financial/retail-ops/e-commerce/executive-exception) | NOT STARTED | Depends on 2.3 — generate from the engine, not hand-built pages. |
| 3.3 | Manager/jeweller dashboards | NOT STARTED | Depends on 2.3. No "jeweller" role exists yet (`lib/userTypes.ts` has admin/manager/staff only) — needs a decision on whether jeweller is a new role or reuses staff+a view flag. |
| 3.4 | Custom report builder | NOT STARTED | Depends on 2.3. Zero prior art in codebase. |

## Phase 4 — Workflow features (depend on Phase 1.2)

| # | Item | Status | Notes |
|---|---|---|---|
| 4.1 | Auto workshop detection | NOT STARTED | Depends on 1.2. Today: manual toggle only + unrelated $3,000 valuation auto-flag. |
| 4.2 | QR codes on labels/pieces | NOT STARTED | Depends on 1.2 for full value; low technical risk otherwise. Labels currently use Code128 barcodes only (`lib/labelGenerator.ts`). |
| 4.3 | Job cards for unplanned mid-job components | NOT STARTED | Existing `po_lines.packet_id` link + `WorkshopJobDrawer` already support the data model; needs UI + Phase 2.1 for AI-assisted supplier pricing. |

## Phase 5 — Sales/POS (depends on Phase 1.2)

| # | Item | Status | Notes |
|---|---|---|---|
| 5.1 | Basic POS (walk-in sale flow) | NOT STARTED | `PacketTypeSelector` only offers repair/custom_order today — no sale-from-stock or walk-in path. |
| 5.2 | Refunds | NOT STARTED | Zero existing refund code anywhere. |
| 5.3 | Real layby schema (payment schedule, partial payments) | NOT STARTED | Today: type enum + JSON blob passthrough (`lib/createPacket.ts:60-64`), unreachable from the order-entry UI at all. |
| 5.4 | EFTPOS/terminal integration | **BLOCKED** | Need Josh: which provider (Tyro/Square/Stripe Terminal/other), account credentials, confirm hardware in hand. |

## Phase 6 — Independent, run anytime

| # | Item | Status | Notes |
|---|---|---|---|
| 6.1 | Settings navigation cleanup ("Tanda-style") | IN PROGRESS | Pricing sub-group already nested under Settings (prior session). Treating as UI/nav tidying only — **no rostering/scheduling feature exists anywhere in the codebase**; if actual staff rostering is wanted, that's new-feature scope, not cleanup — need Josh to confirm intent. |
| 6.2 | ChatGPT-style pricing method | NOT STARTED | Reuses existing Anthropic chat pattern (`app/api/assistant/route.ts`) + `pricing_component_rules`. Must use propose-then-confirm, never auto-commit a pricing change, same safety pattern as melee AI import. |

## Phase 7 — Blocked, needs Josh (do not let these halt other work)

| # | Item | Blocked on |
|---|---|---|
| 7.1 | GIA/IGI certificate integration | What access do we actually have? GIA's report-check API typically needs an enterprise partnership, not public signup. Need Josh to confirm what's contracted/available. |
| 7.2 | EFTPOS/terminal integration | Provider choice + credentials + hardware confirmation (see 5.4). |
| 7.3 | Live Prana/AJS API sync (beyond existing monthly manual upload) | Need real login/API credentials for their ordering/pricing systems, if a live sync is wanted instead of continuing the working monthly CSV upload. |
| 7.4 | Quantity-tracked variant reorder points (1.1b) | Need Josh to confirm whether migrations 095 (`inventory_product_variants`) and 113 (`inventory_stock_levels`, quantity tracking) are actually live on production. If yes, staging needs them applied before variant-level reorder points can be added (same drift-closing pattern as migrations 077 and 115 earlier this session). If no, need to know whether quantity-tracked stock tracking is even in active use anywhere yet. |

## Phase 8 — Systematic mobile/PWA audit (deliberately last per Josh's own instruction #12)

| # | Item | Status | Notes |
|---|---|---|---|
| 8.1 | Jobs page — mobile card view for AdminTable | NOT STARTED | Cheap, unblocked, can slot in opportunistically before Phase 8 formally starts. Pattern already proven in `app/quotes/page.tsx`/`app/online/page.tsx`. |
| 8.2 | Workshop page — stepper scroll wrapper + phone-width row layout | NOT STARTED | Same — cheap, can slot in early. |
| 8.3 | Full systematic responsive audit (phone + iPad breakpoints, whole app) | NOT STARTED | Explicitly deferred until core workflows (Phases 1-5) are stable, per Josh's instruction. |

---

## Open questions for Josh (not blockers to progress, but need answers eventually)
- Is "jeweller" meant to be a new user role, or a view/filter on top of existing staff accounts? (3.3)
- Is "Tanda-style cleanup" purely visual/navigational, or does Josh actually want staff rostering/scheduling built? (6.1) — this is a materially different scope if the latter.
- Confirm EFTPOS provider choice once ready (5.4/7.2).
- Confirm GIA/IGI access level once known (7.1).

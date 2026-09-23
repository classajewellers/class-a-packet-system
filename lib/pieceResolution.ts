// Resolves display fields for an inventory_pieces row across two genuinely
// different, both-real production/staging schemas — NOT drift, confirmed
// 2026-09-23. Production has a real, actively-used category_id/status_id/
// title model (custom statuses like "Awaiting photography" that don't
// exist anywhere else); staging's inventory_pieces lacks those columns
// entirely and uses a plain product_id/status(text) model instead.
//
// This module is the single place that understands the priority order
// between the two models, so both API routes (list + product-detail/
// grouped) stay in sync. It never assumes a fixed row shape — every field
// is read defensively (a missing key on a plain JS object is just
// `undefined`, never a throw), so the exact same code runs unmodified in
// both environments.
//
// Priority order (confirmed with Josh 2026-09-23):
//   Category: category_id -> inventory_categories.name, else linked
//             product's category text, else null.
//   Status:   status_id -> inventory_statuses (name + real colour) —
//             preserves custom production statuses — else the plain
//             status text column mapped through a fixed fallback palette,
//             else null.
//   Design:   linked product's name, else the piece's own title field
//             (real, filled on production; simply absent on staging), else
//             null.
//   Supplier: intentionally not resolved here — confirmed unused on both
//             environments (0/10 on production), left out of list/create.

import { buildLocationPath, LocationNode, toLocationsById } from "@/lib/locationPath";

export interface CategoryRow { id: string; name: string }
export interface StatusRow { id: string; name: string; colour: string }
export interface ProductLite { id: string; name: string; category?: string | null }

export interface ResolvedPieceExtras {
  resolved_category: string | null;
  resolved_status: { label: string; colour: string } | null;
  resolved_design: string | null;
  location_path: string | null;
}

// Used only as the fallback when a piece has no status_id (or the richer
// schema doesn't exist at all) — matches the enum confirmed live on
// staging: in_stock|on_order|sold|workshop|consignment|repair|reserved.
export const FALLBACK_STATUS_OPTIONS: { value: string; label: string; colour: string }[] = [
  { value: "in_stock",    label: "In Stock",    colour: "#10B981" },
  { value: "on_order",    label: "On Order",    colour: "#3B82F6" },
  { value: "reserved",    label: "Reserved",    colour: "#F59E0B" },
  { value: "workshop",    label: "Workshop",    colour: "#8B5CF6" },
  { value: "repair",      label: "Repair",      colour: "#8B5CF6" },
  { value: "consignment", label: "Consignment", colour: "#3B82F6" },
  { value: "sold",        label: "Sold",        colour: "#6B7280" },
];
const FALLBACK_STATUS_MAP = new Map(FALLBACK_STATUS_OPTIONS.map(s => [s.value, s]));

export function resolvePieceExtras(
  piece: Record<string, unknown>,
  opts: {
    categoriesById: Map<string, CategoryRow>;
    statusesById: Map<string, StatusRow>;
    productsById: Map<string, ProductLite>;
    locationsById: Map<string, LocationNode>;
  }
): ResolvedPieceExtras {
  const categoryId = piece.category_id as string | null | undefined;
  const statusId   = piece.status_id   as string | null | undefined;
  const statusText = piece.status      as string | null | undefined;
  const productId  = piece.product_id  as string | null | undefined;
  const locationId = piece.location_id as string | null | undefined;
  const title      = piece.title       as string | null | undefined;

  const product = productId ? opts.productsById.get(productId) ?? null : null;

  const resolved_category =
    (categoryId && opts.categoriesById.get(categoryId)?.name) ||
    product?.category ||
    null;

  let resolved_status: { label: string; colour: string } | null = null;
  if (statusId && opts.statusesById.has(statusId)) {
    const s = opts.statusesById.get(statusId)!;
    resolved_status = { label: s.name, colour: s.colour };
  } else if (statusText) {
    const fallback = FALLBACK_STATUS_MAP.get(statusText);
    resolved_status = fallback
      ? { label: fallback.label, colour: fallback.colour }
      : { label: statusText, colour: "#9CA3AF" };
  }

  const resolved_design = product?.name || title || null;

  const location_path = buildLocationPath(locationId ?? null, opts.locationsById);

  return { resolved_category, resolved_status, resolved_design, location_path };
}

export { toLocationsById };
export type { LocationNode };

import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";
import {
  resolvePieceExtras, toLocationsById, FALLBACK_STATUS_OPTIONS,
  CategoryRow, StatusRow, ProductLite,
} from "@/lib/pieceResolution";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Confirmed 2026-09-23: production and staging inventory_pieces are
// genuinely different real schemas, not drift. Production has a real,
// actively-used category_id/status_id/title model (custom statuses like
// "Awaiting photography" that only exist there); staging has none of those
// columns and uses a plain product_id/status(text) model instead. This
// route runs unmodified in both — no environment branching — by selecting
// "*" (never errors regardless of which columns exist) and resolving
// display fields defensively via lib/pieceResolution.ts instead of
// PostgREST embeds (which hard-error if the embedded FK doesn't exist at
// all, exactly the failure mode that broke this endpoint before today).
//
// The one embed kept is product:inventory_products — product_id is a real,
// confirmed FK on BOTH environments.
const BASE_SELECT = `*, product:inventory_products(id,name,category)`;
const BASE_SELECT_PRODUCT_INNER = `*, product:inventory_products!inner(id,name,category)`;

// Category name → SKU prefix (case-insensitive substring match)
const CATEGORY_PREFIXES: [string, string][] = [
  ["engagement", "ER"],
  ["wedding",    "WB"],
  ["ring",       "RG"],
  ["earring",    "EA"],
  ["necklace",   "NK"],
  ["bracelet",   "BR"],
  ["pendant",    "PN"],
  ["loose",      "LS"],
  ["stone",      "LS"],
];

function categoryPrefix(categoryName?: string | null): string {
  if (!categoryName) return "XX";
  const lower = categoryName.toLowerCase();
  for (const [keyword, prefix] of CATEGORY_PREFIXES) {
    if (lower.includes(keyword)) return prefix;
  }
  return "XX";
}

async function generateSku(
  supabase: Awaited<ReturnType<typeof createTenantSupabaseClient>>,
  prefix: string
): Promise<string> {
  try {
    const { data } = await supabase
      .from("inventory_pieces")
      .select("sku")
      .ilike("sku", `${prefix}-%`)
      .order("sku", { ascending: false })
      .limit(20);

    let maxSeq = 0;
    for (const row of data ?? []) {
      const parts = (row.sku as string).split("-");
      const seq = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(seq) && seq > maxSeq) maxSeq = seq;
    }

    return `${prefix}-${String(maxSeq + 1).padStart(4, "0")}`;
  } catch (err) {
    console.error("[generateSku] fallback to timestamp:", err);
    return `XX-${Date.now().toString().slice(-4)}`;
  }
}

// Loads the small reference tables needed to resolve display fields, plus
// the products actually referenced by this page of pieces. All selected as
// "*" so an environment missing/adding a column never errors here either.
async function loadResolutionContext(
  supabase: Awaited<ReturnType<typeof createTenantSupabaseClient>>,
  tenantId: string,
  pieces: Record<string, unknown>[]
) {
  const productIds = Array.from(new Set(
    pieces.map(p => p.product_id as string | null).filter((id): id is string => !!id)
  ));

  const [categoriesRes, statusesRes, locationsRes, productsRes] = await Promise.all([
    supabase.from("inventory_categories").select("*").eq("tenant_id", tenantId),
    supabase.from("inventory_statuses").select("*").eq("tenant_id", tenantId),
    supabase.from("inventory_locations").select("*").eq("tenant_id", tenantId),
    productIds.length > 0
      ? supabase.from("inventory_products").select("id,name,category").in("id", productIds)
      : Promise.resolve({ data: [] as ProductLite[] }),
  ]);

  return {
    categoriesById: new Map(((categoriesRes.data ?? []) as CategoryRow[]).map(c => [c.id, c])),
    statusesById:   new Map(((statusesRes.data ?? []) as StatusRow[]).map(s => [s.id, s])),
    locationsById:  toLocationsById((locationsRes.data ?? []) as any[]),
    productsById:   new Map(((productsRes.data ?? []) as ProductLite[]).map(p => [p.id, p])),
  };
}

// GET /api/inventory/pieces
export async function GET(req: NextRequest): Promise<NextResponse> {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  const supabase = await createTenantSupabaseClient(tenantId);

  const { searchParams } = new URL(req.url);
  const search     = searchParams.get("search")   ?? "";
  // category/status filter values are composite: "cat:<id>" (a real
  // inventory_categories row — production), "prod:<text>" (linked
  // product's category text — both environments), "status:<id>" (a real
  // inventory_statuses row — production), or "text:<value>" (the plain
  // status enum — staging, and production pieces with no status_id).
  // See fetchFilterOptions() in the frontend for how these are built.
  const categoryParam = searchParams.get("category") ?? "";
  const statusParam   = searchParams.get("status")   ?? "";
  const locationId    = searchParams.get("location_id") ?? "";
  const page       = Math.max(1, parseInt(searchParams.get("page")     ?? "1",  10));
  const perPage    = Math.min(200, parseInt(searchParams.get("per_page") ?? "50", 10));
  const from       = (page - 1) * perPage;
  const to         = from + perPage - 1;

  const unassigned = searchParams.get("unassigned") === "true";
  const pairedTo   = searchParams.get("paired_to")  ?? "";

  // Category filter: resolve to a concrete piece-id set before the main
  // query, since "cat:" needs category_id and "prod:" needs an inner-join
  // filter on the embedded product — two different mechanisms.
  let categoryProductFilter = "";
  let categoryIdFilter = "";
  if (categoryParam.startsWith("cat:")) {
    categoryIdFilter = categoryParam.slice(4);
  } else if (categoryParam.startsWith("prod:")) {
    categoryProductFilter = categoryParam.slice(5);
  }

  let statusIdFilter = "";
  let statusTextFilter = "";
  if (statusParam.startsWith("status:")) {
    statusIdFilter = statusParam.slice(7);
  } else if (statusParam.startsWith("text:")) {
    statusTextFilter = statusParam.slice(5);
  }

  // category_id/status_id only exist on some environments (production, not
  // staging — confirmed 2026-09-23). A stale/cached dropdown option or a
  // direct API call could still request one of these filters on an
  // environment that doesn't have the column, so probe before using it
  // rather than letting the main query 500.
  if (categoryIdFilter) {
    const probe = await supabase.from("inventory_pieces").select("category_id").limit(1);
    if (probe.error) categoryIdFilter = "";
  }
  if (statusIdFilter) {
    const probe = await supabase.from("inventory_pieces").select("status_id").limit(1);
    if (probe.error) statusIdFilter = "";
  }

  let query = supabase
    .from("inventory_pieces")
    .select(categoryProductFilter ? BASE_SELECT_PRODUCT_INNER : BASE_SELECT, { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  // sku is the one free-text field guaranteed to exist on both schemas;
  // title (production-only) isn't filterable here without a schema check,
  // so search is intentionally sku-only.
  if (search)               query = query.ilike("sku", `%${search}%`);
  if (categoryIdFilter)     query = query.eq("category_id", categoryIdFilter);
  if (categoryProductFilter) query = query.eq("product.category", categoryProductFilter);
  if (statusIdFilter)       query = query.eq("status_id", statusIdFilter);
  if (statusTextFilter)     query = query.eq("status", statusTextFilter);
  if (locationId)           query = query.eq("location_id", locationId);
  if (unassigned)           query = query.is("product_id", null);
  if (pairedTo)             query = query.eq("paired_piece_id", pairedTo);

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rawPieces = (data ?? []) as Record<string, unknown>[];
  const ctx = await loadResolutionContext(supabase, tenantId, rawPieces);
  const pieces = rawPieces.map(p => ({ ...p, ...resolvePieceExtras(p, ctx) }));

  return NextResponse.json(
    { pieces, total: count ?? 0, page, per_page: perPage },
    { headers: { "Cache-Control": "no-store" } }
  );
}

// POST /api/inventory/pieces — create with auto-generated SKU
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const tenantId = req.headers.get("x-tenant-id") ?? "";
    const supabase = await createTenantSupabaseClient(tenantId);

    const body = await req.json();
    console.log("[POST /api/inventory/pieces] body:", JSON.stringify(body));

    // Strip joined relation keys and any client-supplied SKU. The form only
    // ever sends `status` (the plain enum value, e.g. "in_stock") — never
    // category_id/status_id/title directly, since the quick-add form has
    // no UI for those. Whether those richer columns get written at all is
    // decided below, by probing what actually exists in this environment.
    const {
      status, location: _l, category: _c, supplier: _sp,
      sku: _ignoredSku,
      ...insertData
    } = body;

    // Convert empty strings to null for all UUID fields
    const toUUID = (val: any) => (val && val !== "" ? val : null);
    insertData.location_id = toUUID(insertData.location_id);
    insertData.assigned_to = toUUID(insertData.assigned_to);
    insertData.product_id  = toUUID(insertData.product_id);
    insertData.variant_id  = toUUID(insertData.variant_id);

    // ── Detect which status model this environment actually has ─────────────
    // Prefer the richer status_id model (production) when it exists and a
    // matching named status can be found; otherwise fall back to the plain
    // status text column (staging, or production pieces with no match) —
    // written only if that column itself exists here. Detected via a cheap
    // probe rather than hardcoded per-environment, so this same code runs
    // unmodified everywhere.
    const [statusIdProbe, statusTextProbe] = await Promise.all([
      supabase.from("inventory_pieces").select("status_id").limit(1),
      supabase.from("inventory_pieces").select("status").limit(1),
    ]);
    const hasStatusId   = !statusIdProbe.error;
    const hasStatusText = !statusTextProbe.error;

    if (status && hasStatusId) {
      const { data: matchedStatus } = await supabase
        .from("inventory_statuses")
        .select("id")
        .eq("tenant_id", tenantId)
        .ilike("name", status.replace(/_/g, " "))
        .limit(1)
        .maybeSingle();
      if (matchedStatus?.id) insertData.status_id = matchedStatus.id;
    }
    if (status && hasStatusText) {
      insertData.status = status;
    }

    // Derive SKU prefix from the linked product's category text field —
    // there is no reliable category on the piece itself across both
    // schemas (category_id only exists on production, and the quick-add
    // form doesn't collect a category anyway).
    let categoryName: string | null = null;
    if (insertData.product_id) {
      try {
        const { data: prod } = await supabase
          .from("inventory_products")
          .select("category")
          .eq("id", insertData.product_id)
          .single();
        categoryName = (prod as any)?.category ?? null;
      } catch (prodErr) {
        console.error("[POST /api/inventory/pieces] product category lookup failed:", prodErr);
      }
    }

    const prefix = categoryPrefix(categoryName);
    const sku    = await generateSku(supabase, prefix);
    console.log("[POST /api/inventory/pieces] generated SKU:", sku);

    const { data, error } = await supabase
      .from("inventory_pieces")
      .insert({ ...insertData, sku, tenant_id: tenantId })
      .select(BASE_SELECT)
      .single();

    if (error) {
      console.error("[POST /api/inventory/pieces] insert error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const ctx = await loadResolutionContext(supabase, tenantId, [data as Record<string, unknown>]);
    const piece = { ...data, ...resolvePieceExtras(data as Record<string, unknown>, ctx) };

    return NextResponse.json({ piece });
  } catch (error) {
    console.error("POST /api/inventory/pieces error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unexpected server error" },
      { status: 500 }
    );
  }
}

// GET /api/inventory/pieces/filter-options — category/status dropdown
// options, merging both real schemas. Exported for reuse; also directly
// callable as its own lightweight endpoint (see route below).
export async function buildFilterOptions(
  supabase: Awaited<ReturnType<typeof createTenantSupabaseClient>>,
  tenantId: string
) {
  // category_id/status_id only exist on inventory_pieces on some
  // environments (production, not staging — confirmed 2026-09-23). Only
  // offer the "cat:"/"status:" filter options when the piece table itself
  // could actually be filtered by them — otherwise inventory_categories/
  // inventory_statuses' own real seed rows (which exist on BOTH
  // environments) would produce dropdown options that 500 on staging.
  const [categoryIdProbe, statusIdProbe, categoriesRes, statusesRes, productsRes] = await Promise.all([
    supabase.from("inventory_pieces").select("category_id").limit(1),
    supabase.from("inventory_pieces").select("status_id").limit(1),
    supabase.from("inventory_categories").select("id,name").eq("tenant_id", tenantId).eq("is_active", true),
    supabase.from("inventory_statuses").select("id,name,colour").eq("tenant_id", tenantId).eq("is_active", true),
    supabase.from("inventory_products").select("category").not("category", "is", null),
  ]);
  const hasCategoryId = !categoryIdProbe.error;
  const hasStatusId   = !statusIdProbe.error;

  const categoryOptions = [
    ...(hasCategoryId ? ((categoriesRes.data ?? []) as CategoryRow[]).map(c => ({ value: `cat:${c.id}`, label: c.name })) : []),
    ...Array.from(new Set(((productsRes.data ?? []) as { category: string }[]).map(p => p.category)))
      .map(c => ({ value: `prod:${c}`, label: c })),
  ];

  const statusOptions = [
    ...(hasStatusId ? ((statusesRes.data ?? []) as StatusRow[]).map(s => ({ value: `status:${s.id}`, label: s.name, colour: s.colour })) : []),
    ...FALLBACK_STATUS_OPTIONS.map(s => ({ value: `text:${s.value}`, label: s.label, colour: s.colour })),
  ];

  return { categoryOptions, statusOptions };
}

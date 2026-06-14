import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const JOINED_SELECT = `
  *,
  status:inventory_statuses(id,name,colour),
  location:inventory_locations(id,name,type),
  category:inventory_categories(id,name),
  supplier:inventory_suppliers(id,name)
`.trim();

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
  // Find the highest sequence number for this prefix in the tenant
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

  const next = maxSeq + 1;
  return `${prefix}-${String(next).padStart(4, "0")}`;
}

// GET /api/inventory/pieces
export async function GET(req: NextRequest): Promise<NextResponse> {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  const supabase = await createTenantSupabaseClient(tenantId);

  const { searchParams } = new URL(req.url);
  const search     = searchParams.get("search")      ?? "";
  const categoryId = searchParams.get("category_id") ?? "";
  const statusId   = searchParams.get("status_id")   ?? "";
  const locationId = searchParams.get("location_id") ?? "";
  const page       = Math.max(1, parseInt(searchParams.get("page")     ?? "1",  10));
  const perPage    = Math.min(200, parseInt(searchParams.get("per_page") ?? "50", 10));
  const from       = (page - 1) * perPage;
  const to         = from + perPage - 1;

  let query = supabase
    .from("inventory_pieces")
    .select(JOINED_SELECT, { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (search)      query = query.or(`sku.ilike.%${search}%,title.ilike.%${search}%`);
  if (categoryId)  query = query.eq("category_id", categoryId);
  if (statusId)    query = query.eq("status_id",   statusId);
  if (locationId)  query = query.eq("location_id", locationId);

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(
    { pieces: data ?? [], total: count ?? 0, page, per_page: perPage },
    { headers: { "Cache-Control": "no-store" } }
  );
}

// POST /api/inventory/pieces — create with auto-generated SKU
export async function POST(req: NextRequest): Promise<NextResponse> {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  const supabase = await createTenantSupabaseClient(tenantId);

  const body = await req.json();

  // Strip joined relation keys before insert — SKU is always generated server-side
  const {
    status: _s, location: _l, category: _c, supplier: _sp,
    sku: _ignoredSku,
    ...insertData
  } = body;

  // Look up category name to determine prefix
  let categoryName: string | null = null;
  if (insertData.category_id) {
    const { data: cat } = await supabase
      .from("inventory_categories")
      .select("name")
      .eq("id", insertData.category_id)
      .single();
    categoryName = cat?.name ?? null;
  }

  const prefix = categoryPrefix(categoryName);
  const sku    = await generateSku(supabase, prefix);

  const { data, error } = await supabase
    .from("inventory_pieces")
    .insert({ ...insertData, sku, tenant_id: tenantId })
    .select(JOINED_SELECT)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ piece: data });
}

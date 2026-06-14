import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Category name → SKU prefix (mirrors pieces/route.ts)
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
}

// POST /api/inventory/purchase-orders/[id]/receive
// Body: { line_id: string, specs: { title?, category_id?, metal_type?, ... }, skip?: boolean }
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  const supabase = await createTenantSupabaseClient(tenantId);

  const body = await req.json();
  const { line_id, specs = {}, skip = false } = body;

  if (!line_id) return NextResponse.json({ error: "line_id is required" }, { status: 400 });

  // Mark line received (skip = just mark without creating a piece)
  if (skip) {
    await supabase
      .from("inventory_po_lines")
      .update({ received: true })
      .eq("id", line_id);

    await checkAndUpdatePoStatus(supabase, params.id);
    return NextResponse.json({ skipped: true });
  }

  // Fetch PO for the PO number (used in movement notes)
  const { data: po } = await supabase
    .from("inventory_purchase_orders")
    .select("po_number")
    .eq("id", params.id)
    .single();

  // Resolve category name for SKU generation
  let categoryName: string | null = null;
  if (specs.category_id) {
    const { data: cat } = await supabase
      .from("inventory_categories")
      .select("name")
      .eq("id", specs.category_id)
      .single();
    categoryName = cat?.name ?? null;
  }

  const prefix = categoryPrefix(categoryName);
  const sku    = await generateSku(supabase, prefix);

  // Find "In stock" status for this tenant
  const { data: inStockStatus } = await supabase
    .from("inventory_statuses")
    .select("id")
    .ilike("name", "%in stock%")
    .eq("is_active", true)
    .limit(1)
    .single();

  // Find first active location
  const { data: firstLocation } = await supabase
    .from("inventory_locations")
    .select("id")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .limit(1)
    .single();

  const statusId   = inStockStatus?.id  ?? null;
  const locationId = firstLocation?.id  ?? null;
  const now        = new Date().toISOString();

  // Create the inventory piece
  const { data: piece, error: pieceErr } = await supabase
    .from("inventory_pieces")
    .insert({
      tenant_id:   tenantId,
      sku,
      status_id:   statusId,
      location_id: locationId,
      created_at:  now,
      updated_at:  now,
      ...specs,
    })
    .select("id,sku")
    .single();

  if (pieceErr || !piece) {
    return NextResponse.json({ error: pieceErr?.message ?? "Failed to create piece" }, { status: 500 });
  }

  // Log inventory movement
  await supabase.from("inventory_movements").insert({
    tenant_id:       tenantId,
    piece_id:        piece.id,
    from_location_id: null,
    to_location_id:  locationId,
    from_status_id:  null,
    to_status_id:    statusId,
    moved_by:        null,
    notes:           `Received via PO ${po?.po_number ?? params.id}`,
    moved_at:        now,
  });

  // Mark PO line received
  await supabase
    .from("inventory_po_lines")
    .update({ received: true, piece_id: piece.id })
    .eq("id", line_id);

  await checkAndUpdatePoStatus(supabase, params.id);

  return NextResponse.json({ piece });
}

async function checkAndUpdatePoStatus(
  supabase: Awaited<ReturnType<typeof createTenantSupabaseClient>>,
  poId: string
) {
  const { data: lines } = await supabase
    .from("inventory_po_lines")
    .select("received")
    .eq("po_id", poId);

  if (!lines || lines.length === 0) return;

  const total    = lines.length;
  const received = lines.filter(l => l.received).length;

  let newStatus: string;
  if (received === 0)       newStatus = "ordered";
  else if (received < total) newStatus = "partially_received";
  else                       newStatus = "received";

  await supabase
    .from("inventory_purchase_orders")
    .update({ status: newStatus, updated_at: new Date().toISOString() })
    .eq("id", poId);
}

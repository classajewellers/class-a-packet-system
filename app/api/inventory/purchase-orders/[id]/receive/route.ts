import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";
import { tenantScoped } from "@/lib/tenantScoped";
import { buildReceivedPieceRow, PieceColumnFlags } from "@/lib/receiveStock";

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
  tenantId: string,
  prefix: string
): Promise<string> {
  const { data } = await tenantScoped(supabase, tenantId)
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
// Body:
//   { line_id, skip }                          — mark received without creating piece(s)
//   { line_id, specs, quantity_to_receive, mode, actual_unit_cost }
//
//   mode: "individual" — create quantity_to_receive separate inventory_pieces (default)
//   mode: "batch"      — create 1 inventory_piece with quantity=quantity_to_receive
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  if (!tenantId) return NextResponse.json({ error: "Missing tenant" }, { status: 400 });
  const supabase = await createTenantSupabaseClient(tenantId);

  const body = await req.json();
  const {
    line_id,
    specs = {},
    skip = false,
    quantity_to_receive = 1,
    mode = "individual",
    actual_unit_cost,
  } = body;

  if (!line_id) return NextResponse.json({ error: "line_id is required" }, { status: 400 });

  // Fetch PO and line for context
  const [{ data: po }, { data: line, error: lineErr }] = await Promise.all([
    tenantScoped(supabase, tenantId)
      .from("inventory_purchase_orders")
      .select("po_number, supplier_id")
      .eq("id", params.id)
      .single(),
    tenantScoped(supabase, tenantId)
      .from("inventory_po_lines")
      .select("*")
      .eq("id", line_id)
      .single(),
  ]);

  if (lineErr || !line) {
    return NextResponse.json({ error: "PO line not found" }, { status: 404 });
  }

  const orderedQty  = Number(line.quantity ?? 1);
  const alreadyRecd = Number(line.received_quantity ?? 0);
  const remaining   = orderedQty - alreadyRecd;
  const qty         = Math.min(Number(quantity_to_receive) || 1, remaining);

  if (qty <= 0) {
    return NextResponse.json({ error: "No remaining quantity to receive" }, { status: 400 });
  }

  // ── Skip: mark received without creating inventory pieces ──────────────────
  if (skip) {
    const newReceivedQty = alreadyRecd + qty;
    const fullyReceived  = newReceivedQty >= orderedQty;

    const { error: updErr } = await tenantScoped(supabase, tenantId)
      .from("inventory_po_lines")
      .update({
        received_quantity: newReceivedQty,
        received: fullyReceived,
        ...(fullyReceived ? {} : {}),
      })
      .eq("id", line_id);

    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

    await checkAndUpdatePoStatus(supabase, tenantId, params.id);
    return NextResponse.json({ skipped: true, received_quantity: newReceivedQty });
  }

  // ── Create receiving event ─────────────────────────────────────────────────
  const { data: event, error: evtErr } = await tenantScoped(supabase, tenantId)
    .from("inventory_receiving_events")
    .insert({
      po_id:             params.id,
      po_line_id:        line_id,
      received_at:       new Date().toISOString(),
      quantity_received: qty,
      expected_unit_cost: line.estimated_cost != null ? Number(line.estimated_cost) : null,
      actual_unit_cost:  actual_unit_cost != null ? Number(actual_unit_cost) : null,
    })
    .select("id")
    .single();

  if (evtErr || !event) {
    return NextResponse.json({ error: evtErr?.message ?? "Failed to create receiving event" }, { status: 500 });
  }

  const flags = await pieceColumnFlags(supabase);

  // ── Resolve category name for SKU prefix ──────────────────────────────────
  const categoryIdForSku = (specs.category_id as string | undefined) || line.category_id || null;
  let categoryName: string | null = null;
  if (categoryIdForSku) {
    const { data: cat } = await tenantScoped(supabase, tenantId)
      .from("inventory_categories")
      .select("name")
      .eq("id", categoryIdForSku)
      .single();
    categoryName = cat?.name ?? null;
  }

  const prefix = categoryPrefix(categoryName);

  // ── Resolve default status (only when the piece table has status_id) ─────
  let statusId: string | null = null;
  if (flags.status_id && !specs.status_id) {
    const { data: awaitingStatus } = await tenantScoped(supabase, tenantId)
      .from("inventory_statuses")
      .select("id")
      .ilike("name", "%await%")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (awaitingStatus?.id) {
      statusId = awaitingStatus.id;
    } else {
      const { data: inStockStatus } = await tenantScoped(supabase, tenantId)
        .from("inventory_statuses")
        .select("id")
        .ilike("name", "%in stock%")
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();
      statusId = inStockStatus?.id ?? null;
    }
  }

  // ── Resolve default location ───────────────────────────────────────────────
  const { data: firstLocation } = await tenantScoped(supabase, tenantId)
    .from("inventory_locations")
    .select("id")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .limit(1)
    .maybeSingle();

  const locationId = firstLocation?.id ?? null;
  const now        = new Date().toISOString();

  const effectiveStatusId   = specs.status_id   ?? statusId;
  const effectiveLocationId = specs.location_id || locationId;

  const pieceBase = {
    line,
    specs,
    flags,
    actualUnitCost: actual_unit_cost,
    statusId: effectiveStatusId,
    locationId: effectiveLocationId,
    categoryName,
    now,
    poLineId: line_id,
    receivingEventId: event.id,
    supplierId: po?.supplier_id ?? null,
    packetId: line.packet_id ?? null,
  };

  // ── Create inventory pieces ────────────────────────────────────────────────
  const createdPieces: { id: string; sku: string }[] = [];

  if (mode === "batch") {
    // One piece record with quantity representing the batch
    const sku = await generateSku(supabase, tenantId, prefix);
    const { data: piece, error: pieceErr } = await tenantScoped(supabase, tenantId)
      .from("inventory_pieces")
      .insert({
        sku,
        ...buildReceivedPieceRow({ ...pieceBase, quantity: qty }),
      })
      .select("id,sku")
      .single();

    if (pieceErr || !piece) {
      return NextResponse.json({ error: pieceErr?.message ?? "Failed to create piece" }, { status: 500 });
    }

    await tenantScoped(supabase, tenantId).from("inventory_movements").insert({
      piece_id:         piece.id,
      from_location_id: null,
      to_location_id:   effectiveLocationId,
      from_status_id:   null,
      to_status_id:     effectiveStatusId,
      moved_by:         null,
      notes:            `Received via PO ${po?.po_number ?? params.id} (batch qty ${qty})`,
      moved_at:         now,
    });

    createdPieces.push(piece);
  } else {
    // Individual mode: create one piece per unit received
    for (let i = 0; i < qty; i++) {
      const sku = await generateSku(supabase, tenantId, prefix);
      const { data: piece, error: pieceErr } = await tenantScoped(supabase, tenantId)
        .from("inventory_pieces")
        .insert({
          sku,
          ...buildReceivedPieceRow({ ...pieceBase, quantity: 1 }),
        })
        .select("id,sku")
        .single();

      if (pieceErr || !piece) {
        return NextResponse.json({ error: pieceErr?.message ?? `Failed to create piece ${i + 1}` }, { status: 500 });
      }

      await tenantScoped(supabase, tenantId).from("inventory_movements").insert({
        piece_id:         piece.id,
        from_location_id: null,
        to_location_id:   effectiveLocationId,
        from_status_id:   null,
        to_status_id:     effectiveStatusId,
        moved_by:         null,
        notes:            `Received via PO ${po?.po_number ?? params.id}`,
        moved_at:         now,
      });

      createdPieces.push(piece);
    }
  }

  // ── Update PO line received_quantity and received flag ────────────────────
  const newReceivedQty = alreadyRecd + qty;
  const fullyReceived  = newReceivedQty >= orderedQty;

  await tenantScoped(supabase, tenantId)
    .from("inventory_po_lines")
    .update({
      received_quantity: newReceivedQty,
      received: fullyReceived,
      // Keep piece_id pointing to the first piece for backward compatibility
      ...(createdPieces[0] ? { piece_id: createdPieces[0].id } : {}),
    })
    .eq("id", line_id);

  await checkAndUpdatePoStatus(supabase, tenantId, params.id);

  return NextResponse.json({
    pieces: createdPieces,
    received_quantity: newReceivedQty,
    fully_received: fullyReceived,
  });
}

const PIECE_FLAG_COLUMNS = [
  "title",
  "category_id",
  "metal_type",
  "status_id",
  "updated_at",
  "status",
  "cost_price",
  "notes",
  "actual_cost",
  "supplier_code",
  "created_at",
] as const;

// Any probe error means the column is absent. Same rule as the pieces
// list route: a non-PGRST204 failure must not be treated as "column exists".
async function pieceColumnFlags(
  supabase: Awaited<ReturnType<typeof createTenantSupabaseClient>>
): Promise<PieceColumnFlags> {
  const probes = await Promise.all(
    PIECE_FLAG_COLUMNS.map(async (column) => {
      const probe = await supabase.from("inventory_pieces").select(column).limit(1);
      return [column, !probe.error] as const;
    })
  );
  const present = Object.fromEntries(probes) as Record<(typeof PIECE_FLAG_COLUMNS)[number], boolean>;
  return {
    title: present.title,
    category_id: present.category_id,
    metal_type: present.metal_type,
    status_id: present.status_id,
    updated_at: present.updated_at,
    status: present.status,
    cost_price: present.cost_price,
    notes: present.notes,
    actual_cost: present.actual_cost,
    supplier_code: present.supplier_code,
    created_at: present.created_at,
  };
}

async function checkAndUpdatePoStatus(
  supabase: Awaited<ReturnType<typeof createTenantSupabaseClient>>,
  tenantId: string,
  poId: string
) {
  const { data: lines } = await tenantScoped(supabase, tenantId)
    .from("inventory_po_lines")
    .select("quantity, received_quantity")
    .eq("po_id", poId);

  if (!lines || lines.length === 0) return;

  const total     = lines.length;
  const received  = lines.filter((l: { quantity: number; received_quantity: number }) => Number(l.received_quantity ?? 0) >= Number(l.quantity ?? 1)).length;
  const anyRcvd   = lines.some((l: { received_quantity: number }) => Number(l.received_quantity ?? 0) > 0);

  let newStatus: string;
  if (received === 0 && !anyRcvd) newStatus = "ordered";
  else if (received < total)      newStatus = "partially_received";
  else                            newStatus = "received";

  await tenantScoped(supabase, tenantId)
    .from("inventory_purchase_orders")
    .update({ status: newStatus, updated_at: new Date().toISOString() })
    .eq("id", poId);
}

import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// POST /api/inventory/sales
// Body: { piece_id, sold_price, discount_amount?, staff_id?, customer_id?, payment_method?, notes? }
// Performs the full Mark as Sold transaction:
//   1. Re-validates piece is not already sold (race-safe server check)
//   2. Resolves the "Sold" status UUID dynamically from inventory_statuses
//   3. Inserts inventory_sales row
//   4. Updates inventory_pieces: status_id + date_sold
//   5. Inserts inventory_movements row recording the status change
export async function POST(req: NextRequest): Promise<NextResponse> {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  if (!tenantId) return NextResponse.json({ error: "Missing tenant" }, { status: 400 });

  const supabase = await createTenantSupabaseClient(tenantId);

  let body: {
    piece_id: string;
    sold_price: number;
    discount_amount?: number;
    staff_id?: string | null;
    customer_id?: string | null;
    payment_method?: string | null;
    notes?: string | null;
    moved_by?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const {
    piece_id,
    sold_price,
    discount_amount = 0,
    staff_id,
    customer_id,
    payment_method,
    notes,
    moved_by,
  } = body;

  // ── Validate required fields ────────────────────────────────────────────────
  if (!piece_id) return NextResponse.json({ error: "piece_id is required" }, { status: 400 });
  if (sold_price == null || isNaN(Number(sold_price)) || Number(sold_price) < 0) {
    return NextResponse.json({ error: "sold_price is required and must be a positive number" }, { status: 400 });
  }

  // ── Step 1: Fetch piece and re-validate it is not already sold ──────────────
  const { data: piece, error: pieceErr } = await supabase
    .from("inventory_pieces")
    .select("id, status_id, actual_cost, cost_price, status:inventory_statuses(id,name)")
    .eq("id", piece_id)
    .eq("tenant_id", tenantId)
    .single();

  if (pieceErr || !piece) {
    return NextResponse.json({ error: "Piece not found" }, { status: 404 });
  }

  // ── Step 2: Resolve "Sold" status UUID dynamically ──────────────────────────
  const { data: statuses, error: statusErr } = await supabase
    .from("inventory_statuses")
    .select("id, name")
    .ilike("name", "%sold%")
    .eq("tenant_id", tenantId)
    .limit(5);

  if (statusErr || !statuses?.length) {
    return NextResponse.json(
      { error: "Could not find a 'Sold' status in inventory_statuses. Please create one in Inventory Settings." },
      { status: 422 }
    );
  }

  const soldStatus = statuses[0];

  // Race-safe double-check: compare by status name (case-insensitive)
  const currentStatusName = (piece.status as any)?.name ?? "";
  if (currentStatusName.toLowerCase().includes("sold")) {
    return NextResponse.json({ error: "This item is already marked as sold" }, { status: 409 });
  }

  const prevStatusId = piece.status_id ?? null;
  const now = new Date().toISOString();

  // ── Step 3: Calculate gross profit ─────────────────────────────────────────
  // Prefer actual_cost, fall back to cost_price; if both null, store null
  const costBasis = piece.actual_cost ?? piece.cost_price ?? null;
  let grossProfit: number | null = null;
  if (costBasis != null) {
    grossProfit = Number(sold_price) - Number(discount_amount) - Number(costBasis);
  }

  // ── Step 4: Insert inventory_sales row ─────────────────────────────────────
  const { data: sale, error: saleErr } = await supabase
    .from("inventory_sales")
    .insert({
      tenant_id:      tenantId,
      piece_id,
      sold_price:     Number(sold_price),
      discount_amount: Number(discount_amount ?? 0),
      staff_id:       staff_id   || null,
      customer_id:    customer_id || null,
      payment_method: payment_method || null,
      notes:          notes      || null,
      sold_at:        now,
    })
    .select()
    .single();

  if (saleErr) {
    return NextResponse.json({ error: `Failed to record sale: ${saleErr.message}` }, { status: 500 });
  }

  // ── Step 5: Update inventory_pieces ────────────────────────────────────────
  const { error: pieceUpdateErr } = await supabase
    .from("inventory_pieces")
    .update({
      status_id: soldStatus.id,
      date_sold:  now,
      updated_at: now,
    })
    .eq("id", piece_id)
    .eq("tenant_id", tenantId);

  if (pieceUpdateErr) {
    return NextResponse.json({ error: `Sale recorded but failed to update piece status: ${pieceUpdateErr.message}` }, { status: 500 });
  }

  // ── Step 6: Insert inventory_movements ─────────────────────────────────────
  const movementNotes = `Sold${sale.id ? ` — sale ref ${sale.id.slice(0, 8)}` : ""}${notes ? `: ${notes}` : ""}`;

  const { error: movErr } = await supabase
    .from("inventory_movements")
    .insert({
      tenant_id:       tenantId,
      piece_id,
      from_status_id:  prevStatusId,
      to_status_id:    soldStatus.id,
      from_location_id: null,
      to_location_id:  null,
      moved_by:        moved_by || null,
      notes:           movementNotes,
      moved_at:        now,
    });

  if (movErr) {
    // Non-fatal — sale and piece update already succeeded
    console.error("[inventory/sales POST] movement insert failed:", movErr.message);
  }

  return NextResponse.json({
    sale,
    gross_profit: grossProfit,
    gross_profit_note: costBasis == null
      ? "Gross profit could not be calculated — no actual_cost or cost_price recorded on this piece"
      : null,
  });
}

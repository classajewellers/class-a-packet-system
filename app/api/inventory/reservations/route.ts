import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";
import { tenantScoped } from "@/lib/tenantScoped";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET /api/inventory/reservations?piece_id=X
// Returns all reservations for a piece (active first, then historical).
export async function GET(req: NextRequest): Promise<NextResponse> {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  if (!tenantId) return NextResponse.json({ reservations: [] }, { status: 400 });

  const supabase = await createTenantSupabaseClient(tenantId);
  const pieceId = new URL(req.url).searchParams.get("piece_id") ?? "";
  if (!pieceId) return NextResponse.json({ reservations: [] }, { status: 400 });

  const { data, error } = await supabase
    .from("inventory_reservations")
    .select(`
      *,
      customer:customers(id, first_name, last_name, email),
      created_by_profile:profiles!created_by(id, full_name),
      previous_status:inventory_statuses!previous_status_id(id, name, colour)
    `)
    .eq("piece_id", pieceId)
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ reservations: data ?? [] });
}

// POST /api/inventory/reservations
// Body: { piece_id, customer_id?, reason?, quote_reference?, order_reference?,
//         workshop_packet_id?, expires_at?, created_by? }
// Creates a reservation, updates piece status to Reserved, inserts movement row.
export async function POST(req: NextRequest): Promise<NextResponse> {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  if (!tenantId) return NextResponse.json({ error: "Missing tenant" }, { status: 400 });

  const supabase = await createTenantSupabaseClient(tenantId);

  let body: {
    piece_id: string;
    customer_id?: string | null;
    reason?: string | null;
    quote_reference?: string | null;
    order_reference?: string | null;
    workshop_packet_id?: string | null;
    expires_at?: string | null;
    created_by?: string | null;
    moved_by?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const {
    piece_id,
    customer_id,
    reason,
    quote_reference,
    order_reference,
    workshop_packet_id,
    expires_at,
    created_by,
    moved_by,
  } = body;

  if (!piece_id) return NextResponse.json({ error: "piece_id is required" }, { status: 400 });

  // ── Fetch piece + current status ────────────────────────────────────────────
  // inventory_pieces.status is a plain text column (in_stock/on_order/sold/
  // workshop/consignment/repair/reserved — migration 030 + 157), NOT a
  // status_id FK to inventory_statuses — that column does not exist on this
  // table (confirmed live 2026-09-23).
  const { data: piece, error: pieceErr } = await supabase
    .from("inventory_pieces")
    .select("id, status")
    .eq("id", piece_id)
    .eq("tenant_id", tenantId)
    .single();

  if (pieceErr || !piece) return NextResponse.json({ error: "Piece not found" }, { status: 404 });

  if (piece.status === "sold") {
    return NextResponse.json({ error: "This item has already been sold and cannot be reserved" }, { status: 409 });
  }
  if (piece.status === "reserved") {
    return NextResponse.json({ error: "This item is already reserved" }, { status: 409 });
  }

  // ── Check for existing active reservation ───────────────────────────────────
  const { data: existing, error: existErr } = await tenantScoped(supabase, tenantId)
    .from("inventory_reservations")
    .select("id, customer_id, customer:customers(first_name, last_name)")
    .eq("piece_id", piece_id)
    .eq("status", "active")
    .maybeSingle();

  if (existErr) return NextResponse.json({ error: existErr.message }, { status: 500 });
  if (existing) {
    const name = existing.customer
      ? `${(existing.customer as any).first_name ?? ""} ${(existing.customer as any).last_name ?? ""}`.trim()
      : "unknown customer";
    return NextResponse.json(
      { error: `This item already has an active reservation${name ? ` for ${name}` : ""}` },
      { status: 409 }
    );
  }

  const previousStatus = piece.status;
  const now = new Date().toISOString();

  // ── Insert reservation row ──────────────────────────────────────────────────
  const { data: reservation, error: resErr } = await supabase
    .from("inventory_reservations")
    .insert({
      tenant_id:          tenantId,
      piece_id,
      customer_id:        customer_id || null,
      reason:             reason      || null,
      quote_reference:    quote_reference || null,
      order_reference:    order_reference || null,
      workshop_packet_id: workshop_packet_id || null,
      expires_at:         expires_at  || null,
      created_by:         created_by  || null,
      previous_piece_status: previousStatus,
      status:             "active",
    })
    .select()
    .single();

  if (resErr) {
    // Partial unique index violation (race condition) surfaces here
    if (resErr.code === "23505") {
      return NextResponse.json({ error: "This item was just reserved by another user — try again" }, { status: 409 });
    }
    return NextResponse.json({ error: resErr.message }, { status: 500 });
  }

  // ── Update piece status ─────────────────────────────────────────────────────
  const { error: pieceUpdateErr } = await supabase
    .from("inventory_pieces")
    .update({ status: "reserved" })
    .eq("id", piece_id)
    .eq("tenant_id", tenantId);

  if (pieceUpdateErr) {
    return NextResponse.json({ error: `Reservation created but failed to update piece status: ${pieceUpdateErr.message}` }, { status: 500 });
  }

  // ── Insert movement row ──────────────────────────────────────────────────────
  // from_status_id/to_status_id are FKs into inventory_statuses, a separate
  // (largely unused) status model from inventory_pieces.status text — left
  // null here since there is no reliable mapping between the two; the
  // human-readable transition is captured in notes instead.
  const movNotes = `Reserved (${previousStatus} → reserved)${reservation.id ? ` — ref ${reservation.id.slice(0, 8)}` : ""}${reason ? `: ${reason}` : ""}`;
  await supabase.from("inventory_movements").insert({
    tenant_id:        tenantId,
    piece_id,
    from_status_id:   null,
    to_status_id:     null,
    from_location_id: null,
    to_location_id:   null,
    moved_by:         moved_by || null,
    notes:            movNotes,
    moved_at:         now,
  });

  return NextResponse.json({ reservation });
}

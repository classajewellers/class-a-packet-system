import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// PATCH /api/inventory/reservations/[id]/release
// Body: { release_reason? }
// Releases an active reservation, reverts piece status to previous_status_id,
// inserts an inventory_movements row.
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  if (!tenantId) return NextResponse.json({ error: "Missing tenant" }, { status: 400 });

  const supabase = await createTenantSupabaseClient(tenantId);

  let body: { release_reason?: string | null; moved_by?: string | null } = {};
  try { body = await req.json(); } catch { /* empty body is fine */ }

  const { release_reason, moved_by } = body;

  // ── Fetch the reservation ───────────────────────────────────────────────────
  const { data: reservation, error: resErr } = await supabase
    .from("inventory_reservations")
    .select("id, piece_id, status, previous_status_id, customer_id")
    .eq("id", params.id)
    .eq("tenant_id", tenantId)
    .single();

  if (resErr || !reservation) {
    return NextResponse.json({ error: "Reservation not found" }, { status: 404 });
  }
  if (reservation.status !== "active") {
    return NextResponse.json({ error: `Reservation is already ${reservation.status}` }, { status: 409 });
  }

  const now = new Date().toISOString();

  // ── Fetch current piece status (for the movement from_status_id) ────────────
  const { data: piece } = await supabase
    .from("inventory_pieces")
    .select("status_id")
    .eq("id", reservation.piece_id)
    .single();

  const currentStatusId = piece?.status_id ?? null;

  // ── Update reservation to released ─────────────────────────────────────────
  const { data: updated, error: updateErr } = await supabase
    .from("inventory_reservations")
    .update({
      status:         "released",
      released_at:    now,
      release_reason: release_reason || null,
    })
    .eq("id", params.id)
    .eq("tenant_id", tenantId)
    .select()
    .single();

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  // ── Revert piece status to previous_status_id ───────────────────────────────
  if (reservation.previous_status_id) {
    const { error: pieceErr } = await supabase
      .from("inventory_pieces")
      .update({ status_id: reservation.previous_status_id, updated_at: now })
      .eq("id", reservation.piece_id)
      .eq("tenant_id", tenantId);

    if (pieceErr) {
      console.error("[reservations/release] piece status revert failed:", pieceErr.message);
    }
  }

  // ── Insert movement row ─────────────────────────────────────────────────────
  const movNotes = `Reservation released${release_reason ? `: ${release_reason}` : ""}`;
  await supabase.from("inventory_movements").insert({
    tenant_id:        tenantId,
    piece_id:         reservation.piece_id,
    from_status_id:   currentStatusId,
    to_status_id:     reservation.previous_status_id ?? null,
    from_location_id: null,
    to_location_id:   null,
    moved_by:         moved_by || null,
    notes:            movNotes,
    moved_at:         now,
  });

  return NextResponse.json({ reservation: updated });
}

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
  // previous_piece_status (text) is the real revert target — see migration
  // 157. previous_status_id (uuid, references inventory_statuses) is legacy/
  // unused for this purpose: inventory_pieces.status is a plain text column,
  // not an inventory_statuses row.
  const { data: reservation, error: resErr } = await supabase
    .from("inventory_reservations")
    .select("id, piece_id, status, previous_piece_status, customer_id")
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
  const revertStatus = reservation.previous_piece_status || "in_stock";

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

  // ── Revert piece status ──────────────────────────────────────────────────────
  const { error: pieceErr } = await supabase
    .from("inventory_pieces")
    .update({ status: revertStatus })
    .eq("id", reservation.piece_id)
    .eq("tenant_id", tenantId);

  if (pieceErr) {
    console.error("[reservations/release] piece status revert failed:", pieceErr.message);
  }

  // ── Insert movement row ──────────────────────────────────────────────────────
  const movNotes = `Reservation released (reserved → ${revertStatus})${release_reason ? `: ${release_reason}` : ""}`;
  await supabase.from("inventory_movements").insert({
    tenant_id:        tenantId,
    piece_id:         reservation.piece_id,
    from_status_id:   null,
    to_status_id:     null,
    from_location_id: null,
    to_location_id:   null,
    moved_by:         moved_by || null,
    notes:            movNotes,
    moved_at:         now,
  });

  return NextResponse.json({ reservation: updated });
}

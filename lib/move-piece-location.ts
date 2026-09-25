/**
 * Location-only move used by stocktake "Move here" and scan-to-move.
 *
 * Same write as the piece page Move (POST /api/inventory/movements):
 * an inventory_movements row (piece_id, from_location_id, to_location_id,
 * moved_by, notes, moved_at) plus inventory_pieces.location_id.
 *
 * Status is not touched. Staging pieces have no status_id and no updated_at,
 * and the piece-page route selects those columns, so this path does not call it.
 * from_status_id / to_status_id stay null.
 */
import { SupabaseClient } from "@supabase/supabase-js";
import { tenantScoped } from "@/lib/tenantScoped";

export type MovePieceResult =
  | {
      ok: true;
      action: "moved" | "already";
      pieceId: string;
      sku: string | null;
      fromLocationId: string | null;
      fromLocationName: string | null;
    }
  | { ok: false; status: number; error: string };

async function locationName(
  supabase: SupabaseClient,
  tenantId: string,
  locationId: string | null,
): Promise<string | null> {
  if (!locationId) return null;
  const { data } = await tenantScoped(supabase, tenantId)
    .from("inventory_locations")
    .select("id, name")
    .eq("id", locationId)
    .maybeSingle();
  const name = typeof data?.name === "string" ? data.name.trim() : "";
  return name || null;
}

export async function movePieceToLocation(
  supabase: SupabaseClient,
  tenantId: string,
  input: { pieceId: string; toLocationId: string; movedBy: string; notes: string },
): Promise<MovePieceResult> {
  const { data: destination, error: destErr } = await tenantScoped(supabase, tenantId)
    .from("inventory_locations")
    .select("id, name")
    .eq("id", input.toLocationId)
    .maybeSingle();
  if (destErr) return { ok: false, status: 500, error: destErr.message };
  if (!destination) return { ok: false, status: 404, error: "Location not found" };

  const { data: piece, error: pieceErr } = await tenantScoped(supabase, tenantId)
    .from("inventory_pieces")
    .select("id, sku, location_id")
    .eq("id", input.pieceId)
    .maybeSingle();
  if (pieceErr) return { ok: false, status: 500, error: pieceErr.message };
  if (!piece) return { ok: false, status: 404, error: "Piece not found" };

  const fromLocationId = typeof piece.location_id === "string" ? piece.location_id : null;
  const sku = typeof piece.sku === "string" ? piece.sku : null;
  const fromLocationName = await locationName(supabase, tenantId, fromLocationId);

  if (fromLocationId === input.toLocationId) {
    return { ok: true, action: "already", pieceId: input.pieceId, sku, fromLocationId, fromLocationName };
  }

  const { error: movErr } = await tenantScoped(supabase, tenantId)
    .from("inventory_movements")
    .insert({
      piece_id: input.pieceId,
      from_location_id: fromLocationId,
      to_location_id: input.toLocationId,
      moved_by: input.movedBy,
      notes: input.notes,
      moved_at: new Date().toISOString(),
    });
  if (movErr) return { ok: false, status: 500, error: movErr.message };

  const { error: updateErr } = await tenantScoped(supabase, tenantId)
    .from("inventory_pieces")
    .update({ location_id: input.toLocationId })
    .eq("id", input.pieceId);
  if (updateErr) return { ok: false, status: 500, error: updateErr.message };

  return { ok: true, action: "moved", pieceId: input.pieceId, sku, fromLocationId, fromLocationName };
}

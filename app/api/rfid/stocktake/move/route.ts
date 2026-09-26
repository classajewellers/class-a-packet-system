import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/require-auth";
import { createTenantSupabaseClient } from "@/lib/supabase-server";
import { movePieceToLocation } from "@/lib/move-piece-location";
import { missingEpcGroup } from "@/lib/rfid-scan";
import { STOCKTAKE_SETUP_MESSAGE } from "@/lib/rfid-stocktake";
import { markLineMovedHere, normaliseCodes, resolveScanCodes } from "@/lib/rfid-stocktake-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * POST /api/rfid/stocktake/move
 * { to_location_id, piece_id?, stocktake_id?, epcs?, skus? }
 * Moves resolved pieces onto the destination and writes inventory_movements.
 * Pieces already at that location are skipped. Piece status is not changed.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;
  const body = await req.json().catch(() => null);
  const toLocationId = typeof body?.to_location_id === "string" ? body.to_location_id : "";
  if (!toLocationId) return NextResponse.json({ error: "to_location_id is required" }, { status: 400 });

  const supabase = await createTenantSupabaseClient(auth.ctx.tenantId);
  const tenantId = auth.ctx.tenantId;
  const userId = auth.ctx.userId;
  const notes = typeof body?.stocktake_id === "string"
    ? "Stocktake — moved to count location"
    : "Scan to move";

  if (typeof body?.piece_id === "string" && body.piece_id) {
    const moved = await movePieceToLocation(supabase, tenantId, {
      pieceId: body.piece_id,
      toLocationId,
      movedBy: userId,
      notes,
    });
    if (!moved.ok) return NextResponse.json({ error: moved.error }, { status: moved.status });
    if (typeof body.stocktake_id === "string" && body.stocktake_id && (moved.action === "moved" || moved.action === "already")) {
      const marked = await markLineMovedHere(supabase, tenantId, body.stocktake_id, body.piece_id);
      if (!marked.ok) {
        return NextResponse.json(
          { error: marked.schema ? STOCKTAKE_SETUP_MESSAGE : marked.error },
          { status: marked.status },
        );
      }
    }
    return NextResponse.json({
      results: [{
        key: `piece:${moved.pieceId}`,
        action: moved.action,
        piece_id: moved.pieceId,
        sku: moved.sku,
        epc: null,
        from_location_name: moved.fromLocationName,
      }],
    });
  }

  const codes = normaliseCodes(body?.epcs, body?.skus);
  if ("error" in codes) return NextResponse.json({ error: codes.error }, { status: 400 });

  let resolved: Awaited<ReturnType<typeof resolveScanCodes>>;
  try {
    resolved = await resolveScanCodes(supabase, tenantId, userId, codes.epcs, codes.skus);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Lookup failed" }, { status: 500 });
  }

  const results: Array<{
    key: string;
    action: "moved" | "already" | "unknown" | "blank";
    piece_id: string | null;
    sku: string | null;
    epc: string | null;
    from_location_name: string | null;
  }> = [];
  const seenPieces = new Set<string>();

  async function takePiece(pieceId: string, epc: string | null): Promise<string | null> {
    if (seenPieces.has(pieceId)) return null;
    seenPieces.add(pieceId);
    const moved = await movePieceToLocation(supabase, tenantId, {
      pieceId,
      toLocationId,
      movedBy: userId,
      notes,
    });
    if (!moved.ok) return moved.error;
    results.push({
      key: epc ? `epc:${epc}` : `piece:${pieceId}`,
      action: moved.action,
      piece_id: moved.pieceId,
      sku: moved.sku,
      epc,
      from_location_name: moved.fromLocationName,
    });
    return null;
  }

  for (const hit of resolved.epcs) {
    if (!hit.piece) {
      results.push({
        key: `epc:${hit.epc}`,
        action: missingEpcGroup(hit.epc) === "blank" ? "blank" : "unknown",
        piece_id: null,
        sku: null,
        epc: hit.epc,
        from_location_name: null,
      });
      continue;
    }
    const moveError = await takePiece(hit.piece.id, hit.epc);
    if (moveError) return NextResponse.json({ error: moveError }, { status: 500 });
  }
  for (const hit of resolved.skus) {
    if (!hit.piece) continue;
    const moveError = await takePiece(hit.piece.id, null);
    if (moveError) return NextResponse.json({ error: moveError }, { status: 500 });
  }

  return NextResponse.json({ results });
}

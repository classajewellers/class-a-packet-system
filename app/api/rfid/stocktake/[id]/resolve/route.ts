import { NextRequest, NextResponse } from "next/server";
import { requireManager } from "@/lib/require-auth";
import { createTenantSupabaseClient } from "@/lib/supabase-server";
import { STOCKTAKE_SETUP_MESSAGE } from "@/lib/rfid-stocktake";
import { resolveExpectedPiece } from "@/lib/rfid-stocktake-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Manager follow-up. Never changes piece status. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }): Promise<NextResponse> {
  const auth = await requireManager(req);
  if (!auth.ok) return auth.response;
  const body = await req.json().catch(() => null);
  const pieceId = typeof body?.piece_id === "string" ? body.piece_id : "";
  const resolution = body?.resolution === "found" || body?.resolution === "still_missing" ? body.resolution : null;
  const locationId = typeof body?.location_id === "string" && body.location_id ? body.location_id : null;
  if (!pieceId || !resolution) {
    return NextResponse.json({ error: "piece_id and resolution are required" }, { status: 400 });
  }
  const supabase = await createTenantSupabaseClient(auth.ctx.tenantId);
  const result = await resolveExpectedPiece(
    supabase,
    auth.ctx.tenantId,
    auth.ctx.userId,
    params.id,
    pieceId,
    resolution,
    locationId,
  );
  if (!result.ok) {
    return NextResponse.json(
      { error: result.schema ? STOCKTAKE_SETUP_MESSAGE : result.error },
      { status: result.status },
    );
  }
  return NextResponse.json({ ok: true });
}

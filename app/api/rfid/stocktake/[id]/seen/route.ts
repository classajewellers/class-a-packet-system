import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/require-auth";
import { createTenantSupabaseClient } from "@/lib/supabase-server";
import { STOCKTAKE_SETUP_MESSAGE } from "@/lib/rfid-stocktake";
import { setExpectedSeen } from "@/lib/rfid-stocktake-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Any signed-in staff can mark an untagged piece seen. Does not change the piece. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }): Promise<NextResponse> {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;
  const body = await req.json().catch(() => null);
  const pieceId = typeof body?.piece_id === "string" ? body.piece_id : "";
  if (!pieceId) return NextResponse.json({ error: "piece_id is required" }, { status: 400 });
  const supabase = await createTenantSupabaseClient(auth.ctx.tenantId);
  const result = await setExpectedSeen(
    supabase,
    auth.ctx.tenantId,
    auth.ctx.userId,
    params.id,
    pieceId,
    body?.seen !== false,
  );
  if (!result.ok) {
    return NextResponse.json(
      { error: result.schema ? STOCKTAKE_SETUP_MESSAGE : result.error },
      { status: result.status },
    );
  }
  return NextResponse.json({ pieceId: result.pieceId, seenAt: result.seenAt, seenByName: result.seenByName });
}

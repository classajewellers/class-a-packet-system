import { NextRequest, NextResponse } from "next/server";
import { requireManager } from "@/lib/require-auth";
import { createTenantSupabaseClient } from "@/lib/supabase-server";
import { STOCKTAKE_SETUP_MESSAGE } from "@/lib/rfid-stocktake";
import { finishStocktake } from "@/lib/rfid-stocktake-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Manager or admin only. Stores the live missing list on the session. Does not change piece status. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }): Promise<NextResponse> {
  const auth = await requireManager(req);
  if (!auth.ok) return auth.response;
  const supabase = await createTenantSupabaseClient(auth.ctx.tenantId);
  const result = await finishStocktake(supabase, auth.ctx.tenantId, auth.ctx.userId, params.id);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.schema ? STOCKTAKE_SETUP_MESSAGE : result.error },
      { status: result.status },
    );
  }
  return NextResponse.json(result.payload);
}

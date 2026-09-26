import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/require-auth";
import { createTenantSupabaseClient } from "@/lib/supabase-server";
import { STOCKTAKE_SETUP_MESSAGE } from "@/lib/rfid-stocktake";
import { getZoneDetail } from "@/lib/rfid-stocktake-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest, { params }: { params: { id: string } }): Promise<NextResponse> {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;
  const supabase = await createTenantSupabaseClient(auth.ctx.tenantId);
  const result = await getZoneDetail(supabase, auth.ctx.tenantId, params.id);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.schema ? STOCKTAKE_SETUP_MESSAGE : result.error },
      { status: result.status },
    );
  }
  return NextResponse.json(result.detail);
}

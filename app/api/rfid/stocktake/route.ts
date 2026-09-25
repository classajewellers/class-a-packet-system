import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/require-auth";
import { createTenantSupabaseClient } from "@/lib/supabase-server";
import { STOCKTAKE_SETUP_MESSAGE } from "@/lib/rfid-stocktake";
import { createStocktake, listStocktakes } from "@/lib/rfid-stocktake-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function fail(result: { status: number; error: string; schema?: boolean }) {
  return NextResponse.json(
    { error: result.schema ? STOCKTAKE_SETUP_MESSAGE : result.error },
    { status: result.status },
  );
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;
  const supabase = await createTenantSupabaseClient(auth.ctx.tenantId);
  const result = await listStocktakes(supabase, auth.ctx.tenantId);
  if (!result.ok) return fail(result);
  return NextResponse.json({ stocktakes: result.stocktakes });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;
  const body = await req.json().catch(() => null);
  const locationId = typeof body?.location_id === "string" ? body.location_id : "";
  if (!locationId) return NextResponse.json({ error: "location_id is required" }, { status: 400 });
  const supabase = await createTenantSupabaseClient(auth.ctx.tenantId);
  const result = await createStocktake(supabase, auth.ctx.tenantId, auth.ctx.userId, locationId);
  if (!result.ok) return fail(result);
  return NextResponse.json({ id: result.id });
}

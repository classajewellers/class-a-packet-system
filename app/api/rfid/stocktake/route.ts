import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/require-auth";
import { createTenantSupabaseClient } from "@/lib/supabase-server";
import { STOCKTAKE_SETUP_MESSAGE } from "@/lib/rfid-stocktake";
import { isUuid } from "@/lib/load-locations";
import { cancelStocktake, createStocktake, createWholeShopStocktake, createZoneStocktake, listStocktakes } from "@/lib/rfid-stocktake-server";

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
  return NextResponse.json({ stocktakes: result.stocktakes, warning: result.warning });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;
  const body = await req.json().catch(() => null);
  const fresh = body?.fresh === true;
  const supabase = await createTenantSupabaseClient(auth.ctx.tenantId);
  const cancelId = typeof body?.cancel_id === "string" ? body.cancel_id : "";
  if (cancelId) {
    const cancelled = await cancelStocktake(supabase, auth.ctx.tenantId, auth.ctx.userId, cancelId);
    if (!cancelled.ok) return fail(cancelled);
    const list = await listStocktakes(supabase, auth.ctx.tenantId);
    if (!list.ok) return fail(list);
    return NextResponse.json({ cancelled: true, stocktakes: list.stocktakes, warning: list.warning });
  }
  const manager = auth.ctx.role === "admin" || auth.ctx.role === "manager";
  if (body?.whole_shop === true) {
    if (!manager) return NextResponse.json({ error: "Only a manager can start a whole-shop count" }, { status: 403 });
    const result = await createWholeShopStocktake(supabase, auth.ctx.tenantId, auth.ctx.userId, { fresh });
    if (!result.ok) return fail(result);
    return NextResponse.json({ id: result.id, continued: result.continued, started_at: result.started_at });
  }
  const zoneId = isUuid(body?.zone_id) ? body.zone_id : "";
  if (zoneId) {
    const result = await createZoneStocktake(supabase, auth.ctx.tenantId, auth.ctx.userId, zoneId, { fresh });
    if (!result.ok) return fail(result);
    return NextResponse.json({ id: result.id, continued: result.continued, started_at: result.started_at });
  }
  const locationId = isUuid(body?.location_id) ? body.location_id : "";
  if (!locationId) return NextResponse.json({ error: "location_id is required" }, { status: 400 });
  const result = await createStocktake(supabase, auth.ctx.tenantId, auth.ctx.userId, locationId, { fresh });
  if (!result.ok) return fail(result);
  return NextResponse.json({ id: result.id, continued: result.continued, started_at: result.started_at });
}

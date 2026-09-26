import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireManager } from "@/lib/require-auth";
import { createTenantSupabaseClient } from "@/lib/supabase-server";
import { STOCKTAKE_SETUP_MESSAGE } from "@/lib/rfid-stocktake";
import { addZoneNeighbour, assignLocationZone, getZoneAdmin, removeZoneNeighbour } from "@/lib/rfid-stocktake-server";

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
  const result = await getZoneAdmin(supabase, auth.ctx.tenantId);
  if (!result.ok) return fail(result);
  return NextResponse.json({ admin: result.admin });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await requireManager(req);
  if (!auth.ok) return auth.response;
  const body = await req.json().catch(() => null);
  const action = typeof body?.action === "string" ? body.action : "";
  const supabase = await createTenantSupabaseClient(auth.ctx.tenantId);
  const tenantId = auth.ctx.tenantId;
  if (action === "assign") {
    const locationId = typeof body?.location_id === "string" ? body.location_id : "";
    const zoneId = typeof body?.zone_id === "string" && body.zone_id ? body.zone_id : null;
    if (!locationId) return NextResponse.json({ error: "location_id is required" }, { status: 400 });
    const result = await assignLocationZone(supabase, tenantId, locationId, zoneId);
    if (!result.ok) return fail(result);
  } else if (action === "add_neighbour") {
    const zoneA = typeof body?.zone_a_id === "string" ? body.zone_a_id : "";
    const zoneB = typeof body?.zone_b_id === "string" ? body.zone_b_id : "";
    const result = await addZoneNeighbour(supabase, tenantId, auth.ctx.userId, zoneA, zoneB);
    if (!result.ok) return fail(result);
  } else if (action === "remove_neighbour") {
    const zoneA = typeof body?.zone_a_id === "string" ? body.zone_a_id : "";
    const zoneB = typeof body?.zone_b_id === "string" ? body.zone_b_id : "";
    const result = await removeZoneNeighbour(supabase, tenantId, zoneA, zoneB);
    if (!result.ok) return fail(result);
  } else {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
  const admin = await getZoneAdmin(supabase, tenantId);
  if (!admin.ok) return fail(admin);
  return NextResponse.json({ admin: admin.admin });
}

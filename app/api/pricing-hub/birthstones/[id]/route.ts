import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";
export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  if (!tenantId) return NextResponse.json({ error: "x-tenant-id required" }, { status: 400 });
  const body = await req.json();
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if ("stone_name" in body) update.stone_name = String(body.stone_name).trim();
  if ("price_per_stone" in body) update.price_per_stone = Number(body.price_per_stone);
  if ("fitting_fee" in body) update.fitting_fee = Number(body.fitting_fee);
  if ("notes" in body) update.notes = body.notes ?? null;
  const db = await createTenantSupabaseClient(tenantId);
  const { data, error } = await db
    .from("pricing_birthstones")
    .update(update)
    .eq("id", params.id)
    .eq("tenant_id", tenantId)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  if (!tenantId) return NextResponse.json({ error: "x-tenant-id required" }, { status: 400 });
  const db = await createTenantSupabaseClient(tenantId);
  const { error } = await db
    .from("pricing_birthstones")
    .delete()
    .eq("id", params.id)
    .eq("tenant_id", tenantId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

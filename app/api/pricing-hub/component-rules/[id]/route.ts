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
  const { multiplier, carat_min, carat_max, notes } = body;
  if (multiplier == null) return NextResponse.json({ error: "multiplier required" }, { status: 400 });
  const db = await createTenantSupabaseClient(tenantId);
  const update: Record<string, unknown> = {
    multiplier: Number(multiplier),
    updated_at: new Date().toISOString(),
  };
  if (carat_min != null) update.carat_min = Number(carat_min);
  if ("carat_max" in body) update.carat_max = carat_max != null ? Number(carat_max) : null;
  if ("notes" in body) update.notes = notes ?? null;
  const { data, error } = await db
    .from("pricing_component_rules")
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
    .from("pricing_component_rules")
    .delete()
    .eq("id", params.id)
    .eq("tenant_id", tenantId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

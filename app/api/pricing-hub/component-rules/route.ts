import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  if (!tenantId) return NextResponse.json({ error: "x-tenant-id required" }, { status: 400 });
  const db = await createTenantSupabaseClient(tenantId);
  const { data, error } = await db
    .from("pricing_component_rules")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("component_type")
    .order("carat_min");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  if (!tenantId) return NextResponse.json({ error: "x-tenant-id required" }, { status: 400 });
  const body = await req.json();
  const { component_type, carat_min, carat_max, multiplier, notes } = body;
  if (!component_type || multiplier == null) {
    return NextResponse.json({ error: "component_type and multiplier are required" }, { status: 400 });
  }
  const db = await createTenantSupabaseClient(tenantId);
  const { data, error } = await db
    .from("pricing_component_rules")
    .insert({
      tenant_id: tenantId,
      component_type,
      carat_min: carat_min ?? 0,
      carat_max: carat_max ?? null,
      multiplier: Number(multiplier),
      notes: notes ?? null,
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

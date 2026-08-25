import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  if (!tenantId) return NextResponse.json({ error: "x-tenant-id required" }, { status: 400 });
  const db = await createTenantSupabaseClient(tenantId);
  const { data, error } = await db
    .from("pricing_birthstones")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("month_number");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  if (!tenantId) return NextResponse.json({ error: "x-tenant-id required" }, { status: 400 });
  const body = await req.json();
  const { month_number, stone_name, price_per_stone, fitting_fee, notes } = body;
  if (!month_number || !stone_name || price_per_stone == null) {
    return NextResponse.json({ error: "month_number, stone_name, and price_per_stone are required" }, { status: 400 });
  }
  const db = await createTenantSupabaseClient(tenantId);
  const { data, error } = await db
    .from("pricing_birthstones")
    .insert({
      tenant_id: tenantId,
      month_number: Number(month_number),
      stone_name: String(stone_name).trim(),
      price_per_stone: Number(price_per_stone),
      fitting_fee: fitting_fee != null ? Number(fitting_fee) : 0,
      notes: notes ?? null,
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

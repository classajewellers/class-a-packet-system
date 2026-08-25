import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  if (!tenantId) return NextResponse.json({ error: "x-tenant-id required" }, { status: 400 });
  const db = await createTenantSupabaseClient(tenantId);
  const { data, error } = await db
    .from("pricing_personalisation_fees")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("fee_type");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  if (!tenantId) return NextResponse.json({ error: "x-tenant-id required" }, { status: 400 });
  const body = await req.json();
  const { fee_type, description, amount } = body;
  if (!fee_type || amount == null) {
    return NextResponse.json({ error: "fee_type and amount are required" }, { status: 400 });
  }
  const db = await createTenantSupabaseClient(tenantId);
  const { data, error } = await db
    .from("pricing_personalisation_fees")
    .insert({
      tenant_id: tenantId,
      fee_type: String(fee_type).trim().toLowerCase().replace(/\s+/g, "_"),
      description: description ?? null,
      amount: Number(amount),
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

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
  if ("description" in body) update.description = body.description ?? null;
  if ("amount" in body) update.amount = Number(body.amount);
  const db = await createTenantSupabaseClient(tenantId);
  const { data, error } = await db
    .from("pricing_personalisation_fees")
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
    .from("pricing_personalisation_fees")
    .delete()
    .eq("id", params.id)
    .eq("tenant_id", tenantId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

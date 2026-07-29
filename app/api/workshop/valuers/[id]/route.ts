import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  try {
    const body = await req.json();
    const allowed: Record<string, unknown> = {};
    for (const field of ["name", "active"]) {
      if (field in body) allowed[field] = body[field];
    }
    const supabase = await createTenantSupabaseClient(tenantId);
    const { data: valuer, error } = await supabase
      .from("workshop_valuers")
      .update(allowed)
      .eq("id", params.id)
      .eq("tenant_id", tenantId)
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json({ valuer });
  } catch (err: unknown) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  try {
    const supabase = await createTenantSupabaseClient(tenantId);
    const { error } = await supabase
      .from("workshop_valuers")
      .delete()
      .eq("id", params.id)
      .eq("tenant_id", tenantId);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

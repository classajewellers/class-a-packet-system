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
    for (const field of ["name", "steps"]) {
      if (field in body) allowed[field] = body[field];
    }
    const supabase = await createTenantSupabaseClient(tenantId);
    const { data: pathway, error } = await supabase
      .from("workshop_pathways")
      .update(allowed)
      .eq("id", params.id)
      .eq("tenant_id", tenantId)
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json({ pathway });
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
      .from("workshop_pathways")
      .delete()
      .eq("id", params.id)
      .eq("tenant_id", tenantId);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

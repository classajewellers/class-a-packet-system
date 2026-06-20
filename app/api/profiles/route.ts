import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  try {
    const supabase = await createTenantSupabaseClient(tenantId);
    let q = supabase
      .from("profiles")
      .select("id, full_name, email, role, speciality")
      .order("full_name", { ascending: true });
    if (tenantId) q = q.eq("tenant_id", tenantId);
    const { data, error } = await q;
    if (error) return NextResponse.json({ profiles: [], error: error.message }, { status: 500 });
    return NextResponse.json({ profiles: data ?? [] });
  } catch (err) {
    return NextResponse.json({ profiles: [], error: String(err) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  try {
    const { id, full_name, speciality } = await req.json();
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const supabase = await createTenantSupabaseClient(tenantId);
    const updates: Record<string, unknown> = {};
    if (full_name !== undefined) updates.full_name = full_name || null;
    if (speciality !== undefined) updates.speciality = speciality || null;

    let q = supabase.from("profiles").update(updates).eq("id", id).select().single();
    if (tenantId) q = supabase.from("profiles").update(updates).eq("id", id).eq("tenant_id", tenantId).select().single();

    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ profile: data });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

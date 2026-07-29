import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  try {
    const supabase = await createTenantSupabaseClient(tenantId);
    const { data: subcontractors, error } = await supabase
      .from("workshop_subcontractors")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("sort_order");
    if (error) throw error;
    return NextResponse.json({ subcontractors: subcontractors ?? [] });
  } catch (err: unknown) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  try {
    const body = await req.json();
    const supabase = await createTenantSupabaseClient(tenantId);
    const { data: subcontractor, error } = await supabase
      .from("workshop_subcontractors")
      .insert({
        tenant_id: tenantId,
        name: body.name,
        sort_order: 0,
        active: true,
      })
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json({ subcontractor });
  } catch (err: unknown) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  try {
    const supabase = await createTenantSupabaseClient(tenantId);
    const { data: members, error } = await supabase
      .from("workshop_team_members")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("sort_order");
    if (error) throw error;
    return NextResponse.json({ members: members ?? [] });
  } catch (err: unknown) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  try {
    const body = await req.json();
    const supabase = await createTenantSupabaseClient(tenantId);
    const { data: member, error } = await supabase
      .from("workshop_team_members")
      .insert({
        tenant_id: tenantId,
        name: body.name,
        sort_order: 0,
        active: true,
        profile_id: body.profile_id ?? null,
      })
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json({ member });
  } catch (err: unknown) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

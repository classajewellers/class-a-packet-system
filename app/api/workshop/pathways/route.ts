import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  try {
    const supabase = await createTenantSupabaseClient(tenantId);
    const { data: pathways, error } = await supabase
      .from("workshop_pathways")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("name");
    if (error) throw error;
    return NextResponse.json({ pathways: pathways ?? [] });
  } catch (err: unknown) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  try {
    const body = await req.json();
    const supabase = await createTenantSupabaseClient(tenantId);
    const { data: pathway, error } = await supabase
      .from("workshop_pathways")
      .insert({
        tenant_id: tenantId,
        name: body.name,
        steps: body.steps ?? [],
      })
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json({ pathway });
  } catch (err: unknown) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

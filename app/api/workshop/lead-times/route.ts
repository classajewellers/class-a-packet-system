import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  try {
    const supabase = await createTenantSupabaseClient(tenantId);
    const { data: leadTimes, error } = await supabase
      .from("workshop_lead_times")
      .select("*")
      .eq("tenant_id", tenantId);
    if (error) throw error;
    return NextResponse.json({ leadTimes: leadTimes ?? [] });
  } catch (err: unknown) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function PUT(req: NextRequest): Promise<NextResponse> {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  try {
    const body = await req.json();
    const supabase = await createTenantSupabaseClient(tenantId);
    const { data: leadTime, error } = await supabase
      .from("workshop_lead_times")
      .upsert(
        {
          tenant_id: tenantId,
          job_type: body.job_type,
          weeks: body.weeks,
        },
        { onConflict: "tenant_id,job_type" }
      )
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json({ leadTime });
  } catch (err: unknown) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

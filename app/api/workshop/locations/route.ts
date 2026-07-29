export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";

export async function GET(req: NextRequest) {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  const supabase = await createTenantSupabaseClient(tenantId);

  const { data, error } = await supabase
    .from("workshop_locations")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("sort_order");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ locations: data });
}

export async function POST(req: NextRequest) {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  const supabase = await createTenantSupabaseClient(tenantId);
  const body = await req.json();

  const { data, error } = await supabase
    .from("workshop_locations")
    .insert({
      tenant_id: tenantId,
      name: body.name,
      job_types: body.job_types || [],
      sort_order: body.sort_order ?? 0,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ location: data });
}

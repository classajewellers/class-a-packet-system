export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";

export async function GET(req: NextRequest) {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  const supabase = await createTenantSupabaseClient(tenantId);

  const { data, error } = await supabase
    .from("workshop_stages")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("sort_order");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ stages: data });
}

export async function POST(req: NextRequest) {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  const supabase = await createTenantSupabaseClient(tenantId);
  const body = await req.json();

  const { data, error } = await supabase
    .from("workshop_stages")
    .insert({
      tenant_id: tenantId,
      category_id: body.category_id || null,
      key: body.key,
      label: body.label,
      intake_substatus: body.intake_substatus || null,
      sort_order: body.sort_order ?? 0,
      is_locked: false,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ stage: data });
}

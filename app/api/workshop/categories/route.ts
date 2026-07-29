export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";

export async function GET(req: NextRequest) {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  const supabase = await createTenantSupabaseClient(tenantId);

  const { data, error } = await supabase
    .from("workshop_stage_categories")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("sort_order");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ categories: data });
}

export async function POST(req: NextRequest) {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  const supabase = await createTenantSupabaseClient(tenantId);
  const body = await req.json();

  const { data, error } = await supabase
    .from("workshop_stage_categories")
    .insert({
      tenant_id: tenantId,
      name: body.name,
      color: body.color || "gray",
      sort_order: body.sort_order ?? 0,
      default_collapsed: body.default_collapsed ?? true,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ category: data });
}

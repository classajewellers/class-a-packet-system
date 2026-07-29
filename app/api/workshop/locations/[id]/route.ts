export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  const supabase = await createTenantSupabaseClient(tenantId);
  const body = await req.json();

  const allowed: Record<string, unknown> = {};
  if (body.name !== undefined) allowed.name = body.name;
  if (body.job_types !== undefined) allowed.job_types = body.job_types;
  if (body.sort_order !== undefined) allowed.sort_order = body.sort_order;

  const { data, error } = await supabase
    .from("workshop_locations")
    .update(allowed)
    .eq("id", params.id)
    .eq("tenant_id", tenantId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ location: data });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  const supabase = await createTenantSupabaseClient(tenantId);

  const { data: location, error: fetchError } = await supabase
    .from("workshop_locations")
    .select("*")
    .eq("id", params.id)
    .eq("tenant_id", tenantId)
    .single();

  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });
  if (!location) return NextResponse.json({ error: "Location not found." }, { status: 404 });

  const { count, error: countError } = await supabase
    .from("packets")
    .select("id", { count: "exact", head: true })
    .eq("status", "on_bench")
    .is("assigned_to", null)
    .is("workshop_subcontractor_name", null)
    .in("job_type", location.job_types)
    .eq("tenant_id", tenantId);

  if (countError) return NextResponse.json({ error: countError.message }, { status: 500 });

  if (count && count > 0) {
    return NextResponse.json(
      { error: `Cannot delete: ${count} job(s) are in this queue. Reassign them first.` },
      { status: 409 }
    );
  }

  const { error } = await supabase
    .from("workshop_locations")
    .delete()
    .eq("id", params.id)
    .eq("tenant_id", tenantId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

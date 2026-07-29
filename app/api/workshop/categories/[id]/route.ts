export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  const supabase = await createTenantSupabaseClient(tenantId);
  const body = await req.json();

  const allowed: Record<string, unknown> = {};
  if (body.name !== undefined) allowed.name = body.name;
  if (body.color !== undefined) allowed.color = body.color;
  if (body.sort_order !== undefined) allowed.sort_order = body.sort_order;
  if (body.default_collapsed !== undefined) allowed.default_collapsed = body.default_collapsed;

  const { data, error } = await supabase
    .from("workshop_stage_categories")
    .update(allowed)
    .eq("id", params.id)
    .eq("tenant_id", tenantId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ category: data });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  const supabase = await createTenantSupabaseClient(tenantId);

  const { count, error: countError } = await supabase
    .from("workshop_stages")
    .select("id", { count: "exact", head: true })
    .eq("category_id", params.id)
    .eq("tenant_id", tenantId);

  if (countError) return NextResponse.json({ error: countError.message }, { status: 500 });

  if (count && count > 0) {
    return NextResponse.json(
      { error: `Cannot delete: ${count} stages are assigned to this category. Reassign them first.` },
      { status: 409 }
    );
  }

  const { error } = await supabase
    .from("workshop_stage_categories")
    .delete()
    .eq("id", params.id)
    .eq("tenant_id", tenantId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

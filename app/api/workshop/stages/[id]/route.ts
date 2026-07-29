export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  const supabase = await createTenantSupabaseClient(tenantId);
  const body = await req.json();

  const { data: current, error: fetchError } = await supabase
    .from("workshop_stages")
    .select("*")
    .eq("id", params.id)
    .eq("tenant_id", tenantId)
    .single();

  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });
  if (!current) return NextResponse.json({ error: "Stage not found." }, { status: 404 });

  if (current.is_locked) {
    if (body.key !== undefined || body.intake_substatus !== undefined) {
      return NextResponse.json(
        { error: "Cannot change key or intake_substatus on a locked stage." },
        { status: 409 }
      );
    }
  }

  const allowed: Record<string, unknown> = {};
  if (body.category_id !== undefined) allowed.category_id = body.category_id;
  if (body.label !== undefined) allowed.label = body.label;
  if (body.sort_order !== undefined) allowed.sort_order = body.sort_order;

  const { data, error } = await supabase
    .from("workshop_stages")
    .update(allowed)
    .eq("id", params.id)
    .eq("tenant_id", tenantId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ stage: data });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  const supabase = await createTenantSupabaseClient(tenantId);

  const { data: stage, error: fetchError } = await supabase
    .from("workshop_stages")
    .select("*")
    .eq("id", params.id)
    .eq("tenant_id", tenantId)
    .single();

  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });
  if (!stage) return NextResponse.json({ error: "Stage not found." }, { status: 404 });

  if (stage.is_locked) {
    return NextResponse.json(
      { error: "This stage is locked and cannot be deleted." },
      { status: 409 }
    );
  }

  let countQuery = supabase
    .from("packets")
    .select("id", { count: "exact", head: true })
    .eq("status", stage.key)
    .eq("tenant_id", tenantId);

  if (stage.intake_substatus !== null) {
    countQuery = countQuery.eq("workshop_intake_substatus", stage.intake_substatus);
  }

  const { count, error: countError } = await countQuery;

  if (countError) return NextResponse.json({ error: countError.message }, { status: 500 });

  if (count && count > 0) {
    return NextResponse.json(
      { error: `Cannot delete: ${count} job(s) currently in this stage. Move them first.` },
      { status: 409 }
    );
  }

  const { error } = await supabase
    .from("workshop_stages")
    .delete()
    .eq("id", params.id)
    .eq("tenant_id", tenantId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

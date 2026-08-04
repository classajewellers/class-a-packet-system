import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// DELETE /api/attachments/[id]
// Soft-deletes by setting archived = true. Storage object is NOT removed here;
// a future hard-delete flow can sweep archived rows and clean storage.
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  if (!tenantId) return NextResponse.json({ error: "Missing tenant" }, { status: 400 });

  const supabase = await createTenantSupabaseClient(tenantId);

  const { data: att, error: fetchErr } = await supabase
    .from("attachments")
    .select("id, tenant_id")
    .eq("id", params.id)
    .eq("tenant_id", tenantId)
    .single();

  if (fetchErr || !att) {
    return NextResponse.json({ error: "Attachment not found" }, { status: 404 });
  }

  const { error: dbErr } = await supabase
    .from("attachments")
    .update({ archived: true })
    .eq("id", params.id)
    .eq("tenant_id", tenantId);

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });

  return NextResponse.json({ success: true });
}

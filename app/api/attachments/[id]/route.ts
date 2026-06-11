import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  const supabase = await createTenantSupabaseClient(tenantId);

  const { data: att, error: fetchErr } = await supabase
    .from("attachments")
    .select("*")
    .eq("id", params.id)
    .single();

  if (fetchErr || !att) {
    return NextResponse.json({ error: "Attachment not found" }, { status: 404 });
  }

  // Delete from storage (non-fatal if it fails)
  await supabase.storage.from("attachments").remove([att.file_url]).catch(console.error);

  const { error: dbErr } = await supabase.from("attachments").delete().eq("id", params.id);
  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });

  return NextResponse.json({ success: true });
}

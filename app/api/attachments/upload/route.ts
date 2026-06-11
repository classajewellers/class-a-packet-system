import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const ALLOWED_MIME = new Set([
  "image/jpeg", "image/jpg", "image/png", "image/webp",
  "image/heic", "image/heif", "application/pdf",
]);
const ALLOWED_EXT = /\.(jpg|jpeg|png|webp|heic|heif|pdf)$/i;

export async function POST(req: NextRequest) {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  if (!tenantId) return NextResponse.json({ error: "Missing tenant" }, { status: 400 });

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const entityType = formData.get("entity_type") as string | null;
    const entityId = formData.get("entity_id") as string | null;

    if (!file || !entityType || !entityId) {
      return NextResponse.json({ error: "file, entity_type, and entity_id are required" }, { status: 400 });
    }

    if (!ALLOWED_MIME.has(file.type) && !ALLOWED_EXT.test(file.name)) {
      return NextResponse.json({ error: "File type not allowed. Use JPG, PNG, WebP, HEIC, or PDF." }, { status: 400 });
    }

    const supabase = await createTenantSupabaseClient(tenantId);

    // Ensure bucket exists (no-op if already present)
    await supabase.storage.createBucket("attachments", { public: false }).catch(() => {});

    const ext = file.name.split(".").pop()?.toLowerCase() ?? "bin";
    const storagePath = `${tenantId}/${entityType}/${entityId}/${crypto.randomUUID()}.${ext}`;
    const fileType = file.type.startsWith("image/") ? "image" : "pdf";

    const bytes = await file.arrayBuffer();
    const { error: uploadError } = await supabase.storage
      .from("attachments")
      .upload(storagePath, bytes, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const { data, error: dbError } = await supabase
      .from("attachments")
      .insert({
        tenant_id: tenantId,
        entity_type: entityType,
        entity_id: entityId,
        file_name: file.name,
        file_url: storagePath,
        file_type: fileType,
        file_size: file.size,
      })
      .select()
      .single();

    if (dbError) {
      await supabase.storage.from("attachments").remove([storagePath]);
      return NextResponse.json({ error: dbError.message }, { status: 500 });
    }

    return NextResponse.json({ attachment: data });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

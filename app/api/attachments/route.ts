import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Supported entity types for inventory records
const VALID_RECORD_TYPES = new Set([
  "inventory_piece",
  "inventory_product",
  "purchase_order",
  // legacy support — packets and quotes use the /upload + /list routes
  "packet",
  "quote",
]);

const VALID_ATTACHMENT_TYPES = new Set([
  "photo", "certificate", "invoice", "valuation",
  "cad_file", "workshop_document", "other",
]);

const ALLOWED_MIME = new Set([
  "image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic", "image/heif",
  "image/gif", "image/tiff",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
  "application/zip",
  "application/x-zip-compressed",
]);
const ALLOWED_EXT = /\.(jpg|jpeg|png|webp|heic|heif|gif|tiff?|pdf|docx?|xlsx?|csv|zip)$/i;
const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

// ── GET /api/attachments?record_type=X&record_id=Y[&attachment_type=Z] ────────
export async function GET(req: NextRequest): Promise<NextResponse> {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  if (!tenantId) return NextResponse.json({ attachments: [] }, { status: 400 });

  const { searchParams } = new URL(req.url);
  const recordType = searchParams.get("record_type");
  const recordId   = searchParams.get("record_id");
  const typeFilter = searchParams.get("attachment_type"); // optional

  if (!recordType || !recordId) {
    return NextResponse.json({ error: "record_type and record_id are required" }, { status: 400 });
  }

  const supabase = await createTenantSupabaseClient(tenantId);

  let query = supabase
    .from("attachments")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("entity_type", recordType)
    .eq("entity_id", recordId)
    .eq("archived", false)
    .order("created_at", { ascending: true });

  if (typeFilter && VALID_ATTACHMENT_TYPES.has(typeFilter)) {
    query = query.eq("attachment_type", typeFilter);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Generate 1-hour signed URLs for every attachment
  const withUrls = await Promise.all(
    (data ?? []).map(async (att) => {
      const storagePath = att.file_url; // field stores the storage path
      const { data: signed } = await supabase.storage
        .from("attachments")
        .createSignedUrl(storagePath, 3600);
      return { ...att, signed_url: signed?.signedUrl ?? null };
    })
  );

  return NextResponse.json({ attachments: withUrls });
}

// ── POST /api/attachments (multipart) ─────────────────────────────────────────
// Fields: file (File), record_type, record_id, attachment_type?, display_name?, notes?
export async function POST(req: NextRequest): Promise<NextResponse> {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  if (!tenantId) return NextResponse.json({ error: "Missing tenant" }, { status: 400 });

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid multipart body" }, { status: 400 });
  }

  const file           = formData.get("file") as File | null;
  const recordType     = formData.get("record_type") as string | null;
  const recordId       = formData.get("record_id") as string | null;
  const attachmentType = (formData.get("attachment_type") as string | null) ?? "other";
  const displayName    = (formData.get("display_name") as string | null) || null;
  const notes          = (formData.get("notes") as string | null) || null;

  if (!file)       return NextResponse.json({ error: "file is required" }, { status: 400 });
  if (!recordType) return NextResponse.json({ error: "record_type is required" }, { status: 400 });
  if (!recordId)   return NextResponse.json({ error: "record_id is required" }, { status: 400 });

  const RECORD_TYPE_LIST = ["inventory_piece", "inventory_product", "purchase_order", "packet", "quote"];
  const ATTACHMENT_TYPE_LIST = ["photo", "certificate", "invoice", "valuation", "cad_file", "workshop_document", "other"];

  if (!VALID_RECORD_TYPES.has(recordType)) {
    return NextResponse.json(
      { error: `Invalid record_type. Must be one of: ${RECORD_TYPE_LIST.join(", ")}` },
      { status: 400 }
    );
  }

  if (!VALID_ATTACHMENT_TYPES.has(attachmentType)) {
    return NextResponse.json(
      { error: `Invalid attachment_type. Must be one of: ${ATTACHMENT_TYPE_LIST.join(", ")}` },
      { status: 400 }
    );
  }

  // File type validation
  if (!ALLOWED_MIME.has(file.type) && !ALLOWED_EXT.test(file.name)) {
    return NextResponse.json(
      { error: "File type not allowed. Supported: JPG, PNG, WebP, HEIC, GIF, PDF, Word, Excel, CSV, ZIP." },
      { status: 400 }
    );
  }

  // File size validation
  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json(
      { error: `File too large. Maximum size is 10 MB (received ${(file.size / 1024 / 1024).toFixed(1)} MB).` },
      { status: 400 }
    );
  }

  const supabase = await createTenantSupabaseClient(tenantId);

  // Ensure private bucket exists (no-op if already present)
  await supabase.storage.createBucket("attachments", { public: false }).catch(() => {});

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "bin";
  const storagePath = `${tenantId}/${recordType}/${recordId}/${crypto.randomUUID()}.${ext}`;
  const fileType = file.type.startsWith("image/") ? "image" : "document";

  const bytes = await file.arrayBuffer();
  const { error: uploadError } = await supabase.storage
    .from("attachments")
    .upload(storagePath, bytes, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });

  if (uploadError) {
    return NextResponse.json({ error: `Storage upload failed: ${uploadError.message}` }, { status: 500 });
  }

  const { data: row, error: dbError } = await supabase
    .from("attachments")
    .insert({
      tenant_id:       tenantId,
      entity_type:     recordType,
      entity_id:       recordId,
      file_name:       file.name,
      file_url:        storagePath,
      file_type:       fileType,
      file_size:       file.size,
      attachment_type: attachmentType,
      display_name:    displayName,
      notes:           notes,
      archived:        false,
    })
    .select()
    .single();

  if (dbError) {
    // Roll back storage upload on DB failure
    await supabase.storage.from("attachments").remove([storagePath]).catch(() => {});
    return NextResponse.json({ error: `Database insert failed: ${dbError.message}` }, { status: 500 });
  }

  // Return with a signed URL for immediate display
  const { data: signed } = await supabase.storage
    .from("attachments")
    .createSignedUrl(storagePath, 3600);

  return NextResponse.json({ attachment: { ...row, signed_url: signed?.signedUrl ?? null } });
}

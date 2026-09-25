import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MAX_BYTES = 2 * 1024 * 1024;

export async function POST(req: NextRequest): Promise<NextResponse> {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  if (!tenantId) return NextResponse.json({ error: "Missing tenant" }, { status: 400 });

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Choose a logo image." }, { status: 400 });
  if (!ALLOWED.has(file.type)) return NextResponse.json({ error: "Use a PNG, JPG, WebP, or GIF logo." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Logo must be 2 MB or smaller." }, { status: 400 });

  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : file.type === "image/gif" ? "gif" : "jpg";
  const path = `branding/${tenantId}/logo.${ext}`;
  const supabase = await createTenantSupabaseClient(tenantId);
  const bytes = await file.arrayBuffer();
  const { error: uploadError } = await supabase.storage.from("attachments").upload(path, bytes, {
    contentType: file.type,
    upsert: true,
  });
  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

  const stored = `storage:attachments/${path}`;
  const { error } = await supabase.from("tenants").update({ brand_logo_url: stored }).eq("id", tenantId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const signed = await supabase.storage.from("attachments").createSignedUrl(path, 60 * 60);
  return NextResponse.json({
    brand_logo_url: stored,
    logo_preview_url: signed.data?.signedUrl ?? null,
  });
}

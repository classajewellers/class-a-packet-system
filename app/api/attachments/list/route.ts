import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  const { searchParams } = new URL(req.url);
  const entityType = searchParams.get("entity_type");
  const entityId = searchParams.get("entity_id");

  if (!entityType || !entityId) {
    return NextResponse.json({ error: "entity_type and entity_id are required" }, { status: 400 });
  }

  // Tenant scope is mandatory — without it this route returned any tenant's
  // attachments for a known entity_id (cross-tenant read). An empty tenant is
  // rejected rather than silently matching tenant_id = ''.
  if (!tenantId) {
    return NextResponse.json({ error: "Missing tenant" }, { status: 400 });
  }

  const supabase = await createTenantSupabaseClient(tenantId);

  const { data, error } = await supabase
    .from("attachments")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Generate 1-hour signed URLs for all attachments
  const withUrls = await Promise.all(
    (data ?? []).map(async (att) => {
      const { data: signed } = await supabase.storage
        .from("attachments")
        .createSignedUrl(att.file_url, 3600);
      return { ...att, signed_url: signed?.signedUrl ?? null };
    })
  );

  return NextResponse.json({ attachments: withUrls });
}

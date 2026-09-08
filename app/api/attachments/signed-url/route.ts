import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";
import { requireAuth } from "@/lib/require-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;
  const { tenantId } = auth.ctx;

  const { searchParams } = new URL(req.url);
  const path = searchParams.get("path");

  if (!path) return NextResponse.json({ error: "path is required" }, { status: 400 });

  // Storage paths are written as `${tenantId}/<entity>/<id>/<file>` (see the
  // upload routes). Refuse to sign any path outside the caller's own tenant
  // prefix — without this, a caller could sign ANY tenant's object (H4:
  // cross-tenant file exfiltration).
  if (path !== tenantId && !path.startsWith(`${tenantId}/`)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = await createTenantSupabaseClient(tenantId);
  const { data, error } = await supabase.storage
    .from("attachments")
    .createSignedUrl(path, 3600);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ signedUrl: data?.signedUrl ?? null });
}

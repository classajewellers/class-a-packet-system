import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";
import { requireManager } from "@/lib/require-auth";
import { missingXeroScopes, XERO_REQUIRED_CONNECTION_SCOPES } from "@/lib/xero";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  if (!tenantId) {
    return NextResponse.json({ connected: false, error: "Missing tenant" }, { status: 400 });
  }

  try {
    const supabase = await createTenantSupabaseClient(tenantId);
    const { data, error } = await supabase
      .from("tenant_xero_connections")
      .select("xero_tenant_name, scopes, connected_at")
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ connected: false, error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ connected: false });
    }

    const missing = missingXeroScopes(data.scopes, XERO_REQUIRED_CONNECTION_SCOPES);

    return NextResponse.json({
      connected:          true,
      xero_tenant_name:   data.xero_tenant_name,
      scopes:             data.scopes,
      connected_at:       data.connected_at,
      missing_scopes:     missing,
      reconnect_required: missing.length > 0,
    });
  } catch (err) {
    return NextResponse.json({ connected: false, error: String(err) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const auth = await requireManager(req);
  if (!auth.ok) return auth.response;
  const tenantId = auth.ctx.tenantId;

  try {
    const supabase = await createTenantSupabaseClient(tenantId);
    const { error } = await supabase
      .from("tenant_xero_connections")
      .delete()
      .eq("tenant_id", tenantId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ disconnected: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

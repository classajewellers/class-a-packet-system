import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  if (!tenantId) {
    return NextResponse.json({ connected: false }, { status: 400 });
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

    return NextResponse.json({
      connected:        true,
      xero_tenant_name: data.xero_tenant_name,
      scopes:           data.scopes,
      connected_at:     data.connected_at,
    });
  } catch (err) {
    return NextResponse.json({ connected: false, error: String(err) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  if (!tenantId) {
    return NextResponse.json({ error: "x-tenant-id required" }, { status: 400 });
  }

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

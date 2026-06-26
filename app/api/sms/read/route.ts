import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  if (!tenantId) {
    return NextResponse.json({ success: false, error: "x-tenant-id required" }, { status: 400 });
  }

  let body: { customer_id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
  }

  const { customer_id } = body;
  if (!customer_id) {
    return NextResponse.json({ success: false, error: "customer_id required" }, { status: 400 });
  }

  try {
    const supabase = await createTenantSupabaseClient(tenantId);

    const { error } = await supabase
      .from("sms_messages")
      .update({ read_at: new Date().toISOString() })
      .eq("tenant_id", tenantId)
      .eq("customer_id", customer_id)
      .eq("direction", "in")
      .is("read_at", null);

    if (error) {
      console.error("[sms/read] Update error:", error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[sms/read] Unexpected error:", err);
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

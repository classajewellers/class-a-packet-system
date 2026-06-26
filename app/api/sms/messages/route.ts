import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  if (!tenantId) {
    return NextResponse.json({ success: false, error: "x-tenant-id required" }, { status: 400 });
  }

  const customerId = req.nextUrl.searchParams.get("customer_id");
  if (!customerId) {
    return NextResponse.json({ success: false, error: "customer_id required" }, { status: 400 });
  }

  try {
    const supabase = await createTenantSupabaseClient(tenantId);

    const { data: messages, error } = await supabase
      .from("sms_messages")
      .select("id, direction, body, sent_at, staff_id, read_at")
      .eq("tenant_id", tenantId)
      .eq("customer_id", customerId)
      .order("sent_at", { ascending: true });

    if (error) {
      console.error("[sms/messages] Query error:", error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, messages: messages ?? [] });
  } catch (err) {
    console.error("[sms/messages] Unexpected error:", err);
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

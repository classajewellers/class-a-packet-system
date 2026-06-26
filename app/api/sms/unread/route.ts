import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  if (!tenantId) {
    return NextResponse.json({ success: false, error: "x-tenant-id required" }, { status: 400 });
  }

  try {
    const supabase = await createTenantSupabaseClient(tenantId);

    // Get all unread inbound message customer_ids for this tenant
    const { data: unreadRows, error } = await supabase
      .from("sms_messages")
      .select("customer_id")
      .eq("tenant_id", tenantId)
      .eq("direction", "in")
      .is("read_at", null);

    if (error) {
      console.error("[sms/unread] Query error:", error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    if (!unreadRows || unreadRows.length === 0) {
      return NextResponse.json({ success: true, unread: {} });
    }

    // Count per customer_id
    const countById: Record<string, number> = {};
    for (const row of unreadRows) {
      countById[row.customer_id] = (countById[row.customer_id] ?? 0) + 1;
    }

    // Resolve customer_ids to emails
    const customerIds = Object.keys(countById);
    const { data: customerRows, error: custErr } = await supabase
      .from("customers")
      .select("id, email")
      .in("id", customerIds);

    if (custErr) {
      console.error("[sms/unread] Customer lookup error:", custErr);
      return NextResponse.json({ success: false, error: custErr.message }, { status: 500 });
    }

    const unread: Record<string, number> = {};
    for (const c of customerRows ?? []) {
      if (countById[c.id]) unread[c.email] = countById[c.id];
    }

    return NextResponse.json({ success: true, unread });
  } catch (err) {
    console.error("[sms/unread] Unexpected error:", err);
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

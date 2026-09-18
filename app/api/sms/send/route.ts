import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";
import { sendSms } from "@/lib/sendSms";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  if (!tenantId) {
    return NextResponse.json({ success: false, error: "x-tenant-id required" }, { status: 400 });
  }

  let body: { customer_id?: string; body?: string; staff_id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
  }

  const { customer_id, body: messageBody, staff_id } = body;
  if (!customer_id || !messageBody?.trim()) {
    return NextResponse.json({ success: false, error: "customer_id and body are required" }, { status: 400 });
  }

  try {
    const supabase = await createTenantSupabaseClient(tenantId);
    const result = await sendSms(supabase, tenantId, customer_id, messageBody, staff_id ?? null);

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: result.status ?? 500 });
    }

    return NextResponse.json({
      success: true,
      suppressed: result.suppressed,
      message_id: result.message_id,
      twilio_sid: result.twilio_sid,
    });
  } catch (err) {
    console.error("[sms/send] Unexpected error:", err);
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

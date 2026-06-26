import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

// Class A tenant — skip billing, always allow
const CLASS_A_TENANT = "00000000-0000-0000-0000-000000000001";

function normaliseAuMobile(raw: string): string {
  const digits = raw.replace(/\s+/g, "").replace(/-/g, "");
  if (digits.startsWith("+61")) return digits;
  if (digits.startsWith("04")) return "+61" + digits.slice(1);
  if (digits.startsWith("614")) return "+" + digits;
  return digits;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  if (!tenantId) {
    return NextResponse.json({ success: false, error: "x-tenant-id required" }, { status: 400 });
  }

  // Class A billing guard
  if (tenantId === CLASS_A_TENANT) {
    return NextResponse.json({ ok: true });
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

  const accountSid  = process.env.VAULT_TWILIO_ACCOUNT_SID;
  const authToken   = process.env.VAULT_TWILIO_AUTH_TOKEN;
  const fromNumber  = process.env.VAULT_TWILIO_FROM_NUMBER;

  if (!accountSid || !authToken || !fromNumber) {
    return NextResponse.json({ success: false, error: "Twilio credentials not configured" }, { status: 500 });
  }

  try {
    const supabase = await createTenantSupabaseClient(tenantId);

    // Verify customer belongs to this tenant and get their phone number
    const { data: customer, error: custErr } = await supabase
      .from("customers")
      .select("id, first_name, last_name, phone")
      .eq("id", customer_id)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (custErr || !customer) {
      return NextResponse.json({ success: false, error: "Customer not found" }, { status: 404 });
    }
    if (!customer.phone) {
      return NextResponse.json({ success: false, error: "Customer has no phone number on file" }, { status: 422 });
    }

    const toNumber = normaliseAuMobile(customer.phone);

    // Send via Twilio REST API
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
    const params = new URLSearchParams({ From: fromNumber, To: toNumber, Body: messageBody.trim() });
    const twilioRes = await fetch(twilioUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: "Basic " + Buffer.from(`${accountSid}:${authToken}`).toString("base64"),
      },
      body: params.toString(),
    });

    const twilioJson = await twilioRes.json() as { sid?: string; error_message?: string; message?: string };

    if (!twilioRes.ok) {
      const errMsg = twilioJson.error_message ?? twilioJson.message ?? "Twilio error";
      console.error("[sms/send] Twilio error:", twilioRes.status, errMsg);
      return NextResponse.json({ success: false, error: errMsg }, { status: 502 });
    }

    // Record in sms_messages
    const { data: msg, error: insertErr } = await supabase
      .from("sms_messages")
      .insert({
        tenant_id:   tenantId,
        customer_id: customer_id,
        direction:   "out",
        body:        messageBody.trim(),
        twilio_sid:  twilioJson.sid ?? null,
        staff_id:    staff_id ?? null,
        sent_at:     new Date().toISOString(),
      })
      .select("id")
      .single();

    if (insertErr) {
      console.error("[sms/send] DB insert error:", insertErr);
      // Message was sent — still return success, just note the log failure
      return NextResponse.json({ success: true, message_id: null, twilio_sid: twilioJson.sid });
    }

    return NextResponse.json({ success: true, message_id: msg.id, twilio_sid: twilioJson.sid });
  } catch (err) {
    console.error("[sms/send] Unexpected error:", err);
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

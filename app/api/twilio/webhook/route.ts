import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

// TwiML empty response — Twilio requires this exact format or it retries
const TWIML_OK = `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`;

function twimlResponse() {
  return new NextResponse(TWIML_OK, {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  });
}

// Convert any AU mobile format to both variants for DB lookup
function auMobileVariants(raw: string): string[] {
  const digits = raw.replace(/\s+/g, "").replace(/-/g, "");
  if (digits.startsWith("+614")) {
    return [digits, "0" + digits.slice(2)]; // +61412... and 0412...
  }
  if (digits.startsWith("614")) {
    return ["+" + digits, "0" + digits.slice(2)];
  }
  if (digits.startsWith("04")) {
    return [digits, "+61" + digits.slice(1)]; // 04... and +614...
  }
  return [digits];
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Twilio sends application/x-www-form-urlencoded
  let from = "";
  let body = "";
  let messageSid = "";

  try {
    const text = await req.text();
    const params = new URLSearchParams(text);
    from       = params.get("From")      ?? "";
    body       = params.get("Body")      ?? "";
    messageSid = params.get("MessageSid") ?? "";
  } catch {
    // Always return 200 to Twilio — never let it retry on our parse errors
    console.error("[twilio/webhook] Failed to parse request body");
    return twimlResponse();
  }

  if (!from || !body) {
    console.warn("[twilio/webhook] Missing From or Body — ignoring");
    return twimlResponse();
  }

  console.log(`[twilio/webhook] Inbound SMS from=${from} sid=${messageSid}`);

  try {
    const supabase = createServerSupabaseClient();
    const phoneVariants = auMobileVariants(from);

    // Find customer matching any phone variant — use first match
    const { data: customers, error: custErr } = await supabase
      .from("customers")
      .select("id, tenant_id, first_name, last_name")
      .in("phone", phoneVariants)
      .limit(1);

    if (custErr) {
      console.error("[twilio/webhook] Customer lookup error:", custErr);
      return twimlResponse();
    }

    if (!customers || customers.length === 0) {
      console.warn(`[twilio/webhook] No customer found for phone variants: ${phoneVariants.join(", ")}`);
      return twimlResponse();
    }

    const customer = customers[0];
    console.log(`[twilio/webhook] Matched customer=${customer.id} tenant=${customer.tenant_id}`);

    const { error: insertErr } = await supabase
      .from("sms_messages")
      .insert({
        tenant_id:   customer.tenant_id,
        customer_id: customer.id,
        direction:   "in",
        body:        body.trim(),
        twilio_sid:  messageSid || null,
        staff_id:    null,
        read_at:     null,
        sent_at:     new Date().toISOString(),
      });

    if (insertErr) {
      console.error("[twilio/webhook] DB insert error:", insertErr);
    } else {
      console.log(`[twilio/webhook] Stored inbound message for customer=${customer.id}`);
    }
  } catch (err) {
    console.error("[twilio/webhook] Unexpected error:", err);
  }

  // Always return 200 TwiML — regardless of DB errors
  return twimlResponse();
}

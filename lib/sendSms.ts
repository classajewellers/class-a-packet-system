import { createTenantSupabaseClient } from "@/lib/supabase-server";
import { outboundBlock, logSuppressedOutbound } from "@/lib/outbound-guard";

type TenantSupabaseClient = Awaited<ReturnType<typeof createTenantSupabaseClient>>;

function normaliseAuMobile(raw: string): string {
  const digits = raw.replace(/\s+/g, "").replace(/-/g, "");
  if (digits.startsWith("+61")) return digits;
  if (digits.startsWith("04")) return "+61" + digits.slice(1);
  if (digits.startsWith("614")) return "+" + digits;
  return digits;
}

export interface SendSmsResult {
  success: boolean;
  error?: string;
  status?: number;
  suppressed?: boolean;
  message_id?: string | null;
  twilio_sid?: string | null;
}

/**
 * Core SMS-sending logic, extracted from app/api/sms/send/route.ts so it can
 * be called both from that route (staff-triggered, customer detail page /
 * workshop drawer) and from the auto-order-confirmation path
 * (app/api/stripe/webhook/route.ts), without duplicating the Twilio call and
 * sms_messages bookkeeping.
 *
 * Note: the original route had an early `if (tenantId === CLASS_A_TENANT)
 * return { ok: true }` guard, copy-pasted from the billing routes (where
 * "Class A is exempt from billing checks, return a synthetic status" is
 * correct). In a SEND-an-SMS endpoint that early return doesn't skip a
 * check — it skips sending anything at all, for the only real tenant in
 * the system, silently reporting success. That guard is NOT reproduced
 * here; the only gate on sending is the real one, outboundBlock() below,
 * which already handles Class A correctly (never suppressed, per
 * lib/outbound-guard.ts's own stated design).
 */
export async function sendSms(
  supabase: TenantSupabaseClient,
  tenantId: string,
  customerId: string,
  messageBody: string,
  staffId?: string | null
): Promise<SendSmsResult> {
  const accountSid = process.env.VAULT_TWILIO_ACCOUNT_SID;
  const authToken = process.env.VAULT_TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.VAULT_TWILIO_FROM_NUMBER;

  if (!accountSid || !authToken || !fromNumber) {
    return { success: false, error: "Twilio credentials not configured", status: 500 };
  }

  const trimmedBody = messageBody.trim();
  if (!trimmedBody) {
    return { success: false, error: "Message body is required", status: 400 };
  }

  const { data: customer, error: custErr } = await supabase
    .from("customers")
    .select("id, first_name, last_name, phone")
    .eq("id", customerId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (custErr || !customer) {
    return { success: false, error: "Customer not found", status: 404 };
  }
  if (!customer.phone) {
    return { success: false, error: "Customer has no phone number on file", status: 422 };
  }

  const toNumber = normaliseAuMobile(customer.phone);

  // Outbound suppression — test tenant only (see lib/outbound-guard.ts).
  // Class A is never suppressed here, by that module's own design.
  const block = outboundBlock("sms", tenantId);
  if (block) {
    logSuppressedOutbound("sms:twilio", tenantId, { to: toNumber, body: trimmedBody.slice(0, 80) }, block);
    return { success: true, suppressed: true };
  }

  // Send via Twilio REST API
  const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const params = new URLSearchParams({ From: fromNumber, To: toNumber, Body: trimmedBody });
  const twilioRes = await fetch(twilioUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: "Basic " + Buffer.from(`${accountSid}:${authToken}`).toString("base64"),
    },
    body: params.toString(),
  });

  const twilioJson = (await twilioRes.json()) as { sid?: string; error_message?: string; message?: string };

  if (!twilioRes.ok) {
    const errMsg = twilioJson.error_message ?? twilioJson.message ?? "Twilio error";
    console.error("[sendSms] Twilio error:", twilioRes.status, errMsg);
    return { success: false, error: errMsg, status: 502 };
  }

  // Record in sms_messages
  const { data: msg, error: insertErr } = await supabase
    .from("sms_messages")
    .insert({
      tenant_id: tenantId,
      customer_id: customerId,
      direction: "out",
      body: trimmedBody,
      twilio_sid: twilioJson.sid ?? null,
      staff_id: staffId ?? null,
      sent_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (insertErr) {
    console.error("[sendSms] DB insert error:", insertErr);
    // Message was sent — still report success, just note the log failure
    return { success: true, message_id: null, twilio_sid: twilioJson.sid ?? null };
  }

  return { success: true, message_id: msg.id, twilio_sid: twilioJson.sid ?? null };
}

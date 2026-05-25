/**
 * claimSlipSender.ts — server-side only
 *
 * Generates a claim slip URL (served via /claim/[reference]) and sends
 * it to the customer via SMS through Zapier → Podium.
 *
 * Called from:
 *   - /api/orders/claim-slip  (drawer "Send Claim Slip" button)
 *   - /api/submit             (auto-send on new repair/custom_order)
 *
 * No file storage needed — the page renders on demand from Supabase data.
 */
import { SupabaseClient } from "@supabase/supabase-js";
import { Packet } from "./types";
import { formatAustralianPhone } from "./formatters";

export interface ClaimSlipResult {
  url: string;
  reference: string;
}

/**
 * Build the public claim slip URL for this packet.
 * Format: https://class-a-packet-system.vercel.app/claim/CA-20260518-0001
 */
function buildClaimSlipUrl(referenceNumber: string): string {
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ??
    "https://class-a-packet-system.vercel.app";
  return `${appUrl}/claim/${referenceNumber}`;
}

/**
 * Send the claim slip SMS via Zapier → Podium.
 */
async function sendClaimSlipSMS(
  packet: Packet,
  claimSlipUrl: string
): Promise<void> {
  const webhook = process.env.ZAPIER_CLAIM_SLIP_WEBHOOK;
  if (!webhook) {
    console.warn("[claim-slip] ZAPIER_CLAIM_SLIP_WEBHOOK not set — SMS skipped");
    return;
  }

  const customerName = packet.customer_first_name || "there";
  const phone = formatAustralianPhone(packet.customer_phone);

  const payload = {
    customer_name: customerName,
    customer_phone: phone,
    reference_number: packet.reference_number,
    claim_slip_url: claimSlipUrl,
    order_source: packet.order_source ?? "In-Store",
  };

  console.log("[claim-slip] Sending SMS via Zapier:", {
    phone,
    reference: packet.reference_number,
    url: claimSlipUrl,
  });

  const res = await fetch(webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error(`Zapier webhook returned ${res.status}`);
  }
}

/**
 * Full claim slip flow:
 * 1. Build the public URL from the reference number
 * 2. Update packet record (claim_slip_url, claim_slip_sent, claim_slip_sent_at)
 * 3. Send SMS via Zapier
 *
 * Returns the claim slip URL.
 */
export async function sendClaimSlip(
  packet: Packet,
  supabase: SupabaseClient
): Promise<ClaimSlipResult> {
  console.log("[claim-slip] Starting for packet:", packet.reference_number);

  // 1. Build URL (no file upload needed — page renders on demand)
  const url = buildClaimSlipUrl(packet.reference_number);
  console.log("[claim-slip] URL:", url);

  // 2. Update packet record
  const now = new Date().toISOString();
  const { error: updateError } = await supabase
    .from("packets")
    .update({
      claim_slip_url: url,
      claim_slip_sent: true,
      claim_slip_sent_at: now,
    })
    .eq("id", packet.id);

  if (updateError) {
    console.warn("[claim-slip] DB update failed:", updateError.message);
    // Non-fatal — proceed with SMS
  }

  // 3. Send SMS (non-fatal if it fails)
  try {
    await sendClaimSlipSMS(packet, url);
    console.log("[claim-slip] SMS sent to:", packet.customer_phone);
  } catch (smsErr) {
    console.warn("[claim-slip] SMS send failed:", smsErr);
    // Don't throw — URL is still valid even if SMS fails
  }

  return { url, reference: packet.reference_number };
}

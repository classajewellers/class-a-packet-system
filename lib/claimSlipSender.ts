/**
 * claimSlipSender.ts — server-side only
 *
 * Shared logic for generating, storing, and SMS-sending a claim slip.
 * Called from:
 *   - /api/orders/claim-slip  (drawer "Send Claim Slip" button)
 *   - /api/submit             (auto-send on new repair/custom_order)
 */
import { SupabaseClient } from "@supabase/supabase-js";
import { Packet } from "./types";
import { generateClaimSlipHTML } from "./claimSlipGenerator";
import { formatAustralianPhone } from "./formatters";

const BUCKET = "claim-slips";

export interface ClaimSlipResult {
  url: string;
  reference: string;
}

/**
 * Ensure the 'claim-slips' Supabase Storage bucket exists and is public.
 * Safe to call multiple times — no-ops if already exists.
 */
async function ensureBucket(supabase: SupabaseClient): Promise<void> {
  const { data: buckets } = await supabase.storage.listBuckets();
  const exists = (buckets ?? []).some((b) => b.id === BUCKET);
  if (!exists) {
    const { error } = await supabase.storage.createBucket(BUCKET, {
      public: true,
      allowedMimeTypes: ["text/html"],
    });
    if (error && !error.message.includes("already exists")) {
      throw new Error(`Failed to create storage bucket: ${error.message}`);
    }
  }
}

/**
 * Upload the claim slip HTML to Supabase Storage.
 * Returns the public URL.
 */
async function uploadClaimSlip(
  supabase: SupabaseClient,
  referenceNumber: string,
  html: string
): Promise<string> {
  await ensureBucket(supabase);

  const filename = `${referenceNumber}.html`;
  const blob = Buffer.from(html, "utf-8");

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(filename, blob, {
      contentType: "text/html; charset=utf-8",
      upsert: true, // overwrite on resend
    });

  if (error) {
    throw new Error(`Storage upload failed: ${error.message}`);
  }

  const { data: urlData } = supabase.storage
    .from(BUCKET)
    .getPublicUrl(filename);

  return urlData.publicUrl;
}

/**
 * Send the claim slip SMS via Zapier → Podium.
 * Fire-and-forget friendly — returns a promise but logs instead of throws.
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
 * 1. Generate HTML
 * 2. Upload to Supabase Storage
 * 3. Update packet record (claim_slip_url, claim_slip_sent, claim_slip_sent_at)
 * 4. Send SMS via Zapier
 *
 * Returns the public URL of the stored claim slip.
 */
export async function sendClaimSlip(
  packet: Packet,
  supabase: SupabaseClient
): Promise<ClaimSlipResult> {
  console.log("[claim-slip] Starting for packet:", packet.reference_number);

  // 1. Generate HTML
  const html = generateClaimSlipHTML(packet);

  // 2. Upload to storage
  const url = await uploadClaimSlip(supabase, packet.reference_number, html);
  console.log("[claim-slip] Uploaded to:", url);

  // 3. Update packet record
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

  // 4. Send SMS (non-fatal if it fails)
  try {
    await sendClaimSlipSMS(packet, url);
    console.log("[claim-slip] SMS sent to:", packet.customer_phone);
  } catch (smsErr) {
    console.warn("[claim-slip] SMS send failed:", smsErr);
    // Don't throw — URL is already stored, which is the primary value
  }

  return { url, reference: packet.reference_number };
}

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { generateReferenceNumber, generateRepairTrackerNumber } from "@/lib/referenceNumber";
import { parseCurrency, packetTypeLabel, formatDateAU, formatAustralianPhone } from "@/lib/formatters";
import { PacketFormData, Packet, SubmitResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<NextResponse<SubmitResponse>> {
  console.log("[submit] Starting order submission");

  // ── 1. Parse body ──────────────────────────────────────────────────────────
  let body: { formData: PacketFormData };
  try {
    body = await req.json();
  } catch {
    console.error("[submit] Failed to parse request body");
    return NextResponse.json(
      { packet: null as unknown as Packet, results: {}, errors: { parse: "Invalid request body" } } as unknown as SubmitResponse,
      { status: 400 }
    );
  }

  const { formData } = body;
  console.log("[submit] Packet type:", formData.packet_type, "| Customer:", formData.customer_email);

  // ── 2. Generate reference number ───────────────────────────────────────────
  let referenceNumber: string;
  try {
    referenceNumber = await generateReferenceNumber(undefined, formData.packet_type);
    console.log("[submit] Generated reference:", referenceNumber);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[submit] Reference generation failed:", msg);
    return NextResponse.json(
      { packet: null as unknown as Packet, results: {}, errors: { reference: msg } } as unknown as SubmitResponse,
      { status: 500 }
    );
  }

  const totalCharges = parseCurrency(formData.total_charges);
  const deposit      = parseCurrency(formData.deposit);
  const balance      = Math.max(0, totalCharges - deposit);

  const repairTrackerNumber =
    formData.packet_type === "repair"
      ? generateRepairTrackerNumber(referenceNumber)
      : null;

  // Extra packet_data for type-specific fields
  const packetData: Record<string, unknown> = {};
  if (formData.packet_type === "layby") {
    packetData.layby_schedule      = formData.layby_schedule;
    packetData.number_of_payments  = formData.number_of_payments;
    packetData.terms_accepted      = formData.terms_accepted;
  }
  if (formData.packet_type === "client_intake") {
    packetData.budget_range          = formData.budget_range;
    packetData.jewellery_interests   = formData.jewellery_interests;
    packetData.consent_to_marketing  = formData.consent_to_marketing;
  }

  // ── 3. Build insert payload ────────────────────────────────────────────────
  const insertData: Record<string, unknown> = {
    reference_number:   referenceNumber,
    packet_type:        formData.packet_type,
    customer_first_name: formData.customer_first_name || null,
    customer_last_name:  formData.customer_last_name  || null,
    customer_email:      formData.customer_email      || null,
    customer_phone:      formData.customer_phone      || null,
    customer_street:     formData.customer_street     || null,
    customer_suburb:     formData.customer_suburb     || null,
    customer_state:      formData.customer_state      || null,
    customer_postcode:   formData.customer_postcode   || null,
    customer_number:     formData.customer_number     || null,
    stock_number:        formData.stock_number        || null,
    valuation_required:  formData.valuation_required,
    contact_preference:  formData.contact_preference.length ? formData.contact_preference : null,
    articles:            formData.articles            || null,
    instructions:        formData.instructions        || null,
    total_charges:       totalCharges                 || null,
    deposit:             deposit                      || null,
    balance:             balance                      || null,
    in_date:             formData.in_date             || null,
    due_date:            formData.due_date            || null,
    referral_source:     formData.referral_source     || null,
    occasion:            formData.occasion            || null,
    staff_member:        formData.staff_member        || null,
    from_date:           formData.from_date           || null,
    repair_tracker_number: repairTrackerNumber,
    packet_data:         Object.keys(packetData).length ? packetData : null,
  };

  // Gift & Delivery (repair / custom_order)
  if (formData.packet_type === "repair" || formData.packet_type === "custom_order") {
    insertData.gift_wrapping  = formData.gift_wrapping;
    insertData.delivery_method = formData.delivery_method || "Pickup";
  }

  // Online order-specific columns
  if (formData.packet_type === "online_order") {
    insertData.delivery_method       = null;                          // prevent DEFAULT 'Pickup' — resolveDelivery falls through to shipping_method
    insertData.order_number          = formData.order_number          || null;
    insertData.shipping_method       = formData.shipping_method       || null;
    insertData.shipping_address_same = formData.shipping_address_same;
    insertData.shipping_street       = formData.shipping_address_same ? null : (formData.shipping_street  || null);
    insertData.shipping_suburb       = formData.shipping_address_same ? null : (formData.shipping_suburb  || null);
    insertData.shipping_state        = formData.shipping_address_same ? null : (formData.shipping_state   || null);
    insertData.shipping_postcode     = formData.shipping_address_same ? null : (formData.shipping_postcode || null);
    insertData.items_ordered         = formData.items_ordered         || null;
    insertData.order_notes           = formData.order_notes           || null;
    insertData.tracking_number       = formData.tracking_number       || null;
    insertData.order_source          = formData.order_source          || null;
  }

  // ── 4. Insert into Supabase ────────────────────────────────────────────────
  console.log("[submit] Inserting into packets table...");
  const supabase = createServerSupabaseClient();

  const { data: insertedPacket, error: insertError } = await supabase
    .from("packets")
    .insert(insertData)
    .select()
    .single();

  if (insertError || !insertedPacket) {
    console.error("[submit] Supabase insert FAILED:", JSON.stringify({
      code:    insertError?.code,
      message: insertError?.message,
      details: insertError?.details,
      hint:    insertError?.hint,
    }));
    return NextResponse.json(
      {
        packet:  null as unknown as Packet,
        results: {},
        errors:  {
          supabase: insertError?.message ?? "Insert failed",
          code:     insertError?.code    ?? undefined,
          details:  insertError?.details ?? undefined,
          hint:     insertError?.hint    ?? undefined,
        },
      } as unknown as SubmitResponse,
      { status: 500 }
    );
  }

  console.log("[submit] Insert successful:", insertedPacket.id, insertedPacket.reference_number);
  const packet = insertedPacket as Packet;

  // ── 5. Auto-send Order Confirmation SMS for repair / custom_order ──────────
  const isAutoSendType   = packet.packet_type === "repair" || packet.packet_type === "custom_order";
  const isNotOnlineOrder = packet.packet_type !== "online_order";
  const hasPhone         = !!packet.customer_phone;
  const isNotShopify     = (packet.order_source ?? "").toLowerCase() !== "shopify";
  const shouldAutoSend   = isAutoSendType && isNotOnlineOrder && hasPhone && isNotShopify;
  const confirmWebhook   = process.env.ZAPIER_ORDER_CONFIRMATION_WEBHOOK;

  console.log("[submit] Auto-send SMS:", {
    packet_type:  packet.packet_type,
    order_source: packet.order_source ?? null,
    hasPhone,
    willSend:     shouldAutoSend && !!confirmWebhook,
  });

  if (shouldAutoSend && confirmWebhook) {
    const customerName = [packet.customer_first_name, packet.customer_last_name]
      .filter(Boolean).join(" ");
    const isInStore = packet.packet_type === "repair" || packet.packet_type === "custom_order";
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "https://class-a-packet-system.vercel.app").replace(/\/$/, "");
    const claimSlipUrl = `${appUrl}/claim/${packet.reference_number}`;
    const autoPayload = {
      order_source:     "In-Store",
      customer_name:    customerName,
      customer_phone:   formatAustralianPhone(packet.customer_phone),
      order_type:       packetTypeLabel(packet.packet_type),
      reference_number: packet.reference_number,
      due_date:         formatDateAU(packet.due_date),
      total_charges:    "",
      ...(isInStore && { claim_slip_url: claimSlipUrl }),
    };
    // Fire-and-forget — do not block submission response
    fetch(confirmWebhook, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(autoPayload),
    }).catch((err) => console.warn("[submit] Auto-send SMS failed:", err));

    // Record claim slip URL in DB for in-store orders only (fire-and-forget)
    if (isInStore) {
      supabase.from("packets").update({
        claim_slip_url:      claimSlipUrl,
        claim_slip_sent:     true,
        claim_slip_sent_at:  new Date().toISOString(),
      }).eq("id", packet.id).then(({ error }) => {
        if (error) console.warn("[submit] claim_slip_url DB update failed:", error.message);
      });
    }
  }

  // ── 6. Upsert customer record ─────────────────────────────────────────────────
  if (packet.customer_email) {
    void (async () => {
      try {
        await supabase.from("customers").upsert(
          {
            email:           packet.customer_email!.toLowerCase().trim(),
            phone:           packet.customer_phone    || null,
            first_name:      packet.customer_first_name || null,
            last_name:       packet.customer_last_name  || null,
            last_visit_date: new Date().toISOString().split("T")[0],
          },
          { onConflict: "email" }
        );
      } catch { /* ignore */ }
    })();
  }

  // ── 7. Auto-create workshop job for repair/custom_order ──────────────────────
  if (packet.packet_type === "repair" || packet.packet_type === "custom_order") {
    const initialStage = packet.packet_type === "repair" ? "precheck" : "new";
    const jobType = packet.packet_type === "repair" ? "minor" : "major";
    const { error: workshopErr } = await supabase.from("workshop_jobs").insert({
      packet_id: packet.id,
      reference_number: packet.reference_number,
      customer_surname: packet.customer_last_name ?? packet.customer_first_name ?? "Unknown",
      description: packet.articles ?? "",
      instructions: packet.instructions ?? "",
      category: packet.packet_type === "repair" ? "repair" : "other",
      job_type: jobType,
      stage: initialStage,
      due_date: packet.due_date ?? null,
      stage_changed_at: new Date().toISOString(),
    });
    if (workshopErr) {
      // workshop_jobs table may not exist yet — log but don't fail
      console.warn("[submit] Auto-create workshop job failed:", workshopErr.message);
    }
  }

  // ── 8. Mark quote as converted (if this order was created from a quote) ─────
  if (formData.from_quote_id) {
    console.log("[submit] Marking quote as converted:", formData.from_quote_id);
    const { error: quoteErr } = await supabase
      .from("quotes")
      .update({
        status:                 "converted",
        converted_to_packet_id: packet.id,
        converted_at:           new Date().toISOString(),
        packet_reference:       packet.reference_number,
      })
      .eq("id", formData.from_quote_id);
    if (quoteErr) {
      console.warn("[submit] Failed to mark quote as converted:", quoteErr.message);
    }
  }

  // ── 9. Return success ─────────────────────────────────────────────────────
  return NextResponse.json({
    packet,
    results: { supabase: "success" },
    errors:  {},
  });
}

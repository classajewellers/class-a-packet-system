import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { generateReferenceNumber, generateRepairTrackerNumber } from "@/lib/referenceNumber";
import { parseCurrency } from "@/lib/formatters";
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

  // ── 5. Mark quote as converted (if this order was created from a quote) ─────
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

  // ── 6. Return success ──────────────────────────────────────────────────────
  return NextResponse.json({
    packet,
    results: { supabase: "success" },
    errors:  {},
  });
}

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { generateReferenceNumber, generateRepairTrackerNumber } from "@/lib/referenceNumber";
import { upsertKlaviyoProfile, fireKlaviyoEvent, sendKlaviyoConfirmationEmail } from "@/lib/klaviyo";
import { sendPodiumSMS } from "@/lib/podium";
import { appendToSheet } from "@/lib/sheets";
import { parseCurrency } from "@/lib/formatters";
import { PacketFormData, Packet, SubmitResponse } from "@/lib/types";

export async function POST(req: NextRequest): Promise<NextResponse<SubmitResponse>> {
  let body: { formData: PacketFormData };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { packet: null as unknown as Packet, results: {}, errors: { parse: "Invalid request body" } } as unknown as SubmitResponse,
      { status: 400 }
    );
  }

  const { formData } = body;

  // ─── 1. Generate reference number ─────────────────────────────────────────
  let referenceNumber: string;
  try {
    referenceNumber = await generateReferenceNumber(undefined, formData.packet_type);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { packet: null as unknown as Packet, results: {}, errors: { reference: msg } } as unknown as SubmitResponse,
      { status: 500 }
    );
  }

  const totalCharges = parseCurrency(formData.total_charges);
  const deposit = parseCurrency(formData.deposit);
  const balance = Math.max(0, totalCharges - deposit);

  const repairTrackerNumber =
    formData.packet_type === "repair"
      ? generateRepairTrackerNumber(referenceNumber)
      : null;

  // Extra packet_data for type-specific fields
  const packetData: Record<string, unknown> = {};
  if (formData.packet_type === "layby") {
    packetData.layby_schedule = formData.layby_schedule;
    packetData.number_of_payments = formData.number_of_payments;
    packetData.terms_accepted = formData.terms_accepted;
  }
  if (formData.packet_type === "client_intake") {
    packetData.budget_range = formData.budget_range;
    packetData.jewellery_interests = formData.jewellery_interests;
    packetData.consent_to_marketing = formData.consent_to_marketing;
  }

  // ─── 2. Insert into Supabase (synchronous — must succeed) ─────────────────
  const supabase = createServiceClient();

  const insertData: Record<string, unknown> = {
    reference_number: referenceNumber,
    packet_type: formData.packet_type,
    customer_first_name: formData.customer_first_name || null,
    customer_last_name: formData.customer_last_name || null,
    customer_email: formData.customer_email || null,
    customer_phone: formData.customer_phone || null,
    customer_street: formData.customer_street || null,
    customer_suburb: formData.customer_suburb || null,
    customer_state: formData.customer_state || null,
    customer_postcode: formData.customer_postcode || null,
    customer_number: formData.customer_number || null,
    stock_number: formData.stock_number || null,
    valuation_required: formData.valuation_required,
    contact_preference: formData.contact_preference.length ? formData.contact_preference : null,
    articles: formData.articles || null,
    instructions: formData.instructions || null,
    total_charges: totalCharges || null,
    deposit: deposit || null,
    balance: balance || null,
    in_date: formData.in_date || null,
    due_date: formData.due_date || null,
    referral_source: formData.referral_source || null,
    occasion: formData.occasion || null,
    staff_member: formData.staff_member || null,
    from_date: formData.from_date || null,
    repair_tracker_number: repairTrackerNumber,
    packet_data: Object.keys(packetData).length ? packetData : null,
  };

  // Online order-specific columns
  if (formData.packet_type === "online_order") {
    insertData.order_number = formData.order_number || null;
    insertData.shipping_method = formData.shipping_method || null;
    insertData.shipping_address_same = formData.shipping_address_same;
    insertData.shipping_street = formData.shipping_address_same ? null : (formData.shipping_street || null);
    insertData.shipping_suburb = formData.shipping_address_same ? null : (formData.shipping_suburb || null);
    insertData.shipping_state = formData.shipping_address_same ? null : (formData.shipping_state || null);
    insertData.shipping_postcode = formData.shipping_address_same ? null : (formData.shipping_postcode || null);
    insertData.items_ordered = formData.items_ordered || null;
    insertData.order_notes = formData.order_notes || null;
    insertData.tracking_number = formData.tracking_number || null;
    insertData.order_source = formData.order_source || null;
  }

  const { data: insertedPacket, error: insertError } = await supabase
    .from("packets")
    .insert(insertData)
    .select()
    .single();

  if (insertError || !insertedPacket) {
    return NextResponse.json(
      {
        packet: null as unknown as Packet,
        results: {},
        errors: { supabase: insertError?.message ?? "Insert failed" },
      } as unknown as SubmitResponse,
      { status: 500 }
    );
  }

  const packet = insertedPacket as Packet;

  // ─── 3. Fire 4 outputs in parallel ────────────────────────────────────────
  const [klaviyoResult, emailResult, smsResult, sheetsResult] =
    await Promise.allSettled([
      upsertKlaviyoProfile(packet).then(() => fireKlaviyoEvent(packet)),
      sendKlaviyoConfirmationEmail(packet),
      sendPodiumSMS(packet),
      appendToSheet(packet),
    ]);

  const klaviyoOk = klaviyoResult.status === "fulfilled";
  const emailOk = emailResult.status === "fulfilled";
  const smsOk = smsResult.status === "fulfilled";
  const sheetsOk = sheetsResult.status === "fulfilled";

  // ─── 4. Update status flags ───────────────────────────────────────────────
  await supabase
    .from("packets")
    .update({
      klaviyo_synced: klaviyoOk,
      email_sent: emailOk,
      sms_sent: smsOk,
      sheets_logged: sheetsOk,
    })
    .eq("id", packet.id);

  const { data: updatedPacket } = await supabase
    .from("packets")
    .select()
    .eq("id", packet.id)
    .single();

  const errors: Record<string, string> = {};
  if (!klaviyoOk) errors.klaviyo = (klaviyoResult as PromiseRejectedResult).reason?.message ?? "Failed";
  if (!emailOk) errors.email = (emailResult as PromiseRejectedResult).reason?.message ?? "Failed";
  if (!smsOk) errors.sms = (smsResult as PromiseRejectedResult).reason?.message ?? "Failed";
  if (!sheetsOk) errors.sheets = (sheetsResult as PromiseRejectedResult).reason?.message ?? "Failed";

  return NextResponse.json({
    packet: (updatedPacket ?? packet) as Packet,
    results: {
      supabase: "success",
      klaviyo: klaviyoOk ? "success" : "failed",
      email: emailOk ? "success" : "failed",
      sms: smsOk ? "success" : "failed",
      sheets: sheetsOk ? "success" : "failed",
    },
    errors,
  });
}

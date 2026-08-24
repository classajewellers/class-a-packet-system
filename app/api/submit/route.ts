import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";
import { generateReferenceNumber, generateRepairTrackerNumber } from "@/lib/referenceNumber";
import { parseCurrency } from "@/lib/formatters";
import { fireOrderConfirmationZap } from "@/lib/zapier";
import { PacketFormData, Packet, SubmitResponse } from "@/lib/types";
import { deriveJobType } from "@/lib/deriveJobType";

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

  const tenantId = req.headers.get('x-tenant-id') ?? '';

  // ── 2. Generate reference number ───────────────────────────────────────────
  let referenceNumber: string;
  try {
    referenceNumber = await generateReferenceNumber(tenantId, undefined, formData.packet_type);
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
    job_type:           deriveJobType(undefined, formData.packet_type),
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
    insertData.gift_wrapping   = formData.gift_wrapping;
    insertData.delivery_method = formData.delivery_method || "Pickup";
    insertData.carat_weight    = formData.carat_weight ? parseFloat(formData.carat_weight) || null : null;
    insertData.metal_colour    = formData.metal_colour    || null;
  }
  if (formData.packet_type === "repair") {
    insertData.arms_tracker_number = formData.arms_tracker_number || null;
    insertData.job_complexity = formData.job_complexity || "Standard";
  }
  if (formData.packet_type === "custom_order") {
    insertData.cad_required = formData.cad_required ?? false;
    insertData.manufacture_type = formData.manufacture_type || "Fully Finished";
  }
  // Workshop scheduling — save for repair and custom_order
  if (formData.packet_type === "repair" || formData.packet_type === "custom_order") {
    insertData.workshop_due_date = formData.workshop_due_date || null;
    insertData.workshop_due_date_overridden = formData.workshop_due_date_overridden ?? false;
  }

  // Online order-specific columns
  if (formData.packet_type === "online_order") {
    insertData.delivery_method       = null;                          // prevent DEFAULT 'Pickup' — resolveDelivery falls through to shipping_method
    insertData.order_number          = formData.order_number          || null;
    insertData.shipping_method       = formData.shipping_method       || null;
    insertData.carat_weight          = formData.carat_weight ? parseFloat(formData.carat_weight) || null : null;
    insertData.metal_colour          = formData.metal_colour          || null;
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

  // ── 4. Resolve tenant + customer BEFORE inserting packet ─────────────────
  console.log("[submit] Resolving tenant and customer...");
  insertData.tenant_id = tenantId;
  const supabase = await createTenantSupabaseClient(tenantId);

  // Upsert customer first so packets.customer_id is populated from day one
  let customerId: string | null = null;
  if (formData.customer_email) {
    try {
      const { data: cRow } = await supabase
        .from("customers")
        .upsert(
          {
            email:           formData.customer_email.toLowerCase().trim(),
            phone:           formData.customer_phone      || null,
            first_name:      formData.customer_first_name || null,
            last_name:       formData.customer_last_name  || null,
            last_visit_date: new Date().toISOString().split("T")[0],
            tenant_id:       tenantId,
          },
          { onConflict: "email" }
        )
        .select("id")
        .single();
      customerId = cRow?.id ?? null;
      console.log("[submit] Customer resolved → id:", customerId);
    } catch (err) {
      console.warn("[submit] Customer upsert failed:", err instanceof Error ? err.message : String(err));
    }
  }
  insertData.customer_id = customerId;

  // Auto-flag for valuation when order value ≥ $3,000
  if (totalCharges >= 3000) {
    insertData.workshop_needs_valuation = true;
  }

  // ── 5. Insert packet ───────────────────────────────────────────────────────
  console.log("[submit] Inserting into packets table...");

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

  // ── 6. Zap 1 — Order Confirmation SMS (repair / custom_order only) ──────────
  const isOrderConfirmType = packet.packet_type === "repair" || packet.packet_type === "custom_order";
  if (isOrderConfirmType) {
    // fire-and-forget; returns null from formatAustralianPhone if no valid mobile
    fireOrderConfirmationZap(packet);

    // Record claim slip URL in DB (fire-and-forget)
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "https://jewelleryvault.com.au").replace(/\/$/, "");
    const claimSlipUrl = `${appUrl}/claim/${packet.reference_number}`;
    supabase.from("packets").update({
      claim_slip_url:     claimSlipUrl,
      claim_slip_sent:    true,
      claim_slip_sent_at: new Date().toISOString(),
    }).eq("id", packet.id).then(({ error }) => {
      if (error) console.warn("[submit] claim_slip_url DB update failed:", error.message);
    });
  }

  // ── 7. Mark quote as converted (if this order was created from a quote) ─────
  if (formData.from_quote_id) {
    console.log("[submit] Marking quote as converted:", formData.from_quote_id);
    const { data: quoteRow, error: quoteErr } = await supabase
      .from("quotes")
      .update({
        status:                 "converted",
        converted_to_packet_id: packet.id,
        converted_at:           new Date().toISOString(),
        packet_reference:       packet.reference_number,
      })
      .eq("id", formData.from_quote_id)
      .select("quote_builder_data")
      .single();
    if (quoteErr) {
      console.warn("[submit] Failed to mark quote as converted:", quoteErr.message);
    }

    // ── 8a. Generate charm purchase orders for non-stock charms (fire-and-forget)
    void (async () => {
      try {
        const qbd = quoteRow?.quote_builder_data as Record<string, unknown> | null;
        const charmItems = Array.isArray(qbd?.charm_items) ? qbd.charm_items as Array<{ config_id?: string }> : [];
        if (!charmItems.length) return;

        const METAL_SUFFIX: Record<string, string> = {
          "9ct_yellow": "9YG", "9ct_white": "9WG",
          "18ct_yellow": "18YG", "18ct_white": "18WG",
        };

        for (const ci of charmItems) {
          if (!ci.config_id) continue;
          const { data: config } = await supabase
            .from("charm_necklace_configs")
            .select("*")
            .eq("id", ci.config_id)
            .eq("tenant_id", tenantId)
            .single();
          if (!config) continue;

          type SelectedCharm = { component_id: string; name: string; supplier_code: string | null; cost: number | null; from_stock: boolean };
          const selectedCharms: SelectedCharm[] = Array.isArray(config.selected_charms) ? config.selected_charms as SelectedCharm[] : [];
          const toOrder = selectedCharms.filter(c => !c.from_stock);
          if (!toOrder.length) continue;

          const metalSuffix = METAL_SUFFIX[config.metal] ?? config.metal;
          const poItems = toOrder.map(c => ({
            supplier_code: c.supplier_code ? `${c.supplier_code}-${metalSuffix}` : null,
            name: c.name, metal: config.metal, qty: 1, unit_cost: c.cost ?? 0,
          }));
          const totalCost = poItems.reduce((sum, i) => sum + i.unit_cost, 0);

          const now = new Date();
          const dateStr = now.toISOString().split("T")[0];
          const datePart = dateStr.replace(/-/g, "");
          const { count } = await supabase
            .from("charm_purchase_orders")
            .select("id", { count: "exact", head: true })
            .eq("tenant_id", tenantId)
            .gte("created_at", `${dateStr}T00:00:00Z`);
          const seq = String((count ?? 0) + 1).padStart(4, "0");

          await supabase.from("charm_purchase_orders").insert({
            tenant_id: tenantId,
            order_reference: `PO-${datePart}-${seq}`,
            quote_id: formData.from_quote_id,
            charm_necklace_config_id: config.id,
            supplier: "McCaskills",
            status: "pending",
            items: poItems,
            total_cost: totalCost,
            notes: `Auto-generated on quote conversion — ${packet.reference_number}`,
          });
          await supabase.from("charm_necklace_configs")
            .update({ purchase_order_generated: true, updated_at: now.toISOString() })
            .eq("id", config.id);
        }
      } catch (err) {
        console.warn("[submit] Charm PO generation failed:", err instanceof Error ? err.message : String(err));
      }
    })();
  }

  // ── 8. Return success ─────────────────────────────────────────────────────
  return NextResponse.json({
    packet,
    results: { supabase: "success" },
    errors:  {},
  });
}

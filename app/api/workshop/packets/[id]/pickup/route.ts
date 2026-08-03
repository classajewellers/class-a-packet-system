import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

// POST /api/workshop/packets/:id/pickup
// Fulfils a local-pickup online order in Shopify, then marks the Vault packet as Collected.
// Returns an error (and leaves Vault status unchanged) if the Shopify call fails.
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  if (!tenantId) return NextResponse.json({ error: "x-tenant-id required" }, { status: 400 });

  const actorName = req.headers.get("x-actor-name") ?? null;

  try {
    const supabase = await createTenantSupabaseClient(tenantId);

    // 1. Fetch the packet — verify it's a pickup order that hasn't been fulfilled yet
    const { data: packet, error: fetchErr } = await supabase
      .from("packets")
      .select("id, delivery_method, status, shopify_order_id, shopify_fulfillment_id, job_type")
      .eq("id", params.id)
      .eq("tenant_id", tenantId)
      .single();

    if (fetchErr || !packet) {
      return NextResponse.json({ error: "Packet not found" }, { status: 404 });
    }
    if (packet.delivery_method !== "pickup") {
      return NextResponse.json({ error: "Not a pickup order" }, { status: 400 });
    }
    if (packet.status === "collected") {
      return NextResponse.json({ error: "Already collected" }, { status: 409 });
    }
    if (packet.shopify_fulfillment_id) {
      return NextResponse.json({ error: "Already fulfilled in Shopify" }, { status: 409 });
    }

    // 2. Verify Shopify credentials are present
    const domain = process.env.SHOPIFY_STORE_DOMAIN;
    const token  = process.env.SHOPIFY_ADMIN_API_TOKEN;

    if (!domain || !token) {
      return NextResponse.json({
        error: "Shopify Admin API is not configured. Set SHOPIFY_STORE_DOMAIN and SHOPIFY_ADMIN_API_TOKEN in Vercel environment variables with write_fulfillments scope.",
      }, { status: 503 });
    }

    if (!packet.shopify_order_id) {
      return NextResponse.json({
        error: "No Shopify order ID stored for this packet. Orders created before this feature was deployed cannot be auto-fulfilled — mark it as Collected manually and fulfil in Shopify directly.",
      }, { status: 422 });
    }

    const shopifyHeaders = {
      "X-Shopify-Access-Token": token,
      "Content-Type": "application/json",
    };

    // 3. Get fulfillment orders for this Shopify order
    const foRes = await fetch(
      `https://${domain}/admin/api/2024-01/orders/${packet.shopify_order_id}/fulfillment_orders.json`,
      { headers: shopifyHeaders, cache: "no-store" }
    );

    if (!foRes.ok) {
      const body = await foRes.text();
      return NextResponse.json({
        error: `Shopify returned ${foRes.status} when fetching fulfillment orders: ${body.slice(0, 300)}`,
      }, { status: 502 });
    }

    const foJson = await foRes.json() as {
      fulfillment_orders: Array<{ id: number; status: string }>;
    };

    const openFOs = (foJson.fulfillment_orders ?? []).filter(
      fo => fo.status === "open" || fo.status === "in_progress"
    );

    if (openFOs.length === 0) {
      return NextResponse.json({
        error: "No open fulfillment orders found on this Shopify order — it may already be fulfilled. Check Shopify and mark as Collected here manually.",
      }, { status: 422 });
    }

    // 4. Create fulfillment in Shopify
    const fulfillRes = await fetch(
      `https://${domain}/admin/api/2024-01/fulfillments.json`,
      {
        method: "POST",
        headers: shopifyHeaders,
        cache: "no-store",
        body: JSON.stringify({
          fulfillment: {
            line_items_by_fulfillment_order: openFOs.map(fo => ({
              fulfillment_order_id: fo.id,
            })),
            notify_customer: false,
          },
        }),
      }
    );

    if (!fulfillRes.ok) {
      const body = await fulfillRes.text();
      return NextResponse.json({
        error: `Shopify fulfillment failed (${fulfillRes.status}): ${body.slice(0, 400)}`,
      }, { status: 502 });
    }

    const fulfillJson = await fulfillRes.json() as {
      fulfillment?: { id: number; status: string };
    };
    const shopifyFulfillmentId = fulfillJson.fulfillment?.id
      ? String(fulfillJson.fulfillment.id)
      : null;

    // 5. Update Vault: mark as collected and store the fulfillment ID
    // Only do this AFTER Shopify confirms success.
    const { data: updated, error: updateErr } = await supabase
      .from("packets")
      .update({
        status:                 "collected",
        collected_at:           new Date().toISOString(),
        status_updated_at:      new Date().toISOString(),
        shopify_fulfillment_id: shopifyFulfillmentId,
        blocked_reason:         null,
        blocked_note:           null,
        blocked_at:             null,
      })
      .eq("id", params.id)
      .eq("tenant_id", tenantId)
      .select()
      .single();

    if (updateErr || !updated) {
      // Shopify was fulfilled but Vault update failed — surface this explicitly
      return NextResponse.json({
        error: `Shopify fulfilled successfully (fulfillment ID: ${shopifyFulfillmentId}) but Vault status update failed: ${updateErr?.message ?? "unknown"}. Please mark as Collected manually.`,
        shopify_fulfillment_id: shopifyFulfillmentId,
      }, { status: 500 });
    }

    // 6. Log the pickup action
    const { error: logErr } = await supabase.from("packet_activity_log").insert({
      packet_id:  params.id,
      tenant_id:  tenantId,
      event_type: "shopify_pickup",
      old_value:  { status: packet.status },
      new_value:  {
        status:                 "collected",
        shopify_fulfillment_id: shopifyFulfillmentId,
        actor_name:             actorName,
      },
    });

    if (logErr) {
      // Non-fatal — packet is already marked collected
      console.error("[pickup] activity log insert failed:", logErr.message);
    }

    return NextResponse.json({ packet: updated });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

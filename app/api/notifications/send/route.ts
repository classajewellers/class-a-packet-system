import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { packetTypeLabel, formatDateAU } from "@/lib/formatters";

export const dynamic = "force-dynamic";

type Template = "order_confirmation" | "ready_for_pickup";
type Channel  = "sms" | "email";

function formatCurrency(n: number | null | undefined): string {
  if (n == null) return "";
  return n.toLocaleString("en-AU", { style: "currency", currency: "AUD", minimumFractionDigits: 2 });
}

function webhookUrl(template: Template, channel: Channel): string | null {
  if (channel === "sms") {
    if (template === "order_confirmation") return process.env.ZAPIER_ORDER_CONFIRMATION_WEBHOOK ?? null;
    if (template === "ready_for_pickup")   return process.env.ZAPIER_READY_FOR_PICKUP_WEBHOOK   ?? null;
  }
  if (channel === "email") {
    if (template === "order_confirmation") return process.env.ZAPIER_ORDER_CONFIRMATION_EMAIL_WEBHOOK ?? null;
    if (template === "ready_for_pickup")   return process.env.ZAPIER_READY_FOR_PICKUP_EMAIL_WEBHOOK   ?? null;
  }
  return null;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: { packet_id: string; template: Template; channel?: Channel };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { packet_id, template, channel = "sms" } = body;

  if (!packet_id || !template) {
    return NextResponse.json({ error: "Missing packet_id or template" }, { status: 400 });
  }

  // ── Fetch packet ────────────────────────────────────────────────────────────
  const supabase = createServerSupabaseClient();
  const { data: packet, error: fetchError } = await supabase
    .from("packets")
    .select("*")
    .eq("id", packet_id)
    .single();

  if (fetchError || !packet) {
    return NextResponse.json({ error: fetchError?.message ?? "Packet not found" }, { status: 404 });
  }

  // ── Resolve webhook URL ─────────────────────────────────────────────────────
  const url = webhookUrl(template, channel);
  if (!url) {
    return NextResponse.json(
      { error: `Zapier webhook URL not configured for template: ${template}, channel: ${channel}` },
      { status: 500 }
    );
  }

  // ── Build payload ───────────────────────────────────────────────────────────
  const customerName = [packet.customer_first_name, packet.customer_last_name]
    .filter(Boolean)
    .join(" ");

  const payload = {
    order_source:     packet.order_source ?? "In-Store",
    customer_name:    customerName,
    customer_phone:   packet.customer_phone  ?? "",
    customer_email:   packet.customer_email  ?? "",
    order_type:       packetTypeLabel(packet.packet_type),
    articles:         packet.articles        ?? "",
    instructions:     packet.instructions    ?? "",
    reference_number: packet.reference_number,
    due_date:         formatDateAU(packet.due_date),
    total_charges:    formatCurrency(packet.total_charges),
  };

  // ── Fire webhook ────────────────────────────────────────────────────────────
  let zapRes: Response;
  try {
    zapRes = await fetch(url, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(payload),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Network error";
    console.error("[notifications/send] Zapier fetch failed:", msg);
    return NextResponse.json({ error: `Failed to reach Zapier: ${msg}` }, { status: 502 });
  }

  if (!zapRes.ok) {
    const text = await zapRes.text().catch(() => "");
    console.error("[notifications/send] Zapier returned non-OK:", zapRes.status, text);
    return NextResponse.json(
      { error: `Zapier responded with ${zapRes.status}` },
      { status: 502 }
    );
  }

  // ── Update packet: track send in packet_data ────────────────────────────────
  const nowISO = new Date().toISOString();
  const existingData = (packet.packet_data as Record<string, unknown>) ?? {};
  const dataUpdate: Record<string, unknown> = { ...existingData };

  if (channel === "sms") {
    dataUpdate.last_sms_sent = nowISO;
    await supabase
      .from("packets")
      .update({ sms_sent: true, packet_data: dataUpdate })
      .eq("id", packet_id);
  } else {
    dataUpdate.last_email_sent = nowISO;
    await supabase
      .from("packets")
      .update({ packet_data: dataUpdate })
      .eq("id", packet_id);
  }

  return NextResponse.json({ success: true, template, channel, sent_at: nowISO });
}

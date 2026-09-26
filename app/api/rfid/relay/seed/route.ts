import { createHash, randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireManager } from "@/lib/require-auth";
import { printRelayEnabled, relaySecret, signRelayBody } from "@/lib/rfid-relay";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// POST /api/rfid/relay/seed
// Manager-only. Mints a per-printer Weblink token, stores the hash, and
// tells the relay the serial from the latest printer check. 404 while the
// feature flag is off. Does not change the printer.
export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!printRelayEnabled()) {
    return NextResponse.json({ error: "Print relay is off" }, { status: 404 });
  }
  const auth = await requireManager(req);
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => ({})) as { printer_id?: string };
  if (!body.printer_id) return NextResponse.json({ error: "printer_id required" }, { status: 400 });

  const relayUrl = (process.env.RFID_RELAY_URL ?? "").replace(/\/$/, "");
  const secret = relaySecret();
  if (!relayUrl || !secret) {
    return NextResponse.json({ error: "RFID_RELAY_URL or RFID_RELAY_HMAC_SECRET is not set" }, { status: 503 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const { data: printer, error } = await supabase
    .from("rfid_printers")
    .select("id, last_check, tenant_id")
    .eq("id", body.printer_id)
    .eq("tenant_id", auth.ctx.tenantId)
    .maybeSingle();
  if (error && /last_check|column/i.test(error.message)) {
    return NextResponse.json(
      { error: "Migration 174_rfid_printer_check_and_relay.sql has not been applied." },
      { status: 503 },
    );
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!printer) return NextResponse.json({ error: "Printer not found" }, { status: 404 });

  const summary = (printer.last_check as { summary?: { serial?: string } } | null)?.summary;
  const serial = summary?.serial?.trim() ?? "";
  if (!serial) {
    return NextResponse.json(
      { error: "Run a printer check first so the printer serial is known." },
      { status: 422 },
    );
  }

  const token = randomBytes(24).toString("hex");
  const payload = JSON.stringify({ printer_id: printer.id, token, serial });
  const timestamp = String(Date.now());
  const res = await fetch(`${relayUrl}/admin/printers`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-relay-timestamp": timestamp,
      "x-relay-signature": signRelayBody(secret, timestamp, payload),
    },
    body: payload,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return NextResponse.json({ error: `Relay seed failed: HTTP ${res.status} ${text}`.trim() }, { status: 502 });
  }

  const hash = createHash("sha256").update(token).digest("hex");
  const { error: saveErr } = await supabase
    .from("rfid_printers")
    .update({ relay_token_hash: hash, relay_enabled: true })
    .eq("id", printer.id)
    .eq("tenant_id", auth.ctx.tenantId);
  if (saveErr) {
    const missing = /relay_token_hash|relay_enabled|column/i.test(saveErr.message);
    return NextResponse.json(
      { error: missing ? "Migration 174_rfid_printer_check_and_relay.sql has not been applied." : saveErr.message },
      { status: missing ? 503 : 500 },
    );
  }

  const host = new URL(relayUrl).host;
  return NextResponse.json({
    token,
    relay_enabled: true,
    url: `wss://${host}/printer/${token}`,
  });
}

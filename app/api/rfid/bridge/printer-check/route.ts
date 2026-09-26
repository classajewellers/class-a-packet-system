import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { validateBridgeAuth } from "@/lib/rfid-bridge-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

// POST /api/rfid/bridge/printer-check
// The bridge posts a read-only getvar report. Stored as JSON on the printer.
// Requires migration 174 (last_check, head_dpi). This route does not apply it.
export async function POST(req: NextRequest): Promise<NextResponse> {
  const identity = await validateBridgeAuth(req.headers.get("authorization"));
  if (!identity) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!identity.printerId) {
    return NextResponse.json({ error: "This bridge is not linked to a printer" }, { status: 422 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || !body.summary || typeof body.summary !== "object") {
    return NextResponse.json({ error: "Printer check report is missing" }, { status: 400 });
  }

  const summary = body.summary as { dpi?: unknown };
  const dpi = typeof summary.dpi === "number" && Number.isFinite(summary.dpi) ? Math.round(summary.dpi) : null;
  const report = {
    checked_at: typeof body.checked_at === "string" ? body.checked_at : new Date().toISOString(),
    printer: body.printer ?? null,
    getvars: body.getvars ?? {},
    summary: body.summary,
    bridge_overrides: body.bridge_overrides ?? {},
  };

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { error } = await supabase
    .from("rfid_printers")
    .update({
      last_check: report,
      head_dpi: dpi,
      last_seen_at: report.checked_at,
    })
    .eq("id", identity.printerId)
    .eq("tenant_id", identity.tenantId);

  if (error) {
    const missing = /last_check|head_dpi|column/i.test(error.message);
    return NextResponse.json(
      {
        error: missing
          ? "Printer check storage is not on this database yet. Migration 174_rfid_printer_check_and_relay.sql has not been applied."
          : error.message,
      },
      { status: missing ? 503 : 500 },
    );
  }

  return NextResponse.json({ ok: true, head_dpi: dpi });
}

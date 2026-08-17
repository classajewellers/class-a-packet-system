import { NextRequest, NextResponse } from "next/server";
import { randomBytes, createHash } from "crypto";
import { createTenantSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// POST /api/rfid/admin/setup
// Provision a printer + bridge installation for the tenant.
// Body: {
//   printer_display_name: string,
//   printer_model?: string,
//   bridge_display_name: string,
// }
// Returns: { printer, bridge, api_key } — api_key is shown ONCE, never stored.
export async function POST(req: NextRequest): Promise<NextResponse> {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  const supabase = await createTenantSupabaseClient(tenantId);

  const body = await req.json();
  const { printer_display_name, printer_model, bridge_display_name } = body;

  if (!printer_display_name || !bridge_display_name) {
    return NextResponse.json(
      { error: "printer_display_name and bridge_display_name are required" },
      { status: 400 }
    );
  }

  // Create the printer
  const { data: printer, error: printerErr } = await supabase
    .from("rfid_printers")
    .insert({
      tenant_id:    tenantId,
      display_name: printer_display_name,
      model:        printer_model ?? "Zebra ZD621R",
      capability:   "rfid",
      is_active:    true,
    })
    .select("id, display_name, model")
    .single();

  if (printerErr || !printer) {
    return NextResponse.json({ error: printerErr?.message ?? "Failed to create printer" }, { status: 500 });
  }

  // Generate a raw API key (shown once to the user, never stored)
  const rawApiKey = randomBytes(32).toString("hex"); // 64 hex chars
  const apiKeyHash = createHash("sha256").update(rawApiKey).digest("hex");

  // Create the bridge installation
  const { data: bridge, error: bridgeErr } = await supabase
    .from("rfid_bridge_installations")
    .insert({
      tenant_id:    tenantId,
      display_name: bridge_display_name,
      api_key_hash: apiKeyHash,
      printer_id:   printer.id,
      is_active:    true,
    })
    .select("id, display_name, printer_id, is_active")
    .single();

  if (bridgeErr || !bridge) {
    await supabase.from("rfid_printers").delete().eq("id", printer.id);
    return NextResponse.json({ error: bridgeErr?.message ?? "Failed to create bridge" }, { status: 500 });
  }

  return NextResponse.json({ printer, bridge, api_key: rawApiKey }, { status: 201 });
}

// DELETE /api/rfid/admin/setup
// Deactivate a printer or bridge by ID.
// Query: ?printer_id=... or ?bridge_id=...
export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  const supabase = await createTenantSupabaseClient(tenantId);
  const { searchParams } = new URL(req.url);

  const printerId = searchParams.get("printer_id");
  const bridgeId  = searchParams.get("bridge_id");

  if (printerId) {
    await supabase.from("rfid_printers").update({ is_active: false }).eq("id", printerId).eq("tenant_id", tenantId);
  }
  if (bridgeId) {
    await supabase.from("rfid_bridge_installations").update({ is_active: false }).eq("id", bridgeId).eq("tenant_id", tenantId);
  }
  if (!printerId && !bridgeId) {
    return NextResponse.json({ error: "Pass printer_id or bridge_id" }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}

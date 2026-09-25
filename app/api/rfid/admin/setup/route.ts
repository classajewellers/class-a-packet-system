import { NextRequest, NextResponse } from "next/server";
import { randomBytes, createHash } from "crypto";
import { createTenantSupabaseClient } from "@/lib/supabase-server";
import { canManage, type UserRole } from "@/lib/userTypes";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// POST /api/rfid/admin/setup
// Manager only. Raw api_key is returned once. Only the sha256 hex is stored.
//
// Create a printer and its first bridge:
//   { printer_display_name, printer_model?, bridge_display_name }
//
// Attach a bridge to a printer that already exists (does not insert a printer):
//   { printer_id, bridge_display_name }
//
// Rotate the key on a bridge. The previous key stops matching immediately:
//   { bridge_id, regenerate: true }
function mintApiKey(): { rawApiKey: string; apiKeyHash: string } {
  const rawApiKey = randomBytes(32).toString("hex");
  const apiKeyHash = createHash("sha256").update(rawApiKey).digest("hex");
  return { rawApiKey, apiKeyHash };
}

function requireManager(req: NextRequest): NextResponse | null {
  const role = req.headers.get("x-user-role");
  const known: UserRole = role === "admin" || role === "manager" ? role : null;
  if (!canManage(known)) {
    return NextResponse.json({ error: "Manager access required" }, { status: 403 });
  }
  return null;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const denied = requireManager(req);
  if (denied) return denied;

  const tenantId = req.headers.get("x-tenant-id") ?? "";
  if (!tenantId) {
    return NextResponse.json({ error: "Missing tenant" }, { status: 400 });
  }
  const supabase = await createTenantSupabaseClient(tenantId);
  const body = await req.json();

  if (body.regenerate === true) {
    const bridgeId = typeof body.bridge_id === "string" ? body.bridge_id.trim() : "";
    if (!bridgeId) {
      return NextResponse.json({ error: "bridge_id is required to regenerate a key" }, { status: 400 });
    }
    const { rawApiKey, apiKeyHash } = mintApiKey();
    const { data: bridge, error } = await supabase
      .from("rfid_bridge_installations")
      .update({ api_key_hash: apiKeyHash, updated_at: new Date().toISOString() })
      .eq("id", bridgeId)
      .eq("tenant_id", tenantId)
      .select("id, display_name, printer_id, is_active")
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!bridge) return NextResponse.json({ error: "Bridge not found" }, { status: 404 });
    return NextResponse.json({ bridge, api_key: rawApiKey });
  }

  const printerId = typeof body.printer_id === "string" ? body.printer_id.trim() : "";
  if (printerId) {
    const bridgeName = typeof body.bridge_display_name === "string" ? body.bridge_display_name.trim() : "";
    if (!bridgeName) {
      return NextResponse.json({ error: "bridge_display_name is required" }, { status: 400 });
    }

    const { data: printer, error: printerErr } = await supabase
      .from("rfid_printers")
      .select("id, display_name, model")
      .eq("id", printerId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (printerErr) return NextResponse.json({ error: printerErr.message }, { status: 500 });
    if (!printer) return NextResponse.json({ error: "Printer not found" }, { status: 404 });

    const { data: existing, error: existingErr } = await supabase
      .from("rfid_bridge_installations")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("printer_id", printerId)
      .limit(1);
    if (existingErr) return NextResponse.json({ error: existingErr.message }, { status: 500 });
    if ((existing ?? []).length > 0) {
      return NextResponse.json(
        { error: "This printer already has a bridge. Regenerate its API key instead." },
        { status: 409 }
      );
    }

    const { rawApiKey, apiKeyHash } = mintApiKey();
    const { data: bridge, error: bridgeErr } = await supabase
      .from("rfid_bridge_installations")
      .insert({
        tenant_id: tenantId,
        display_name: bridgeName,
        api_key_hash: apiKeyHash,
        printer_id: printer.id,
        is_active: true,
      })
      .select("id, display_name, printer_id, is_active")
      .single();
    if (bridgeErr || !bridge) {
      return NextResponse.json({ error: bridgeErr?.message ?? "Failed to create bridge" }, { status: 500 });
    }
    return NextResponse.json({ printer, bridge, api_key: rawApiKey }, { status: 201 });
  }

  const printerName = typeof body.printer_display_name === "string" ? body.printer_display_name.trim() : "";
  const bridgeName = typeof body.bridge_display_name === "string" ? body.bridge_display_name.trim() : "";
  const printerModel = typeof body.printer_model === "string" && body.printer_model.trim()
    ? body.printer_model.trim()
    : "Zebra ZD621R";

  if (!printerName || !bridgeName) {
    return NextResponse.json(
      { error: "printer_display_name and bridge_display_name are required" },
      { status: 400 }
    );
  }

  const { data: printer, error: printerErr } = await supabase
    .from("rfid_printers")
    .insert({
      tenant_id: tenantId,
      display_name: printerName,
      model: printerModel,
      capability: "rfid",
      is_active: true,
    })
    .select("id, display_name, model")
    .single();

  if (printerErr || !printer) {
    return NextResponse.json({ error: printerErr?.message ?? "Failed to create printer" }, { status: 500 });
  }

  const { rawApiKey, apiKeyHash } = mintApiKey();
  const { data: bridge, error: bridgeErr } = await supabase
    .from("rfid_bridge_installations")
    .insert({
      tenant_id: tenantId,
      display_name: bridgeName,
      api_key_hash: apiKeyHash,
      printer_id: printer.id,
      is_active: true,
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

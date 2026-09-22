// POST /api/inventory/suppliers/[id]/sync — dry-run parse of an uploaded
// supplier catalogue/price-list file through that supplier's connector
// (Supplier Connector Framework, VAULT_BUILD_CHECKLIST.md Phase 2.1/2.2).
//
// Mirrors the app's standard import safety pattern (preview → confirm, same
// as /api/pricing/melee-import/parse+confirm and the AI melee-extract flow):
// this route NEVER writes to pricing_melee_stones. It only parses the file
// via the supplier's connector, records a 'pending' supplier_sync_log row so
// there's a durable trail even if the manager never confirms, and returns
// the preview payload + rowIssues for the confirm step.
//
// Currently only connector_type = 'prana_csv' is implemented
// (lib/connectors/prana.ts). Any other connector_type (or null — manual/no
// connector) is rejected here; this endpoint is connector-sync only, not a
// general upload path (that's the existing Settings → Melee "Import CSV").

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { requireManager } from "@/lib/require-auth";
import { pranaConnector } from "@/lib/connectors/prana";
import { SupplierConnector } from "@/lib/connectors/types";

export const dynamic = "force-dynamic";

const CONNECTORS: Record<string, SupplierConnector> = {
  [pranaConnector.type]: pranaConnector,
};

const MAX_BYTES = 15 * 1024 * 1024;

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireManager(req);
  if (!auth.ok) return auth.response;
  const { tenantId } = auth.ctx;
  const supabase = createServerSupabaseClient();

  const { data: supplier, error: supplierErr } = await supabase
    .from("inventory_suppliers")
    .select("id, name, connector_type")
    .eq("id", params.id)
    .eq("tenant_id", tenantId)
    .single();

  if (supplierErr || !supplier) {
    return NextResponse.json({ error: "Supplier not found" }, { status: 404 });
  }
  if (!supplier.connector_type) {
    return NextResponse.json(
      { error: "This supplier has no connector configured — use Settings → Melee \"Import CSV\" for a manual upload instead." },
      { status: 422 }
    );
  }
  const connector = CONNECTORS[supplier.connector_type];
  if (!connector) {
    return NextResponse.json({ error: `Unsupported connector type: ${supplier.connector_type}` }, { status: 422 });
  }

  let file: File | null = null;
  try {
    const formData = await req.formData();
    const f = formData.get("file");
    if (f instanceof File) file = f;
  } catch {
    return NextResponse.json({ error: "Expected multipart/form-data with a 'file' field" }, { status: 400 });
  }
  if (!file) return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  if (file.size === 0) return NextResponse.json({ error: "Uploaded file is empty" }, { status: 400 });
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: `File too large (${(file.size / 1024 / 1024).toFixed(1)}MB) — max 15MB` }, { status: 400 });
  }

  const text = await file.text();
  const result = await connector.syncFromFile(text, file.name);

  // Record the attempt regardless of outcome — a durable trail even if the
  // manager closes the tab before confirming, or the parse itself fails.
  const { data: logRow, error: logErr } = await supabase
    .from("supplier_sync_log")
    .insert({
      tenant_id: tenantId,
      supplier_id: supplier.id,
      connector_type: supplier.connector_type,
      status: result.ok ? "pending" : "failed",
      rows_processed: result.rowsProcessed,
      rows_flagged: result.rowsFlagged,
      error_message: result.error ?? null,
      source_label: file.name,
      started_at: new Date().toISOString(),
      completed_at: result.ok ? null : new Date().toISOString(),
    })
    .select("id")
    .single();

  if (logErr) {
    console.error("[suppliers/sync] supplier_sync_log insert failed:", logErr.message);
  }

  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? "Sync failed", detail: result.detail }, { status: 422 });
  }

  return NextResponse.json({
    sync_log_id: logRow?.id ?? null,
    supplier_name: supplier.name,
    rows_processed: result.rowsProcessed,
    rows_flagged: result.rowsFlagged,
    detail: result.detail,
  });
}

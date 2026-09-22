// POST /api/inventory/suppliers/[id]/sync/confirm — commits a previously
// previewed supplier connector sync (see ../route.ts).
//
// Commits through the exact same tenant-wide melee-import path as the
// manual Settings → Melee "Import CSV" flow (lib/meleeImportCommit.ts) —
// melee pricing has no supplier concept, a sync just feeds the same single
// price list from a different source. Updates the supplier_sync_log row
// created by the preview step to 'succeeded'/'failed', and stamps
// inventory_suppliers.connector_last_synced_at on success.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { requireManager } from "@/lib/require-auth";
import { commitMeleeImport, MeleeGroupPayload } from "@/lib/meleeImportCommit";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireManager(req);
  if (!auth.ok) return auth.response;
  const { tenantId } = auth.ctx;
  const supabase = createServerSupabaseClient();

  const body = await req.json();
  const { sync_log_id, payload } = body as { sync_log_id?: string; payload?: { groups: MeleeGroupPayload[] } };

  if (!payload || !Array.isArray(payload.groups) || payload.groups.length === 0) {
    return NextResponse.json({ error: "payload.groups is required and must not be empty" }, { status: 400 });
  }
  for (const g of payload.groups) {
    if (!g.origin || !["natural", "lab"].includes(g.origin)) {
      return NextResponse.json({ error: "Each group's origin must be 'natural' or 'lab'" }, { status: 400 });
    }
    if (!Array.isArray(g.rows) || g.rows.length === 0) {
      return NextResponse.json({ error: `Group for origin ${g.origin} has no rows` }, { status: 400 });
    }
  }

  const { data: supplier, error: supplierErr } = await supabase
    .from("inventory_suppliers")
    .select("id, name")
    .eq("id", params.id)
    .eq("tenant_id", tenantId)
    .single();
  if (supplierErr || !supplier) {
    return NextResponse.json({ error: "Supplier not found" }, { status: 404 });
  }

  let commitResult;
  try {
    commitResult = await commitMeleeImport(supabase, tenantId, payload.groups);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Import failed";
    if (sync_log_id) {
      await supabase
        .from("supplier_sync_log")
        .update({ status: "failed", error_message: message, completed_at: new Date().toISOString() })
        .eq("id", sync_log_id)
        .eq("tenant_id", tenantId);
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const now = new Date().toISOString();

  if (sync_log_id) {
    const { error: logUpdateErr } = await supabase
      .from("supplier_sync_log")
      .update({
        status: "succeeded",
        rows_processed: commitResult.total_imported,
        completed_at: now,
      })
      .eq("id", sync_log_id)
      .eq("tenant_id", tenantId);
    if (logUpdateErr) {
      console.error("[suppliers/sync/confirm] supplier_sync_log update failed:", logUpdateErr.message);
    }
  }

  const { error: supplierUpdateErr } = await supabase
    .from("inventory_suppliers")
    .update({ connector_last_synced_at: now })
    .eq("id", supplier.id)
    .eq("tenant_id", tenantId);
  if (supplierUpdateErr) {
    console.error("[suppliers/sync/confirm] connector_last_synced_at update failed:", supplierUpdateErr.message);
  }

  return NextResponse.json({
    total_imported: commitResult.total_imported,
    groups: commitResult.groups,
    imported_at: commitResult.imported_at,
    synced_at: now,
  });
}

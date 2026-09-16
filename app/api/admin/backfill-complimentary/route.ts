// Backfill: re-derive the "articles" text for recent online orders so
// previously-dropped complimentary / free-gift line items (e.g. heirloom
// scarves) retroactively appear, flagged " — COMPLIMENTARY".
//
// Non-destructive by design:
//   • Manager/admin only (requireManager) and tenant-scoped from the session.
//   • Only online_order packets from the last `days` days (default 7).
//   • Reconstructs articles from the stored raw payload (packet_data) using the
//     SAME shared builder the webhook uses — no Shopify calls.
//   • Safety guard: only rewrites a packet whose CURRENT stored articles still
//     equal the LEGACY builder output (i.e. an untouched import). If they
//     differ, the packet was hand-edited by staff — it is reported as "skipped"
//     and left alone, so no manual edits are ever clobbered.
//   • dryRun (default true) returns the exact before/after list and changes
//     nothing. Pass { dryRun: false } to apply.
//
//   POST body: { dryRun?: boolean (default true), days?: number (default 7) }

import { NextRequest, NextResponse } from "next/server";
import { requireManager } from "@/lib/require-auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import {
  buildArticles,
  parseLineItems,
  isNativeShopifyFormat,
} from "@/lib/shopify-articles";

export const dynamic = "force-dynamic";

type PacketRow = {
  id: string;
  reference_number: string | null;
  order_number: string | null;
  articles: string | null;
  items_ordered: string | null;
  created_at: string | null;
  packet_data: Record<string, unknown> | null;
};

/** Recompute articles from a stored raw payload. `legacy` reproduces the old
 *  drop behaviour; the default produces the new flagged output. */
function articlesFromPayload(
  packetData: Record<string, unknown> | null,
  legacy: boolean
): string {
  if (!packetData || typeof packetData !== "object") return "";
  if (isNativeShopifyFormat(packetData)) {
    const lineItems = (packetData as any).line_items ?? [];
    if (!Array.isArray(lineItems)) return "";
    return buildArticles(lineItems, { legacy });
  }
  // Zapier flat blob
  return parseLineItems((packetData as any).lineItems, { legacy });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await requireManager(req);
  if (!auth.ok) return auth.response;
  const { tenantId } = auth.ctx;

  let body: { dryRun?: boolean; days?: number } = {};
  try {
    body = (await req.json()) as { dryRun?: boolean; days?: number };
  } catch {
    /* empty body → defaults */
  }
  const dryRun = body.dryRun !== false; // default TRUE — never apply unless explicitly false
  const days = Number.isFinite(body.days) && (body.days as number) > 0 ? Math.floor(body.days as number) : 7;

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("packets")
    .select("id, reference_number, order_number, articles, items_ordered, created_at, packet_data")
    .eq("tenant_id", tenantId)                 // explicit tenant guard (service role bypasses RLS)
    .eq("order_source", "Shopify")
    .gte("created_at", since)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: "Query failed", detail: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as PacketRow[];

  const willChange: Array<{
    id: string; reference_number: string | null; order_number: string | null;
    created_at: string | null; before: string; after: string;
  }> = [];
  const skippedManual: Array<{ id: string; reference_number: string | null; order_number: string | null; reason: string }> = [];
  const unchanged: Array<{ id: string; reference_number: string | null; order_number: string | null }> = [];
  const noPayload: Array<{ id: string; reference_number: string | null; order_number: string | null }> = [];

  for (const row of rows) {
    const legacyOut = articlesFromPayload(row.packet_data, true);
    const newOut    = articlesFromPayload(row.packet_data, false);

    // Can't reconstruct from payload → leave alone (e.g. manually-created packet).
    if (!newOut) {
      noPayload.push({ id: row.id, reference_number: row.reference_number, order_number: row.order_number });
      continue;
    }

    // New output identical to legacy → nothing complimentary to add.
    if (newOut === legacyOut) {
      unchanged.push({ id: row.id, reference_number: row.reference_number, order_number: row.order_number });
      continue;
    }

    // Safety guard: only touch untouched imports. If the stored text no longer
    // matches what the legacy builder produced, staff edited it — skip it.
    const stored = row.articles ?? "";
    if (stored !== legacyOut) {
      skippedManual.push({
        id: row.id, reference_number: row.reference_number, order_number: row.order_number,
        reason: "stored articles differ from original import (hand-edited) — left unchanged",
      });
      continue;
    }

    willChange.push({
      id: row.id, reference_number: row.reference_number, order_number: row.order_number,
      created_at: row.created_at, before: stored, after: newOut,
    });
  }

  let applied = 0;
  const applyErrors: Array<{ id: string; error: string }> = [];

  if (!dryRun) {
    for (const c of willChange) {
      const { error: upErr } = await supabase
        .from("packets")
        .update({ articles: c.after, items_ordered: c.after })
        .eq("id", c.id)
        .eq("tenant_id", tenantId); // double-guard: never cross tenant
      if (upErr) applyErrors.push({ id: c.id, error: upErr.message });
      else applied += 1;
    }
  }

  return NextResponse.json({
    dryRun,
    days,
    since,
    scanned: rows.length,
    summary: {
      willChange: willChange.length,
      skippedManualEdit: skippedManual.length,
      unchanged: unchanged.length,
      noReconstructablePayload: noPayload.length,
      applied,
      applyErrors: applyErrors.length,
    },
    willChange,
    skippedManual,
    noPayload,
    applyErrors,
  });
}

// Shared commit logic for melee price-list imports — extracted from
// app/api/pricing/melee-import/confirm/route.ts so the Supplier Connector
// Framework's sync route (app/api/inventory/suppliers/[id]/sync/confirm)
// can commit through the exact same path instead of duplicating it.
//
// Melee pricing is a pure price-fetch by spec (origin/shape/carat/mm/colour/
// clarity) — TENANT-WIDE, no supplier concept. Every import (manual CSV
// upload or a connector sync) replaces the entire tenant melee price list.

import { SupabaseClient } from "@supabase/supabase-js";
import { parseSizeLabel } from "@/lib/melee-size-parse";
import { normalizeMm } from "@/lib/melee-pricing";

export interface MeleeRow {
  shape: string;
  size_type?: string;
  size_label: string;
  size_from: number | null;
  size_to: number | null;
  mm: string | null;
  quality: string;
  price_per_carat: number | null;
  price_per_stone: number | null;
  flagged: boolean;
  flag_reason?: string;
}

export interface MeleeGroupPayload {
  origin: "natural" | "lab";
  rows: MeleeRow[];
}

export interface MeleeCommitResult {
  total_imported: number;
  groups: Array<{ imported: number; excluded_flagged: number; origin: string }>;
  imported_at: string;
}

export async function commitMeleeImport(
  supabase: SupabaseClient,
  tenantId: string,
  groups: MeleeGroupPayload[]
): Promise<MeleeCommitResult> {
  const { error: deleteErr } = await supabase
    .from("pricing_melee_stones")
    .delete()
    .eq("tenant_id", tenantId);
  if (deleteErr) {
    throw new Error(`Failed to clear existing melee rows: ${deleteErr.message}`);
  }

  const importedAt = new Date().toISOString();
  const groupResults: MeleeCommitResult["groups"] = [];
  let totalImported = 0;

  for (const group of groups) {
    const { origin, rows } = group;
    const priceableRows = rows.filter((r) => !r.flagged);
    const excludedCount = rows.length - priceableRows.length;

    const inserts = priceableRows.map((r) => {
      const parsed = parseSizeLabel(r.size_label);
      const normalized = normalizeMm(r.mm ?? null);
      const mm = normalized ? normalized : null;
      return {
        tenant_id: tenantId,
        supplier_id: null,
        origin,
        shape: r.shape.toLowerCase().trim(),
        size_type: parsed.size_type,
        size_label: r.size_label,
        size_from: parsed.size_from,
        size_to: parsed.size_to,
        mm,
        quality: r.quality && r.quality.trim() ? r.quality.trim() : "unspecified",
        price_per_carat: r.price_per_carat != null ? Number(r.price_per_carat) : null,
        stone_type: origin === "lab" ? "Lab Grown" : "Natural",
        price_per_stone: r.price_per_stone != null ? Number(r.price_per_stone) : 0,
        updated_at: importedAt,
      };
    });

    const CHUNK = 500;
    for (let i = 0; i < inserts.length; i += CHUNK) {
      const { error: insertErr } = await supabase
        .from("pricing_melee_stones")
        .insert(inserts.slice(i, i + CHUNK));
      if (insertErr) {
        throw new Error(`Insert failed (origin ${origin}, chunk ${i}): ${insertErr.message}`);
      }
    }

    groupResults.push({ imported: inserts.length, excluded_flagged: excludedCount, origin });
    totalImported += inserts.length;
  }

  return { total_imported: totalImported, groups: groupResults, imported_at: importedAt };
}

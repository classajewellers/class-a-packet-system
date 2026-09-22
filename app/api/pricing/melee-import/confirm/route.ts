import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { requireManager } from "@/lib/require-auth";
import { commitMeleeImport, MeleeGroupPayload } from "@/lib/meleeImportCommit";

export const dynamic = "force-dynamic";

// Melee price-list import — TENANT-WIDE overwrite, NO supplier concept.
//
// Melee pricing is a pure price-fetch by spec (origin/shape/carat/mm/colour/
// clarity). Each import replaces the ENTIRE tenant melee price list (one price
// source), so the whole table is cleared for the tenant, then re-inserted.
//
// Rows are mm-precise: every (shape, carat, mm, quality) variant is its own row
// — no dedup/collapse. `mm` and the real `price_per_stone` are stored.
//
// Body: { groups: [{ origin: "natural"|"lab", rows: MeleeRow[] }] }
//   (supplier_id, if present, is ignored.)

interface GroupPayload extends MeleeGroupPayload {
  supplier_id?: string | null;    // ignored — no supplier concept
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireManager(req);
    if (!auth.ok) return auth.response;
    const { tenantId } = auth.ctx;
    const supabase = createServerSupabaseClient();

    const body = await req.json();
    const { groups, quality_map } = body as {
      groups: GroupPayload[];
      quality_map?: Array<{ colour_group: string; clarity: string; quality: string }>;
    };

    if (!Array.isArray(groups) || groups.length === 0) {
      return NextResponse.json({ error: "groups array is required and must not be empty" }, { status: 400 });
    }
    for (const g of groups) {
      if (!g.origin || !["natural", "lab"].includes(g.origin)) {
        return NextResponse.json({ error: "Each group's origin must be 'natural' or 'lab'" }, { status: 400 });
      }
      if (!Array.isArray(g.rows) || g.rows.length === 0) {
        return NextResponse.json({ error: `Group for origin ${g.origin} has no rows` }, { status: 400 });
      }
    }

    // TENANT-WIDE overwrite — this import IS the melee price list. Clears every
    // existing melee row for the tenant (incl. any legacy supplier-scoped rows).
    // Shared with the Supplier Connector Framework's sync-confirm route
    // (app/api/inventory/suppliers/[id]/sync/confirm) via lib/meleeImportCommit.ts
    // so both entry points commit through the exact same logic.
    let totalImported: number;
    let groupResults: Array<{ imported: number; excluded_flagged: number; origin: string }>;
    let importedAt: string;
    try {
      const result = await commitMeleeImport(supabase, tenantId, groups);
      totalImported = result.total_imported;
      groupResults = result.groups;
      importedAt = result.imported_at;
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : "Import failed" }, { status: 500 });
    }

    // Quality-map rebuild — PAUSED for the current import format. The standard
    // format (Origin, Shape, Quality, Carat, mm, $/carat, $/stone) gives Quality
    // pre-combined with no separate colour_group/clarity, so this endpoint can
    // no longer safely derive quality_map entries from an import (splitting a
    // combined string like "Fancy Yellow SI1-SI2+" back into parts would be a
    // guess — against this project's convention of never guessing a mapping).
    // This block only runs if a caller explicitly supplies a well-formed
    // {colour_group, clarity, quality} quality_map (nothing currently does) —
    // existing map entries are left untouched by a normal import either way.
    // See lib/melee-pricing.ts for the open design question this raises.
    let mapImported = 0;
    if (Array.isArray(quality_map) && quality_map.length > 0) {
      const { error: mapDelErr } = await supabase
        .from("pricing_melee_quality_map")
        .delete()
        .eq("tenant_id", tenantId);
      if (mapDelErr) {
        return NextResponse.json({ error: `Failed to clear quality map: ${mapDelErr.message}` }, { status: 500 });
      }
      // De-dupe on (colour_group, clarity) — the unique key.
      const seen = new Map<string, { colour_group: string; clarity: string; quality: string }>();
      for (const m of quality_map) {
        const cg = String(m.colour_group ?? "").trim();
        const cl = String(m.clarity ?? "").trim();
        const q  = String(m.quality ?? "").trim();
        if (!cg || !cl || !q) continue;
        seen.set(`${cg.toLowerCase()}||${cl.toLowerCase()}`, { colour_group: cg, clarity: cl, quality: q });
      }
      const mapInserts = Array.from(seen.values()).map((m) => ({
        tenant_id: tenantId, supplier_id: null,
        colour_group: m.colour_group, clarity: m.clarity, quality: m.quality,
      }));
      if (mapInserts.length > 0) {
        const { error: mapInsErr } = await supabase.from("pricing_melee_quality_map").insert(mapInserts);
        if (mapInsErr) {
          return NextResponse.json({ error: `Quality-map insert failed: ${mapInsErr.message}` }, { status: 500 });
        }
        mapImported = mapInserts.length;
      }
    }

    return NextResponse.json({ total_imported: totalImported, groups: groupResults, quality_map_imported: mapImported, imported_at: importedAt });
  } catch (err) {
    console.error("[melee-import/confirm]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Import failed" }, { status: 500 });
  }
}

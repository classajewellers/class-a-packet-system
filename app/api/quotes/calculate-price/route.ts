// POST /api/quotes/calculate-price
//
// Wraps the calculate_price() Postgres RPC in its "ad_hoc" mode (migration
// 134) for the quote builder — pricing a bespoke item that has no
// inventory_pieces/inventory_products/design_band_recipes row yet. This
// replaces the old calculateBlendedRetailFromBrackets()/pricing_margin_brackets
// path: instead of blending every cost component into one number and applying
// a single bracket multiplier, each component (metal, main stone, melee) is
// priced through its own cost-tier multiplier in pricing_component_rules —
// the same engine already used for inventory pieces
// (app/api/inventory/pieces/[id]/price/route.ts). Labour and addons (main
// stone setting, small-stone settings, components, hand/laser engraving)
// pass straight through as already-retail dollar figures with no multiplier
// applied — this is calculate_price's existing, established behaviour for
// every mode (labour_retail/addons_retail are never multiplied anywhere in
// the function), not a new rule invented here.
//
// Body:
//   metals: [{ type: string, weight: number }]   — type is the exact
//     pricing_metal_rates.metal_type string (e.g. "18ct Yellow Gold"),
//     reverse-mapped here into the {karat, colour} shape p_metal_rows expects.
//   stones: [{ wholesale: number, carat: number, origin: "Lab Grown"|"Natural" }]
//     — an item can have more than one main stone (e.g. a 3-stone ring), so
//     this is always an array, mapped straight to p_stone_rows.
//   melee: [{ origin: "Lab Grown"|"Natural", shape, quality, carat: number, mm, qty: number }]
//   labourRetail: number   — flat labour dollar figure (no multiplier)
//   addonsRetail: number   — flat sum of setting/components/engraving (no multiplier)

import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

// Reverse of calculate_price()'s own CASE derivation (migration 134) —
// confirmed against the exact 8 metal_type strings live in
// pricing_metal_rates on staging (2026-09-22). Kept as an explicit lookup
// table rather than a regex guess, since it must match the RPC's own CASE
// statement exactly or the metal row will silently price as $0 (no rate
// found for the derived key).
const METAL_TYPE_TO_ROW: Record<string, { karat: string; colour?: string }> = {
  "9ct Yellow Gold":  { karat: "9K",  colour: "Yellow" },
  "9ct White Gold":   { karat: "9K",  colour: "White" },
  "9ct Rose Gold":    { karat: "9K",  colour: "Rose" },
  "18ct Yellow Gold": { karat: "18K", colour: "Yellow" },
  "18ct White Gold":  { karat: "18K", colour: "White" },
  "18ct Rose Gold":   { karat: "18K", colour: "Rose" },
  "Platinum":         { karat: "Platinum" },
  "Sterling Silver":  { karat: "Silver" },
};

function stoneOriginKey(origin: string): "lab" | "natural" {
  return origin === "Lab Grown" ? "lab" : "natural";
}

interface MetalInput { type: string; weight: number }
interface StoneInput { wholesale: number; carat: number; origin: string }
interface MeleeInput { origin: string; shape: string; quality: string; carat: number; mm: string; qty: number }

export async function POST(req: NextRequest): Promise<NextResponse> {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  if (!tenantId) return NextResponse.json({ error: "Missing tenant" }, { status: 400 });

  let body: {
    metals?: MetalInput[];
    stones?: StoneInput[];
    melee?: MeleeInput[];
    labourRetail?: number;
    addonsRetail?: number;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const metals = body.metals ?? [];
  if (metals.length === 0) {
    return NextResponse.json({ error: "At least one metal row is required" }, { status: 400 });
  }

  const metalRows: Array<{ karat: string; colour?: string; weight_grams: number }> = [];
  for (const m of metals) {
    if (!m.type || !(m.weight > 0)) continue;
    const mapped = METAL_TYPE_TO_ROW[m.type];
    if (!mapped) {
      return NextResponse.json(
        { error: `Unrecognised metal type: ${m.type}`, hint: "This metal type isn't in the calculate_price ad-hoc reverse-lookup table." },
        { status: 422 }
      );
    }
    metalRows.push({ ...mapped, weight_grams: m.weight });
  }
  if (metalRows.length === 0) {
    return NextResponse.json({ error: "No metal rows with a positive weight" }, { status: 400 });
  }

  const stoneRows = (body.stones ?? [])
    .filter(s => s.wholesale > 0)
    .map(s => ({ wholesale: s.wholesale, carat: s.carat, origin: stoneOriginKey(s.origin) }));

  const meleeRows = (body.melee ?? [])
    .filter(r => r.shape && r.quality && r.mm && r.carat > 0 && r.qty > 0)
    .map(r => ({
      origin: stoneOriginKey(r.origin),
      shape: r.shape,
      quality: r.quality,
      carat: r.carat,
      mm: r.mm,
      qty: r.qty,
    }));

  const supabase = await createTenantSupabaseClient(tenantId);
  const { data, error } = await supabase.rpc("calculate_price", {
    p_tenant_id: tenantId,
    p_metal_rows: metalRows,
    p_stone_rows: stoneRows && stoneRows.length > 0 ? stoneRows : undefined,
    p_melee_rows: meleeRows.length > 0 ? meleeRows : undefined,
    p_labour_retail: body.labourRetail ?? 0,
    p_addons_retail: body.addonsRetail ?? 0,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (data?.error) return NextResponse.json({ error: data.error, detail: data }, { status: 422 });

  return NextResponse.json(data);
}

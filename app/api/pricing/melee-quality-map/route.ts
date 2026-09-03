import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { requireManager } from "@/lib/require-auth";
import { mapDiamondTypeToStoneOrigin } from "@/lib/inventoryPricing";
import { ORIGIN_SUPPLIER_NAME, resolveSupplierIdForOrigin, MeleeOrigin } from "@/lib/melee-pricing";

export const dynamic = "force-dynamic";

// GET — the melee quality-mapping workbench: every (colour_group, clarity)
// combination that actually appears on pieces with melee, grouped by the
// supplier its origin resolves to, showing the confirmed quality mapping (if
// any) and the real quality strings available in that supplier's price list to
// confirm against. POST saves a human-confirmed mapping.
export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = await requireManager(req);
  if (!auth.ok) return auth.response;
  const { tenantId } = auth.ctx;
  const supabase = createServerSupabaseClient();

  const [{ data: suppliers }, { data: pieces }, { data: maps }, { data: priceRows }] = await Promise.all([
    supabase.from("inventory_suppliers").select("id, name").eq("tenant_id", tenantId),
    supabase.from("inventory_pieces")
      .select("diamond_type, melee_colour_group, melee_clarity")
      .eq("tenant_id", tenantId).gt("melee_quantity", 0),
    supabase.from("pricing_melee_quality_map")
      .select("supplier_id, colour_group, clarity, quality").eq("tenant_id", tenantId),
    supabase.from("pricing_melee_stones").select("supplier_id, quality").eq("tenant_id", tenantId),
  ]);

  const supplierList = suppliers ?? [];
  const mapKey = (s: string, c: string, cl: string) => `${s}||${c.toLowerCase()}||${cl.toLowerCase()}`;
  const mapped = new Map((maps ?? []).map(m => [mapKey(m.supplier_id, m.colour_group, m.clarity), m.quality]));

  // Available quality strings per supplier (distinct).
  const qualitiesBySupplier = new Map<string, Set<string>>();
  for (const r of priceRows ?? []) {
    if (!r.supplier_id || !r.quality) continue;
    if (!qualitiesBySupplier.has(r.supplier_id)) qualitiesBySupplier.set(r.supplier_id, new Set());
    qualitiesBySupplier.get(r.supplier_id)!.add(r.quality);
  }

  // Build groups by origin/supplier from the distinct combos present on pieces.
  const groups: Record<MeleeOrigin, { supplier_id: string | null; supplier_name: string; combos: Map<string, { colour_group: string; clarity: string; count: number }> }> = {
    lab:     { supplier_id: resolveSupplierIdForOrigin("lab", supplierList),     supplier_name: ORIGIN_SUPPLIER_NAME.lab,     combos: new Map() },
    natural: { supplier_id: resolveSupplierIdForOrigin("natural", supplierList), supplier_name: ORIGIN_SUPPLIER_NAME.natural, combos: new Map() },
  };

  for (const p of pieces ?? []) {
    const origin = mapDiamondTypeToStoneOrigin(p.diamond_type);
    if (origin == null) continue;
    const colour = (p.melee_colour_group ?? "").trim();
    const clar   = (p.melee_clarity ?? "").trim();
    if (!colour || !clar) continue;
    const g = groups[origin];
    const key = `${colour.toLowerCase()}||${clar.toLowerCase()}`;
    const existing = g.combos.get(key);
    if (existing) existing.count += 1;
    else g.combos.set(key, { colour_group: colour, clarity: clar, count: 1 });
  }

  const result = (["natural", "lab"] as MeleeOrigin[]).map(origin => {
    const g = groups[origin];
    const available = g.supplier_id ? Array.from(qualitiesBySupplier.get(g.supplier_id) ?? []).sort() : [];
    const combos = Array.from(g.combos.values()).map(c => ({
      ...c,
      mapped_quality: g.supplier_id ? (mapped.get(mapKey(g.supplier_id, c.colour_group, c.clarity)) ?? null) : null,
    })).sort((a, b) => a.colour_group.localeCompare(b.colour_group) || a.clarity.localeCompare(b.clarity));
    return {
      origin,
      supplier_id:       g.supplier_id,
      supplier_name:     g.supplier_name,
      supplier_missing:  g.supplier_id == null,
      available_qualities: available,
      combos,
    };
  });

  return NextResponse.json({ groups: result });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await requireManager(req);
  if (!auth.ok) return auth.response;
  const { tenantId, userId } = auth.ctx;

  const body = await req.json();
  const supplierId = String(body?.supplier_id ?? "");
  const colour     = String(body?.colour_group ?? "").trim();
  const clarity    = String(body?.clarity ?? "").trim();
  const quality    = String(body?.quality ?? "").trim();

  if (!supplierId || !colour || !clarity || !quality) {
    return NextResponse.json({ error: "supplier_id, colour_group, clarity and quality are required" }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();
  const { error } = await supabase
    .from("pricing_melee_quality_map")
    .upsert({
      tenant_id: tenantId, supplier_id: supplierId,
      colour_group: colour, clarity, quality,
      confirmed_by: userId, confirmed_at: new Date().toISOString(),
    }, { onConflict: "tenant_id,supplier_id,colour_group,clarity" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

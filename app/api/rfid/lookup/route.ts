import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/require-auth";
import { applyHandheldTagReads } from "@/lib/rfid-tag-read";
import { createTenantSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const CAP = 200;
const EPC_RE = /^[0-9a-f]{24}$/;

type PieceRow = Record<string, unknown>;

function asText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function metalOf(row: PieceRow): string | null {
  const metal = [asText(row.metal_karat), asText(row.metal_colour)].filter(Boolean).join(" ");
  return metal || null;
}

function priceOf(row: PieceRow): number | null {
  const value = row.retail_price;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Staging stores piece status as text. A joined object is ignored here. */
function statusOf(row: PieceRow): string | null {
  return asText(row.status);
}

function piecePayload(row: PieceRow, locationName: string | null) {
  return {
    id: String(row.id),
    sku: asText(row.sku),
    metal: metalOf(row),
    retail_price: priceOf(row),
    status: statusOf(row),
    location_name: locationName,
  };
}

/**
 * POST /api/rfid/lookup
 * Body: { epcs: string[], skus?: string[] }
 * Tenant comes from the session. x-tenant-id is ignored. Does not write last_seen.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;
  const tenantId = auth.ctx.tenantId;

  const body = await req.json().catch(() => null);
  if (!body || !Array.isArray(body.epcs)) {
    return NextResponse.json({ error: "epcs must be an array of strings" }, { status: 400 });
  }
  const rawSkus = Array.isArray(body.skus) ? body.skus : [];
  if (body.epcs.length + rawSkus.length > CAP) {
    return NextResponse.json({ error: `At most ${CAP} codes per request` }, { status: 400 });
  }

  const epcs: string[] = [];
  const seenEpc = new Set<string>();
  for (const value of body.epcs) {
    if (typeof value !== "string") continue;
    const epc = value.trim().toLowerCase();
    if (!EPC_RE.test(epc) || seenEpc.has(epc)) continue;
    seenEpc.add(epc);
    epcs.push(epc);
  }

  const skus: string[] = [];
  const seenSku = new Set<string>();
  for (const value of rawSkus) {
    if (typeof value !== "string") continue;
    const sku = value.trim();
    if (!sku || EPC_RE.test(sku.toLowerCase())) continue;
    const key = sku.toLowerCase();
    if (seenSku.has(key)) continue;
    seenSku.add(key);
    skus.push(sku);
  }

  const supabase = await createTenantSupabaseClient(tenantId);

  const tagByEpc = new Map<string, { status: string; pieceId: string }>();
  if (epcs.length) {
    const { data, error } = await supabase
      .from("inventory_rfid_tags")
      .select("epc, status, inventory_piece_id")
      .eq("tenant_id", tenantId)
      .in("epc", epcs);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    for (const tag of data ?? []) {
      tagByEpc.set(String(tag.epc).toLowerCase(), {
        status: String(tag.status),
        pieceId: String(tag.inventory_piece_id),
      });
    }
    try {
      const displayed = await applyHandheldTagReads(
        supabase,
        tenantId,
        auth.ctx.userId,
        Array.from(tagByEpc.entries()).map(([epc, tag]) => ({ epc, status: tag.status })),
      );
      for (const [epc, status] of Array.from(displayed.entries())) {
        const tag = tagByEpc.get(epc);
        if (tag) tag.status = status;
      }
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : "Could not record the scan" }, { status: 500 });
    }
  }

  const pieceIds = Array.from(new Set(Array.from(tagByEpc.values()).map((tag) => tag.pieceId)));
  const piecesById = new Map<string, PieceRow>();

  async function loadPieces(ids: string[]): Promise<string | null> {
    if (!ids.length) return null;
    const { data, error } = await supabase
      .from("inventory_pieces")
      .select("*")
      .eq("tenant_id", tenantId)
      .in("id", ids);
    if (error) return error.message;
    for (const row of (data ?? []) as PieceRow[]) piecesById.set(String(row.id), row);
    return null;
  }

  const pieceError = await loadPieces(pieceIds);
  if (pieceError) return NextResponse.json({ error: pieceError }, { status: 500 });

  const skuHits: Array<{ sku: string; piece: PieceRow | null }> = [];
  if (skus.length) {
    const filter = skus.map((sku) => {
      const escaped = sku.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/%/g, "\\%").replace(/_/g, "\\_");
      return `sku.ilike."${escaped}"`;
    }).join(",");
    const { data, error } = await supabase
      .from("inventory_pieces")
      .select("*")
      .eq("tenant_id", tenantId)
      .or(filter);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const bySku = new Map<string, PieceRow>();
    for (const row of (data ?? []) as PieceRow[]) {
      const sku = asText(row.sku);
      if (sku) bySku.set(sku.toLowerCase(), row);
    }
    for (const sku of skus) skuHits.push({ sku, piece: bySku.get(sku.toLowerCase()) ?? null });
  }

  const locationIds = new Set<string>();
  for (const row of Array.from(piecesById.values())) {
    if (typeof row.location_id === "string") locationIds.add(row.location_id);
  }
  for (const hit of skuHits) {
    if (hit.piece && typeof hit.piece.location_id === "string") locationIds.add(hit.piece.location_id);
  }

  const locationNames = new Map<string, string>();
  if (locationIds.size) {
    const { data, error } = await supabase
      .from("inventory_locations")
      .select("id, name")
      .eq("tenant_id", tenantId)
      .in("id", Array.from(locationIds));
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    for (const row of data ?? []) locationNames.set(String(row.id), String(row.name ?? ""));
  }

  function locationName(row: PieceRow | null): string | null {
    if (!row || typeof row.location_id !== "string") return null;
    const name = locationNames.get(row.location_id);
    return name && name.trim() ? name : null;
  }

  const epcResults = epcs.map((epc) => {
    const tag = tagByEpc.get(epc);
    if (!tag) {
      return { epc, found: false, tag_status: null, piece: null };
    }
    const piece = piecesById.get(tag.pieceId) ?? null;
    return {
      epc,
      found: true,
      tag_status: tag.status,
      piece: piece ? piecePayload(piece, locationName(piece)) : null,
    };
  });

  const skuResults = skuHits.map((hit) => ({
    sku: hit.sku,
    found: !!hit.piece,
    piece: hit.piece ? piecePayload(hit.piece, locationName(hit.piece)) : null,
  }));

  return NextResponse.json({ epcs: epcResults, skus: skuResults });
}

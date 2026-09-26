import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/require-auth";
import { createTenantSupabaseClient } from "@/lib/supabase-server";
import { tenantScoped } from "@/lib/tenantScoped";
import { loadLocationLabels, uuidIds } from "@/lib/load-locations";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const LIMIT = 10;

type PieceRow = {
  id: string;
  sku: string | null;
  location_id: string | null;
  product_id: string | null;
  title?: string | null;
};

function asText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

/** Strip LIKE wildcards so a search is a literal substring. */
function likePattern(raw: string): string {
  const literal = raw.replace(/[%_\\]/g, " ").replace(/\s+/g, " ").trim();
  return `%${literal}%`;
}

function missingTitle(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === "42703" || error.code === "PGRST204") return true;
  const message = (error.message ?? "").toLowerCase();
  return message.includes("title") && (message.includes("column") || message.includes("schema"));
}

/**
 * GET /api/rfid/stocktake/move/search?q=
 * In-stock pieces for the signed-in tenant, matched on SKU or name.
 * Name is the linked product name, or the piece title where that column exists.
 * About 10 rows. Does not move anything.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;
  const tenantId = auth.ctx.tenantId;
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  if (q.length < 1 || q.length > 40) return NextResponse.json({ pieces: [] });

  const supabase = await createTenantSupabaseClient(tenantId);
  const db = tenantScoped(supabase, tenantId);
  const pattern = likePattern(q);
  if (pattern === "%%") return NextResponse.json({ pieces: [] });

  const titleProbe = await db.from("inventory_pieces").select("title").limit(1);
  const titleColumn = !titleProbe.error;
  if (titleProbe.error && !missingTitle(titleProbe.error)) {
    return NextResponse.json({ error: titleProbe.error.message }, { status: 500 });
  }

  const columns = titleColumn
    ? "id, sku, location_id, product_id, title"
    : "id, sku, location_id, product_id";

  const [products, bySku, byTitle] = await Promise.all([
    db.from("inventory_products").select("id, name").ilike("name", pattern).limit(40),
    db.from("inventory_pieces").select(columns).eq("status", "in_stock").ilike("sku", pattern).limit(LIMIT),
    titleColumn
      ? db.from("inventory_pieces").select(columns).eq("status", "in_stock").ilike("title", pattern).limit(LIMIT)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (products.error) return NextResponse.json({ error: products.error.message }, { status: 500 });
  if (bySku.error) return NextResponse.json({ error: bySku.error.message }, { status: 500 });
  if (byTitle.error) return NextResponse.json({ error: byTitle.error.message }, { status: 500 });

  const productName = new Map<string, string>();
  const productIds: string[] = [];
  for (const row of products.data ?? []) {
    const id = asText(row.id);
    const name = asText(row.name);
    if (!id) continue;
    productIds.push(id);
    if (name) productName.set(id, name);
  }

  let byProduct: PieceRow[] = [];
  if (productIds.length) {
    const productPieces = await db
      .from("inventory_pieces")
      .select(columns)
      .eq("status", "in_stock")
      .in("product_id", productIds)
      .limit(LIMIT);
    if (productPieces.error) return NextResponse.json({ error: productPieces.error.message }, { status: 500 });
    byProduct = (productPieces.data ?? []) as PieceRow[];
  }

  const needle = q.toLowerCase();
  const merged = new Map<string, PieceRow>();
  function take(row: PieceRow) {
    if (!row.id || merged.has(row.id)) return;
    merged.set(row.id, row);
  }
  for (const row of (bySku.data ?? []) as PieceRow[]) take(row);
  for (const row of (byTitle.data ?? []) as PieceRow[]) take(row);
  for (const row of byProduct) take(row);

  const bySkuOrder = (a: PieceRow, b: PieceRow) =>
    (a.sku ?? "").localeCompare(b.sku ?? "", "en", { numeric: true, sensitivity: "base" });
  const skuFirst = Array.from(merged.values()).filter((row) => (row.sku ?? "").toLowerCase().includes(needle)).sort(bySkuOrder);
  const rest = Array.from(merged.values()).filter((row) => !(row.sku ?? "").toLowerCase().includes(needle)).sort(bySkuOrder);
  const ranked = [...skuFirst, ...rest].slice(0, LIMIT);

  const missingProducts = uuidIds(ranked.map((row) => row.product_id).filter((id) => id && !productName.has(id)));
  if (missingProducts.length) {
    const extra = await db.from("inventory_products").select("id, name").in("id", missingProducts);
    if (extra.error) return NextResponse.json({ error: extra.error.message }, { status: 500 });
    for (const row of extra.data ?? []) {
      const id = asText(row.id);
      const name = asText(row.name);
      if (id && name) productName.set(id, name);
    }
  }

  let locations = new Map<string, string>();
  try {
    locations = await loadLocationLabels(supabase, tenantId, ranked.map((row) => row.location_id));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not load locations" }, { status: 500 });
  }

  const pieces = ranked.map((row) => {
    const productId = asText(row.product_id);
    const name = (productId && productName.get(productId)) || asText(row.title) || null;
    const locationId = asText(row.location_id);
    return {
      id: row.id,
      sku: asText(row.sku) || "Piece",
      name,
      location_id: locationId,
      location_name: locationId ? locations.get(locationId) ?? null : null,
    };
  });

  return NextResponse.json({ pieces });
}

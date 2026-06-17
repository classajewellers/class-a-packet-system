import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";

export const dynamic    = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const p        = new URL(req.url).searchParams;
  const tenantId = req.headers.get("x-tenant-id") ?? "";

  const shape     = p.get("shape")      ?? null;
  const minCarat  = p.has("min_carat")  ? Number(p.get("min_carat")) : null;
  const maxCarat  = p.has("max_carat")  ? Number(p.get("max_carat")) : 0.30;
  const color     = p.get("color")      ?? null;
  const clarity   = p.get("clarity")    ?? null;
  const stockType = p.get("stock_type") ?? null;

  try {
    const supabase = await createTenantSupabaseClient(tenantId);

    let query = supabase
      .from("sapphire_stock")
      .select("*")
      .eq("availability", "AVAILABLE")
      .order("carat",       { ascending: true })
      .order("asking_rate", { ascending: true });

    if (shape)     query = query.ilike("shape",      shape);
    if (color)     query = query.ilike("color",      color);
    if (clarity)   query = query.ilike("clarity",    clarity);
    if (stockType) query = query.ilike("stock_type", stockType);
    if (minCarat != null) query = query.gte("carat", minCarat);
    if (maxCarat != null) query = query.lte("carat", maxCarat);

    const { data, error } = await query;

    if (error) {
      console.error("[sapphire/melee] query error:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data ?? []);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[sapphire/melee] fatal error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

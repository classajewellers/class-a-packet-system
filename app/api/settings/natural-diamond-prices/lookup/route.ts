import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

function mapColourGroup(colour: string): string {
  const c = colour.trim().toUpperCase();
  if (c === 'D' || c === 'E' || c === 'F') return 'D-F';
  if (c === 'G' || c === 'H') return 'G-H';
  if (c === 'I' || c === 'J') return 'I-J';
  if (c === 'K' || c === 'L') return 'K-L';
  return 'M';
}

// GET /api/settings/natural-diamond-prices/lookup?shape=round&carat=1.2&colour=F&clarity=VS1
export async function GET(req: NextRequest): Promise<NextResponse> {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  if (!tenantId) return NextResponse.json({ error: "x-tenant-id required" }, { status: 400 });

  const { searchParams } = new URL(req.url);
  const shape   = (searchParams.get("shape")   ?? "").trim().toLowerCase();
  const carat   = parseFloat(searchParams.get("carat")   ?? "");
  const colour  = (searchParams.get("colour")  ?? "").trim().toUpperCase();
  const clarity = (searchParams.get("clarity") ?? "").trim().toUpperCase();

  if (!shape || !carat || !colour || !clarity) {
    return NextResponse.json({ error: "shape, carat, colour and clarity are required" }, { status: 400 });
  }

  const colourGroup = mapColourGroup(colour);

  try {
    const supabase = await createTenantSupabaseClient(tenantId);

    const [priceRes, tenantRes, marginRes] = await Promise.all([
      supabase
        .from("natural_diamond_prices")
        .select("price_per_ct,size_from,size_to")
        .eq("tenant_id", tenantId)
        .eq("shape", shape)
        .eq("colour_group", colourGroup)
        .eq("clarity", clarity)
        .lte("size_from", carat)
        .gte("size_to", carat)
        .maybeSingle(),
      supabase
        .from("tenants")
        .select("stone_currency_rate")
        .eq("id", tenantId)
        .maybeSingle(),
      supabase
        .from("pricing_margin_config")
        .select("margin_percent")
        .eq("tenant_id", tenantId)
        .eq("category", "stone_natural")
        .maybeSingle(),
    ]);

    if (!priceRes.data || Number(priceRes.data.price_per_ct) <= 0) {
      return NextResponse.json(
        { error: `No RapNet price found for ${carat}ct ${colour} ${clarity} ${shape}` },
        { status: 404 }
      );
    }

    const currencyRate    = Number(tenantRes.data?.stone_currency_rate ?? 1.538);
    const naturalMarginPct = Number(marginRes.data?.margin_percent ?? 30);

    const pricePerCtUsd = Number(priceRes.data.price_per_ct);
    const pricePerCtAud = pricePerCtUsd * currencyRate;
    const totalAud      = pricePerCtAud * carat;
    const sellAud       = totalAud * (1 + naturalMarginPct / 100);

    return NextResponse.json({
      shape, carat, colour, clarity,
      colour_group:      colourGroup,
      size_from:         priceRes.data.size_from,
      size_to:           priceRes.data.size_to,
      price_per_ct_usd:  Math.round(pricePerCtUsd * 100) / 100,
      price_per_ct_aud:  Math.round(pricePerCtAud * 100) / 100,
      total_aud:         Math.round(totalAud * 100) / 100,
      sell_aud:          Math.round(sellAud * 100) / 100,
      currency_rate:     currencyRate,
      natural_margin_pct: naturalMarginPct,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

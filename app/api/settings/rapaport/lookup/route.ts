import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

// GET /api/settings/rapaport/lookup?carat=1.2&colour=F&clarity=VS1
export async function GET(req: NextRequest): Promise<NextResponse> {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  if (!tenantId) return NextResponse.json({ error: "x-tenant-id required" }, { status: 400 });

  const { searchParams } = new URL(req.url);
  const carat   = parseFloat(searchParams.get("carat")   ?? "");
  const colour  = (searchParams.get("colour")  ?? "").trim().toUpperCase();
  const clarity = (searchParams.get("clarity") ?? "").trim().toUpperCase();

  if (!carat || !colour || !clarity) {
    return NextResponse.json({ error: "carat, colour and clarity are required" }, { status: 400 });
  }

  try {
    const supabase = await createTenantSupabaseClient(tenantId);

    const [priceRes, tenantRes, marginRes] = await Promise.all([
      supabase
        .from("rapaport_prices")
        .select("price_per_ct,size_from,size_to")
        .eq("tenant_id", tenantId)
        .eq("colour", colour)
        .eq("clarity", clarity)
        .lte("size_from", carat)
        .gte("size_to", carat)
        .maybeSingle(),
      supabase
        .from("tenants")
        .select("rapaport_discount_percent,rapaport_currency_rate")
        .eq("id", tenantId)
        .maybeSingle(),
      supabase
        .from("pricing_margin_config")
        .select("margin_percent")
        .eq("tenant_id", tenantId)
        .eq("category", "stone_natural")
        .maybeSingle(),
    ]);

    if (!priceRes.data) {
      return NextResponse.json(
        { error: `No Rapaport price found for ${carat}ct ${colour} ${clarity}` },
        { status: 404 }
      );
    }

    const discountPct  = tenantRes.data?.rapaport_discount_percent ?? 0;
    const currencyRate = tenantRes.data?.rapaport_currency_rate    ?? 1.538;
    const naturalMarginPct = marginRes.data?.margin_percent ?? 30;

    const rawUsdPerCt  = priceRes.data.price_per_ct * 100;
    const buyUsdPerCt  = rawUsdPerCt  * (1 - discountPct / 100);
    const buyAudPerCt  = buyUsdPerCt  * currencyRate;
    const buyAudTotal  = buyAudPerCt  * carat;
    const sellAudTotal = buyAudTotal  * (1 + naturalMarginPct / 100);

    return NextResponse.json({
      carat, colour, clarity,
      size_from:       priceRes.data.size_from,
      size_to:         priceRes.data.size_to,
      rap_list_per_ct: priceRes.data.price_per_ct,
      raw_usd_per_ct:  rawUsdPerCt,
      buy_usd_per_ct:  Math.round(buyUsdPerCt * 100) / 100,
      buy_price_aud:   Math.round(buyAudTotal * 100) / 100,
      sell_price_aud:  Math.round(sellAudTotal * 100) / 100,
      discount_pct:    discountPct,
      currency_rate:   currencyRate,
      natural_margin_pct: naturalMarginPct,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

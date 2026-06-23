import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

// ── June 2026 Rapaport round brilliant seed data ─────────────────────────────
// Prices are in hundreds of USD per carat (raw Rap list numbers).
// Row order: D, E, F, G, H, I, J, K, L, M
// Column order: IF, VVS1, VVS2, VS1, VS2, SI1, SI2, SI3, I1, I2, I3

const RAP_COLOURS   = ['D','E','F','G','H','I','J','K','L','M'] as const;
const RAP_CLARITIES = ['IF','VVS1','VVS2','VS1','VS2','SI1','SI2','SI3','I1','I2','I3'] as const;

interface SizeBand { sf: number; st: number; rows: number[][] }

const RAP_SEED: SizeBand[] = [
  { sf: 0.30, st: 0.39, rows: [
    [27,22,19,17,15,14,13,12,11,10,7],
    [23,20,17,15,14,13,12,11,10,9,6],
    [20,18,16,14,13,12,11,10,10,9,6],
    [18,16,14,13,12,12,11,10,9,8,5],
    [15,14,13,12,11,11,10,9,8,7,5],
    [13,12,11,11,10,10,9,8,7,6,5],
    [12,11,10,10,9,9,8,7,6,6,4],
    [11,10,9,9,8,8,7,6,5,5,4],
    [10,9,8,8,7,7,6,6,5,5,3],
    [9,8,8,7,7,7,6,5,5,4,3],
  ]},
  { sf: 0.40, st: 0.49, rows: [
    [31,25,21,20,18,16,15,14,13,11,8],
    [26,22,19,18,17,15,14,13,12,10,7],
    [23,20,18,17,16,14,13,12,11,10,7],
    [21,18,17,16,15,13,12,11,10,9,6],
    [18,16,15,14,13,12,11,10,9,8,6],
    [16,14,13,12,12,11,10,9,8,7,6],
    [14,13,12,11,11,10,10,9,8,7,5],
    [13,12,11,10,10,9,9,8,7,6,5],
    [12,11,10,9,9,8,8,7,6,5,4],
    [11,10,9,8,8,8,7,6,5,5,4],
  ]},
  { sf: 0.50, st: 0.69, rows: [
    [47,37,29,25,22,19,16,15,14,13,11],
    [37,32,26,23,20,17,15,14,13,12,10],
    [32,28,24,21,19,16,14,13,12,11,10],
    [27,24,21,19,18,15,13,12,11,10,9],
    [23,21,19,17,16,14,12,11,10,10,8],
    [20,18,16,15,14,13,11,10,9,9,8],
    [17,15,14,13,12,12,11,10,9,9,7],
    [15,14,13,12,11,11,10,9,8,8,7],
    [14,13,12,11,10,10,9,9,8,7,6],
    [13,12,11,10,9,9,8,8,8,6,5],
  ]},
  { sf: 0.70, st: 0.89, rows: [
    [64,51,41,35,30,26,23,21,19,17,12],
    [52,45,38,33,28,24,21,19,17,16,11],
    [45,40,34,30,26,22,19,17,16,15,11],
    [38,33,30,27,24,20,17,16,15,14,10],
    [31,28,25,23,21,18,16,15,14,14,9],
    [26,23,21,20,18,16,15,14,13,13,9],
    [22,20,19,18,16,15,14,13,12,12,8],
    [20,18,17,16,15,14,13,12,11,10,8],
    [18,16,15,14,13,12,11,11,11,8,7],
    [16,14,13,12,11,11,10,10,10,7,6],
  ]},
  { sf: 0.90, st: 0.99, rows: [
    [96,82,62,53,45,36,29,26,25,20,15],
    [83,71,57,48,41,32,26,24,23,19,14],
    [73,63,52,44,38,30,24,22,21,18,13],
    [59,52,45,40,35,28,23,21,20,17,12],
    [47,43,39,34,31,26,22,20,19,16,12],
    [41,37,34,30,28,24,20,19,18,15,11],
    [35,32,29,26,24,21,19,18,17,14,10],
    [30,27,25,23,21,19,17,16,15,13,9],
    [26,23,21,20,18,16,15,15,14,12,8],
    [23,20,18,17,16,15,14,14,13,10,7],
  ]},
  { sf: 1.00, st: 1.49, rows: [
    [150,118,89,76,63,48,37,32,30,23,16],
    [115,102,81,69,57,44,34,30,28,22,15],
    [96,87,74,63,52,41,32,28,26,21,14],
    [75,68,62,54,47,37,30,26,24,20,13],
    [58,53,49,45,42,34,28,25,23,19,12],
    [48,44,41,38,35,31,26,24,22,18,12],
    [40,36,33,31,29,26,23,21,20,17,12],
    [34,31,29,27,25,23,21,20,19,16,11],
    [29,27,25,23,21,19,18,17,16,15,10],
    [25,23,22,21,19,17,16,15,14,14,10],
  ]},
  { sf: 1.50, st: 1.99, rows: [
    [200,178,146,127,114,88,71,63,52,33,18],
    [179,164,136,116,105,82,65,57,49,31,17],
    [156,145,125,108,98,77,61,54,47,30,16],
    [129,120,108,94,85,71,57,51,44,29,15],
    [103,95,86,77,70,63,52,48,40,28,15],
    [83,77,69,65,60,53,48,44,37,26,14],
    [70,64,58,54,50,46,41,37,33,25,14],
    [60,53,48,45,42,38,35,32,29,23,13],
    [50,45,41,38,36,33,31,29,28,22,12],
    [44,39,37,34,32,30,29,27,26,21,12],
  ]},
  { sf: 2.00, st: 2.99, rows: [
    [330,275,235,205,175,141,113,95,80,41,19],
    [270,245,210,190,160,132,105,88,76,39,18],
    [245,220,195,175,150,123,98,83,72,37,17],
    [205,185,165,150,135,112,92,77,68,35,16],
    [165,150,135,125,115,104,86,71,65,33,15],
    [135,120,110,100,93,86,78,66,61,31,15],
    [109,99,91,84,76,69,63,57,54,29,14],
    [91,83,76,70,63,57,53,50,47,28,14],
    [78,71,66,61,54,50,46,43,40,27,13],
    [68,63,57,54,48,45,42,40,38,26,13],
  ]},
  { sf: 3.00, st: 3.99, rows: [
    [550,460,410,350,295,235,200,139,103,49,21],
    [450,420,370,320,265,210,185,131,98,47,20],
    [405,375,335,295,245,195,170,124,93,45,19],
    [335,315,280,245,210,180,155,112,87,43,18],
    [270,250,225,205,185,160,135,101,82,41,17],
    [220,205,190,175,160,140,120,92,77,38,16],
    [175,165,150,140,130,120,110,84,71,35,15],
    [145,135,125,120,110,103,97,76,62,33,15],
    [117,111,107,103,95,90,82,65,55,31,14],
    [95,91,87,83,79,75,67,58,47,30,14],
  ]},
  { sf: 4.00, st: 4.99, rows: [
    [745,645,585,495,415,315,255,155,111,54,23],
    [625,585,525,450,390,295,240,145,106,52,22],
    [565,520,475,410,355,275,225,138,101,50,21],
    [465,430,395,360,315,245,200,127,95,47,20],
    [360,335,315,295,260,215,180,114,90,44,19],
    [280,260,245,230,210,190,160,105,86,41,18],
    [225,210,195,185,170,155,140,95,75,39,17],
    [185,175,160,150,140,130,120,83,66,36,17],
    [150,140,130,120,115,105,100,73,59,34,16],
    [125,115,105,100,95,90,80,65,50,32,16],
  ]},
  { sf: 5.00, st: 5.99, rows: [
    [1000,855,770,690,580,430,315,175,125,60,25],
    [835,750,670,595,520,395,295,170,120,57,23],
    [730,670,595,540,465,360,280,160,115,54,22],
    [605,555,505,460,395,320,260,150,110,51,21],
    [480,445,400,360,325,265,225,140,100,48,21],
    [365,345,315,290,255,225,195,130,95,46,20],
    [280,260,240,220,205,195,170,120,88,43,19],
    [220,210,195,180,170,165,150,110,81,41,18],
    [180,165,155,150,140,135,125,100,69,37,17],
    [150,140,130,125,120,110,100,80,60,34,16],
  ]},
];

function buildSeedRows(tenantId: string, now: string) {
  const rows: Array<{
    tenant_id: string; size_from: number; size_to: number;
    colour: string; clarity: string; price_per_ct: number;
    created_at: string; updated_at: string;
  }> = [];
  for (const band of RAP_SEED) {
    for (let ci = 0; ci < RAP_COLOURS.length; ci++) {
      for (let ki = 0; ki < RAP_CLARITIES.length; ki++) {
        rows.push({
          tenant_id: tenantId,
          size_from: band.sf,
          size_to:   band.st,
          colour:    RAP_COLOURS[ci],
          clarity:   RAP_CLARITIES[ki],
          price_per_ct: band.rows[ci][ki],
          created_at: now,
          updated_at: now,
        });
      }
    }
  }
  return rows;
}

// ── GET ────────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest): Promise<NextResponse> {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  if (!tenantId) return NextResponse.json({ error: "x-tenant-id required" }, { status: 400 });

  try {
    const supabase = await createTenantSupabaseClient(tenantId);

    // Check if seed is needed
    const { data: existing } = await supabase
      .from("rapaport_prices")
      .select("id")
      .eq("tenant_id", tenantId)
      .limit(1);

    if (!existing || existing.length === 0) {
      const now = new Date().toISOString();
      const seedRows = buildSeedRows(tenantId, now);
      // Upsert in batches of 200 to stay under payload limits
      for (let i = 0; i < seedRows.length; i += 200) {
        await supabase.from("rapaport_prices").upsert(
          seedRows.slice(i, i + 200),
          { onConflict: "tenant_id,size_from,size_to,colour,clarity" }
        );
      }
    }

    const [pricesRes, tenantRes] = await Promise.all([
      supabase
        .from("rapaport_prices")
        .select("size_from,size_to,colour,clarity,price_per_ct")
        .eq("tenant_id", tenantId)
        .order("size_from")
        .order("colour")
        .order("clarity"),
      supabase
        .from("tenants")
        .select("rapaport_discount_percent,rapaport_currency_rate")
        .eq("id", tenantId)
        .maybeSingle(),
    ]);

    return NextResponse.json({
      prices:           pricesRes.data ?? [],
      discount_percent: tenantRes.data?.rapaport_discount_percent ?? 0,
      currency_rate:    tenantRes.data?.rapaport_currency_rate    ?? 1.538,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// ── POST ───────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  if (!tenantId) return NextResponse.json({ error: "x-tenant-id required" }, { status: 400 });

  try {
    const body = await req.json() as {
      prices?:           Array<{ size_from: number; size_to: number; colour: string; clarity: string; price_per_ct: number }>;
      discount_percent?: number;
      currency_rate?:    number;
    };

    const supabase = await createTenantSupabaseClient(tenantId);
    const now = new Date().toISOString();

    if (Array.isArray(body.prices) && body.prices.length > 0) {
      const rows = body.prices.map(p => ({
        tenant_id:    tenantId,
        size_from:    p.size_from,
        size_to:      p.size_to,
        colour:       p.colour,
        clarity:      p.clarity,
        price_per_ct: p.price_per_ct,
        updated_at:   now,
      }));
      for (let i = 0; i < rows.length; i += 200) {
        await supabase.from("rapaport_prices").upsert(
          rows.slice(i, i + 200),
          { onConflict: "tenant_id,size_from,size_to,colour,clarity" }
        );
      }
    }

    const tenantUpdate: Record<string, number> = {};
    if (body.discount_percent !== undefined) tenantUpdate.rapaport_discount_percent = body.discount_percent;
    if (body.currency_rate    !== undefined) tenantUpdate.rapaport_currency_rate    = body.currency_rate;

    if (Object.keys(tenantUpdate).length > 0) {
      await supabase.from("tenants").update(tenantUpdate).eq("id", tenantId);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

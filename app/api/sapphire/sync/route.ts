import { NextRequest, NextResponse } from "next/server";
import { getSapphireToken, clearSapphireTokenCache } from "@/lib/sapphire-auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export const dynamic   = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

const STOCK_ENDPOINT = "http://api.sapphirexport.com/api/Stock/GetStock";
const MELEE_CARAT_MAX = 0.30;

type SapphireStoneRaw = {
  Stock_No?:     string;
  Shape?:        string;
  Carat?:        number | string;
  Color?:        string;
  Clarity?:      string;
  Cut?:          string;
  Polish?:       string;
  Symmetry?:     string;
  Fluorescence?: string;
  Lab?:          string;
  Asking_Rate?:  number | string;
  Total_Price?:  number | string;
  Stock_Type?:   string;
  Availability?: string;
  Length?:       number | string;
  Width?:        number | string;
  Depth?:        number | string;
};

async function fetchStockPage(token: string, page: number): Promise<{ items: SapphireStoneRaw[]; hasMore: boolean }> {
  const controller = new AbortController();
  const timeoutId  = setTimeout(() => controller.abort(), 30000);

  let res: Response;
  let text: string;
  try {
    res = await fetch(STOCK_ENDPOINT, {
      method:  "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body:   JSON.stringify({ Page: page, PageSize: 200 }),
      signal: controller.signal,
    });
    text = await res.text();
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    const e = err instanceof Error ? err : new Error(String(err));
    throw new Error(`Sapphire stock fetch failed (page ${page}): ${e.message}`);
  }
  clearTimeout(timeoutId);

  if (!res.ok) {
    throw new Error(`Sapphire stock HTTP ${res.status} on page ${page}: ${text.slice(0, 200)}`);
  }

  let json: { Data?: { Stock?: SapphireStoneRaw[]; TotalCount?: number } };
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Sapphire stock non-JSON response on page ${page}: ${text.slice(0, 200)}`);
  }

  const items = json?.Data?.Stock ?? [];
  const total = json?.Data?.TotalCount ?? 0;
  const fetched = (page - 1) * 200 + items.length;
  return { items, hasMore: fetched < total };
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  console.log("[sapphire/sync] handler invoked");

  // Manager-only: validate role via Supabase session
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "manager" && profile?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden — manager only" }, { status: 403 });
  }

  try {
    const token = await getSapphireToken();

    const allItems: SapphireStoneRaw[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      console.log(`[sapphire/sync] fetching page ${page}...`);
      let result: { items: SapphireStoneRaw[]; hasMore: boolean };
      try {
        result = await fetchStockPage(token, page);
      } catch (err) {
        // If first page auth-fails, clear cache and retry once
        if (page === 1) {
          clearSapphireTokenCache();
          const freshToken = await getSapphireToken(true);
          result = await fetchStockPage(freshToken, page);
        } else {
          throw err;
        }
      }
      allItems.push(...result.items);
      hasMore = result.hasMore;
      page++;
      if (page > 100) break; // safety cap
    }

    console.log(`[sapphire/sync] fetched ${allItems.length} total stones`);

    // Filter to melee only (≤ 0.30ct)
    const melee = allItems.filter(s => Number(s.Carat ?? 0) <= MELEE_CARAT_MAX);
    console.log(`[sapphire/sync] ${melee.length} melee stones after filter`);

    if (melee.length === 0) {
      return NextResponse.json({ synced: 0, message: "No melee stones found in stock feed" });
    }

    // Upsert in batches of 500
    const db = createServerSupabaseClient();
    const rows = melee.map(s => ({
      stock_no:     String(s.Stock_No ?? ""),
      shape:        s.Shape        ?? null,
      carat:        s.Carat        != null ? Number(s.Carat)       : null,
      color:        s.Color        ?? null,
      clarity:      s.Clarity      ?? null,
      cut:          s.Cut          ?? null,
      polish:       s.Polish       ?? null,
      symmetry:     s.Symmetry     ?? null,
      fluorescence: s.Fluorescence ?? null,
      lab:          s.Lab          ?? null,
      asking_rate:  s.Asking_Rate  != null ? Number(s.Asking_Rate) : null,
      total_price:  s.Total_Price  != null ? Number(s.Total_Price) : null,
      stock_type:   s.Stock_Type   ?? null,
      availability: s.Availability ?? null,
      length:       s.Length       != null ? Number(s.Length)      : null,
      width:        s.Width        != null ? Number(s.Width)        : null,
      depth:        s.Depth        != null ? Number(s.Depth)        : null,
      synced_at:    new Date().toISOString(),
    })).filter(r => r.stock_no);

    let synced = 0;
    const BATCH = 500;
    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH);
      const { error } = await db
        .from("sapphire_stock")
        .upsert(batch, { onConflict: "stock_no" });
      if (error) {
        console.error("[sapphire/sync] upsert error:", error.message);
        throw new Error(`DB upsert failed: ${error.message}`);
      }
      synced += batch.length;
    }

    console.log(`[sapphire/sync] upserted ${synced} melee stones`);
    return NextResponse.json({ synced, total_fetched: allItems.length });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[sapphire/sync] fatal error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

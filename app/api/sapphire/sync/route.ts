import { NextRequest, NextResponse } from "next/server";
import { getSapphireCredentials, clearSapphireTokenCache } from "@/lib/sapphire-auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { createServerClient } from "@supabase/ssr";

export const dynamic    = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

const STOCK_ENDPOINT  = "http://api.sapphirexport.com/api/Stock/GetStock";
const MELEE_CARAT_MAX = 0.30;
const PAGE_SIZE       = 100;

type SapphireStoneRaw = {
  StockNo?:      string;
  ShapeName?:    string;
  Carat?:        number | string;
  ColorName?:    string;
  ClarityName?:  string;
  CutName?:      string;
  PolName?:      string;
  SymName?:      string;
  FLName?:       string;
  LabName?:      string;
  LabReportNo?:  string;
  AskingRate?:   number | string;
  StockTypeName?: string;
  Webstatus?:    string;
  Length?:       number | string;
  Width?:        number | string;
  Height?:       number | string;
};

async function fetchStockPage(
  token: string,
  userId: string,
  page: number,
): Promise<{ items: SapphireStoneRaw[]; hasMore: boolean }> {
  const controller = new AbortController();
  const timeoutId  = setTimeout(() => controller.abort(), 30000);

  let res: Response;
  let text: string;
  try {
    res = await fetch(STOCK_ENDPOINT, {
      method:  "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `bearer ${token}`,
      },
      body:   JSON.stringify({ UserID: userId, Token: token, Page: page, Limit: PAGE_SIZE }),
      signal: controller.signal,
    });
    text = await res.text();
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    const e = err instanceof Error ? err : new Error(String(err));
    throw new Error(`Sapphire GetStock fetch failed (page ${page}): ${e.message}`);
  }
  clearTimeout(timeoutId);

  if (!res.ok) {
    throw new Error(`Sapphire GetStock HTTP ${res.status} on page ${page}: ${text.slice(0, 200)}`);
  }

  let json: { Data?: { Stock?: SapphireStoneRaw[]; TotalCount?: number } };
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Sapphire GetStock non-JSON on page ${page}: ${text.slice(0, 200)}`);
  }

  const items    = json?.Data?.Stock ?? [];
  const total    = Number(json?.Data?.TotalCount ?? 0);
  const fetched  = (page - 1) * PAGE_SIZE + items.length;
  return { items, hasMore: items.length === PAGE_SIZE && fetched < total };
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  console.log("[sapphire/sync] handler invoked");

  // Use @supabase/ssr to create a session-aware client that reads the auth
  // cookie from the request. createServerSupabaseClient() uses the service-role
  // key which cannot identify the calling user, so auth.getUser() always
  // returned null and the route incorrectly responded 401.
  const sessionClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return req.cookies.getAll(); },
        setAll() { /* route handlers cannot set cookies */ },
      },
    }
  );

  const { data: { user }, error: userError } = await sessionClient.auth.getUser();
  console.log("[sapphire/sync] getUser result — user:", user?.id ?? "null", "error:", userError?.message ?? "none");
  if (!user) {
    console.log("[sapphire/sync] returning 401 — no authenticated user");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Use service-role client for the profile lookup (bypasses RLS)
  const supabase = createServerSupabaseClient();
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  console.log("[sapphire/sync] profile role:", profile?.role ?? "null", "error:", profileError?.message ?? "none");
  if (profile?.role !== "manager" && profile?.role !== "admin") {
    console.log("[sapphire/sync] returning 403 — role", profile?.role ?? "null", "not permitted");
    return NextResponse.json({ error: "Forbidden — manager or admin only" }, { status: 403 });
  }
  console.log("[sapphire/sync] auth passed — role:", profile.role);

  try {
    let creds = await getSapphireCredentials();

    const allItems: SapphireStoneRaw[] = [];
    let page    = 1;
    let hasMore = true;

    while (hasMore) {
      console.log(`[sapphire/sync] fetching page ${page}...`);
      let result: { items: SapphireStoneRaw[]; hasMore: boolean };
      try {
        result = await fetchStockPage(creds.token, creds.userId, page);
      } catch (err) {
        if (page === 1) {
          console.warn("[sapphire/sync] page 1 failed — clearing cache and retrying");
          clearSapphireTokenCache();
          creds  = await getSapphireCredentials(true);
          result = await fetchStockPage(creds.token, creds.userId, page);
        } else {
          throw err;
        }
      }
      allItems.push(...result.items);
      hasMore = result.hasMore;
      page++;
      if (page > 200) break; // safety cap — 200 pages × 100 = 20k stones max
    }

    const totalScanned = allItems.length;
    console.log(`[sapphire/sync] fetched ${totalScanned} total stones across ${page - 1} pages`);

    const melee = allItems.filter(s => Number(s.Carat ?? 0) <= MELEE_CARAT_MAX);
    console.log(`[sapphire/sync] ${melee.length} melee stones (≤ ${MELEE_CARAT_MAX}ct) after filter`);

    if (melee.length === 0) {
      return NextResponse.json({ synced: 0, total_scanned: totalScanned, message: "No melee stones found in stock feed" });
    }

    const db   = createServerSupabaseClient();
    const now  = new Date().toISOString();
    const rows = melee.map(s => {
      const carat      = s.Carat      != null ? Number(s.Carat)     : null;
      const askingRate = s.AskingRate != null ? Number(s.AskingRate) : null;
      return {
        stock_no:     String(s.StockNo ?? ""),
        shape:        s.ShapeName    ?? null,
        carat,
        color:        s.ColorName    ?? null,
        clarity:      s.ClarityName  ?? null,
        cut:          s.CutName      ?? null,
        polish:       s.PolName      ?? null,
        symmetry:     s.SymName      ?? null,
        fluorescence: s.FLName       ?? null,
        lab:          s.LabName      ?? null,
        asking_rate:  askingRate,
        total_price:  askingRate != null && carat != null ? askingRate * carat : null,
        stock_type:   s.StockTypeName ?? null,
        availability: s.Webstatus    ?? null,
        length:       s.Length != null ? Number(s.Length) : null,
        width:        s.Width  != null ? Number(s.Width)  : null,
        depth:        s.Height != null ? Number(s.Height) : null,
        synced_at:    now,
      };
    }).filter(r => r.stock_no);

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
    return NextResponse.json({ synced, total_scanned: totalScanned });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[sapphire/sync] fatal error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

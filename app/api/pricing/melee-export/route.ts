// GET /api/pricing/melee-export — download the full current melee price list
// as a CSV in the standard import format (Origin, Shape, Quality, Carat, mm,
// $/carat, $/stone), so it can be checked at any time or used as a starting
// template for the next monthly file. Read access — same level as viewing
// the Settings → Melee table (any authenticated tenant user); editing prices
// stays manager-only.
//
// Paginates fully (same fix as /api/pricing) — an unranged select() would
// silently cap at PostgREST's default 1000-row page size.

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/require-auth";
import { createTenantSupabaseClient } from "@/lib/supabase-server";
import { rowsToCsv } from "@/lib/melee-import-shared.mjs";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface MeleeStoneRow {
  origin: string | null; shape: string | null; quality: string | null;
  size_from: number | null; mm: string | null;
  price_per_carat: number | null; price_per_stone: number | null;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;
  const { tenantId } = auth.ctx;
  const supabase = await createTenantSupabaseClient(tenantId);

  const PAGE = 1000;
  const all: MeleeStoneRow[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("pricing_melee_stones")
      .select("origin, shape, quality, size_from, mm, price_per_carat, price_per_stone")
      .order("origin", { ascending: true })
      .order("shape", { ascending: true })
      .order("size_from", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const page = (data ?? []) as MeleeStoneRow[];
    all.push(...page);
    if (page.length < PAGE) break;
    from += PAGE;
  }

  const csv = rowsToCsv(all);
  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="melee-price-list-${stamp}.csv"`,
    },
  });
}

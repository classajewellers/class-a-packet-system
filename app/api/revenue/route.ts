import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createTenantSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from") ?? new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split("T")[0];
  const to   = searchParams.get("to")   ?? new Date().toISOString().split("T")[0];
  const type = searchParams.get("type") ?? "all"; // all | repair | custom_order | online_order

  const tenantId = req.headers.get('x-tenant-id') ?? ''
  const supabase = await createTenantSupabaseClient(tenantId);

  // Extend `to` to end of day
  const toExtended = new Date(to);
  toExtended.setDate(toExtended.getDate() + 1);

  let query = supabase
    .from("packets")
    .select("id, created_at, packet_type, total_charges, reference_number, customer_first_name, customer_last_name")
    .gte("created_at", `${from}T00:00:00`)
    .lt("created_at", toExtended.toISOString().split("T")[0] + "T00:00:00")
    .not("total_charges", "is", null)
    .gt("total_charges", 0)
    .order("created_at", { ascending: true });

  if (type !== "all") {
    query = query.eq("packet_type", type);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[revenue] Supabase error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = data ?? [];

  // Summary stats
  const totalRevenue = rows.reduce((s, r) => s + (r.total_charges ?? 0), 0);
  const orderCount   = rows.length;
  const avgOrderValue = orderCount > 0 ? totalRevenue / orderCount : 0;
  const largestOrder  = rows.reduce((max, r) => Math.max(max, r.total_charges ?? 0), 0);

  // Day-by-day breakdown
  const byDay: Record<string, { date: string; count: number; revenue: number }> = {};
  for (const row of rows) {
    const day = row.created_at.split("T")[0];
    if (!byDay[day]) byDay[day] = { date: day, count: 0, revenue: 0 };
    byDay[day].count   += 1;
    byDay[day].revenue += row.total_charges ?? 0;
  }
  const daily = Object.values(byDay).map((d) => ({
    ...d,
    avg: d.count > 0 ? d.revenue / d.count : 0,
  }));

  return NextResponse.json({
    summary: { totalRevenue, orderCount, avgOrderValue, largestOrder },
    daily,
    rows,
  });
}

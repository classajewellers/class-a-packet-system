// Sales report — first section migrated onto the reporting engine
// (lib/reporting/engine.ts). Produces byte-for-byte the same JSON shape as
// the original hardcoded "sales" block in app/api/reporting/route.ts —
// verified by running both against the same real data and diffing the
// output before this was ever wired into the live route. See
// VAULT_BUILD_CHECKLIST.md Phase 2.3 for the verification method.

import { SupabaseClient } from "@supabase/supabase-js";
import { addDays, average, groupByKey, percentChange, priorPeriodRange, sumBy, topN } from "@/lib/reporting/engine";

interface SalesPacketRow {
  reference_number: string;
  packet_type: string | null;
  staff_member: string | null;
  total_charges: number | null;
  created_at: string;
  customer_first_name: string | null;
  customer_last_name: string | null;
}

export async function buildSalesReport(
  supabase: SupabaseClient,
  { tenantId, start, end }: { tenantId: string; start: string; end: string }
) {
  const endPlusOne = addDays(end, 1);

  const salesQ = supabase
    .from("packets")
    .select("*")
    .gte("created_at", start)
    .lt("created_at", endPlusOne)
    .neq("packet_type", "client_intake")
    .gt("total_charges", 0)
    .order("created_at", { ascending: true });
  const { data: packets, error } = await (tenantId ? salesQ.eq("tenant_id", tenantId) : salesQ);
  if (error) throw new Error(error.message);

  const rows = (packets ?? []) as SalesPacketRow[];
  const totalRevenue = sumBy(rows, (r) => r.total_charges);
  const orderCount = rows.length;
  const avgOrderValue = average(totalRevenue, orderCount);

  const { priorStart } = priorPeriodRange(start, end);

  const priorQ = supabase
    .from("packets")
    .select("total_charges")
    .gte("created_at", priorStart)
    .lt("created_at", start)
    .neq("packet_type", "client_intake")
    .gt("total_charges", 0);
  const { data: priorPackets } = await (tenantId ? priorQ.eq("tenant_id", tenantId) : priorQ);

  const priorRows = (priorPackets ?? []) as Pick<SalesPacketRow, "total_charges">[];
  const priorRevenue = sumBy(priorRows, (r) => r.total_charges);
  const priorOrderCount = priorRows.length;
  const revChange = percentChange(totalRevenue, priorRevenue);
  const orderChange = percentChange(orderCount, priorOrderCount);

  const daily = groupByKey(rows, (r) => r.created_at.split("T")[0], (r) => r.total_charges)
    .map((d) => ({ date: d.key, revenue: d.sum, count: d.count, avg: average(d.sum, d.count) }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const byType = groupByKey(rows, (r) => r.packet_type ?? "unknown", (r) => r.total_charges)
    .map((t) => ({ type: t.key, revenue: t.sum, count: t.count }));

  const byStaff = groupByKey(
    rows.filter((r) => r.packet_type !== "online_order"),
    (r) => r.staff_member ?? "Unknown",
    (r) => r.total_charges
  )
    .map((s) => ({ staff: s.key, revenue: s.sum, count: s.count }))
    .sort((a, b) => b.revenue - a.revenue);

  const topOrders = topN(rows, (r) => r.total_charges, 10).map((r) => ({
    reference_number: r.reference_number,
    customer: [r.customer_first_name, r.customer_last_name].filter(Boolean).join(" ") || "—",
    type: r.packet_type,
    staff: r.staff_member ?? "—",
    total: r.total_charges,
    date: r.created_at.split("T")[0],
  }));

  return {
    _meta: { section: "sales", start, end, recordCount: rows.length },
    summary: { totalRevenue, orderCount, avgOrderValue, priorRevenue, priorOrderCount, revChange, orderChange },
    daily,
    byType,
    byStaff,
    topOrders,
  };
}


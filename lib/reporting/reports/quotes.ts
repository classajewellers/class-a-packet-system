// Quotes report — fourth section migrated onto the reporting engine
// (lib/reporting/engine.ts). Produces byte-for-byte the same JSON shape as
// the original hardcoded "quotes" block in app/api/reporting/route.ts —
// verified by running both against the same real data and diffing the
// output before this was ever wired into the live route. See
// VAULT_BUILD_CHECKLIST.md Phase 2.3.
//
// byStaff tracks four counters per staff member (total/won/lost/converted),
// not a single sum — genuinely bespoke, so it stays a small local reducer
// here rather than being forced through the engine's single-metric
// groupByKey just to look generic.

import { SupabaseClient } from "@supabase/supabase-js";
import { addDays, average, diffDays, groupByKey } from "@/lib/reporting/engine";

interface QuoteRow {
  status: string | null;
  converted_to_packet_id: string | null;
  total: number | null;
  quoted_price: number | null;
  job_won_at: string | null;
  created_at: string;
  assigned_to: string | null;
  staff_member: string | null;
  reference_number: string | null;
  customer_first_name: string | null;
  customer_last_name: string | null;
}

export async function buildQuotesReport(
  supabase: SupabaseClient,
  { tenantId, start, end }: { tenantId: string; start: string; end: string }
) {
  const endPlusOne = addDays(end, 1);

  const quotesQ = supabase
    .from("quotes")
    .select("*")
    .gte("created_at", start)
    .lt("created_at", endPlusOne)
    .order("created_at", { ascending: true });
  const { data: quotes, error } = await (tenantId ? quotesQ.eq("tenant_id", tenantId) : quotesQ);
  if (error) throw new Error(error.message);

  const rows = (quotes ?? []) as QuoteRow[];
  const totalCreated = rows.length;
  const wonCount = rows.filter((r) => r.status === "job_won").length;
  const lostCount = rows.filter((r) => r.status === "job_lost").length;
  const convertedCount = rows.filter((r) => r.converted_to_packet_id != null).length;
  const conversionRate = totalCreated > 0 ? ((wonCount + convertedCount) / totalCreated) * 100 : 0;

  const pipeline = rows.filter((r) => r.status !== "job_lost" && r.status !== "job_won");
  const totalPipelineValue = pipeline.reduce((s, r) => s + (r.total ?? r.quoted_price ?? 0), 0);

  const wonWithDate = rows.filter((r) => r.status === "job_won" && r.job_won_at);
  const closeDaysSum = wonWithDate.reduce(
    (s, r) => s + diffDays(r.created_at.split("T")[0], r.job_won_at!.split("T")[0]),
    0
  );
  const avgDaysToClose = average(closeDaysSum, wonWithDate.length);

  const byStatus = groupByKey(rows, (r) => r.status ?? "unknown").map((s) => ({ status: s.key, count: s.count }));

  const byStaffBuckets = new Map<string, { staff: string; total: number; won: number; lost: number; converted: number }>();
  for (const r of rows) {
    const staff = r.assigned_to ?? r.staff_member ?? "Unknown";
    if (!byStaffBuckets.has(staff)) byStaffBuckets.set(staff, { staff, total: 0, won: 0, lost: 0, converted: 0 });
    const b = byStaffBuckets.get(staff)!;
    b.total += 1;
    if (r.status === "job_won") b.won += 1;
    if (r.status === "job_lost") b.lost += 1;
    if (r.converted_to_packet_id) b.converted += 1;
  }
  const byStaff = Array.from(byStaffBuckets.values())
    .map((s) => ({ ...s, rate: s.total > 0 ? ((s.won + s.converted) / s.total) * 100 : 0 }))
    .sort((a, b) => b.total - a.total);

  const pipelineList = pipeline.slice(0, 50).map((r) => ({
    reference_number: r.reference_number ?? "—",
    customer: [r.customer_first_name, r.customer_last_name].filter(Boolean).join(" ") || "—",
    staff: r.assigned_to ?? r.staff_member ?? "—",
    status: r.status ?? "—",
    value: r.total ?? r.quoted_price ?? 0,
    date: r.created_at.split("T")[0],
  }));

  return {
    _meta: { section: "quotes", start, end, recordCount: rows.length },
    summary: { totalCreated, wonCount, lostCount, convertedCount, conversionRate, totalPipelineValue, avgDaysToClose },
    byStatus,
    byStaff,
    pipeline: pipelineList,
  };
}

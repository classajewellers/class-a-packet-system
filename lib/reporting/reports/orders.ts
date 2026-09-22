// Orders report — second section migrated onto the reporting engine
// (lib/reporting/engine.ts). Produces byte-for-byte the same JSON shape as
// the original hardcoded "orders" block in app/api/reporting/route.ts —
// verified by running both against the same real data and diffing the
// output before this was ever wired into the live route. See
// VAULT_BUILD_CHECKLIST.md Phase 2.3.

import { SupabaseClient } from "@supabase/supabase-js";
import { addDays, average, diffDays, groupByKey, todayISO } from "@/lib/reporting/engine";

interface OrderPacketRow {
  created_at: string;
  due_date: string | null;
  packet_type: string | null;
}

interface OverdueCandidateRow {
  reference_number: string;
  customer_first_name: string | null;
  customer_last_name: string | null;
  packet_type: string;
  due_date: string;
  label_printed: boolean | null;
}

export async function buildOrdersReport(
  supabase: SupabaseClient,
  { tenantId, start, end }: { tenantId: string; start: string; end: string }
) {
  const endPlusOne = addDays(end, 1);
  const today = todayISO();

  const ordersQ = supabase
    .from("packets")
    .select("*")
    .gte("created_at", start)
    .lt("created_at", endPlusOne)
    .order("created_at", { ascending: true });
  const { data: packets, error } = await (tenantId ? ordersQ.eq("tenant_id", tenantId) : ordersQ);
  if (error) throw new Error(error.message);

  const rows = (packets ?? []) as OrderPacketRow[];
  const totalCreated = rows.length;

  const withDue = rows.filter((r) => r.due_date);
  const turnaroundSum = withDue.reduce((s, r) => s + diffDays(r.created_at.split("T")[0], r.due_date!), 0);
  const avgTurnaround = average(turnaroundSum, withDue.length);

  // Overdue: repair + custom_order, past due date, not yet label-printed.
  // Fetch candidates then filter in JS to avoid complex OR syntax.
  const overdueQ = supabase
    .from("packets")
    .select("id, reference_number, packet_type, due_date, customer_first_name, customer_last_name, label_printed")
    .in("packet_type", ["repair", "custom_order"])
    .lt("due_date", today)
    .order("due_date", { ascending: true })
    .limit(200);
  const { data: overduePackets } = await (tenantId ? overdueQ.eq("tenant_id", tenantId) : overdueQ);

  const overdueRows = ((overduePackets ?? []) as OverdueCandidateRow[]).filter((r) => !r.label_printed);
  const overdueCount = overdueRows.length;

  const daily = groupByKey(rows, (r) => r.created_at.split("T")[0])
    .map((d) => ({ date: d.key, count: d.count }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const byType = groupByKey(rows, (r) => r.packet_type ?? "unknown").map((t) => ({ type: t.key, count: t.count }));

  const overdue = overdueRows.map((r) => ({
    reference_number: r.reference_number,
    customer: [r.customer_first_name, r.customer_last_name].filter(Boolean).join(" ") || "—",
    type: r.packet_type,
    due_date: r.due_date,
    days_overdue: diffDays(r.due_date, today),
  }));

  return {
    _meta: { section: "orders", start, end, recordCount: rows.length },
    summary: { totalCreated, overdueCount, avgTurnaround },
    daily,
    byType,
    overdue,
  };
}

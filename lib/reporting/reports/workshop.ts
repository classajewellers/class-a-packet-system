// Workshop report — third section migrated onto the reporting engine
// (lib/reporting/engine.ts). Produces byte-for-byte the same JSON shape as
// the original hardcoded "workshop" block in app/api/reporting/route.ts —
// verified by running both against the same real data and diffing the
// output before this was ever wired into the live route. See
// VAULT_BUILD_CHECKLIST.md Phase 2.3.

import { SupabaseClient } from "@supabase/supabase-js";
import { diffDays, groupByKey, todayISO } from "@/lib/reporting/engine";

interface WorkshopJobRow {
  stage: string | null;
  stage_changed_at: string | null;
  assigned_jeweller: string | null;
  due_date: string | null;
  reference_number: string | null;
  customer_surname: string | null;
}

const EMPTY_REPORT = (start: string, end: string) => ({
  _meta: { section: "workshop", start, end, recordCount: 0 },
  summary: { totalActive: 0, completedInPeriod: 0, overdueCount: 0 },
  byJeweller: [] as unknown[],
  byStage: [] as unknown[],
  overdue: [] as unknown[],
});

export async function buildWorkshopReport(
  supabase: SupabaseClient,
  { tenantId, start, end }: { tenantId: string; start: string; end: string }
) {
  const endPlusOne = new Date(end);
  endPlusOne.setDate(endPlusOne.getDate() + 1);
  const endPlusOneISO = endPlusOne.toISOString().split("T")[0];
  const today = todayISO();

  const jobsQ = supabase.from("workshop_jobs").select("*").order("created_at", { ascending: false });
  const { data: jobs, error } = await (tenantId ? jobsQ.eq("tenant_id", tenantId) : jobsQ);

  // Gracefully handle table-not-found — matches the original route's
  // behaviour exactly (workshop_jobs may not exist on every deployment).
  if (error) {
    if (error.code === "42P01") return EMPTY_REPORT(start, end);
    throw new Error(error.message);
  }

  const rows = (jobs ?? []) as WorkshopJobRow[];
  const activeJobs = rows.filter((r) => r.stage !== "completed");

  const completedInPeriod = rows.filter(
    (r) => r.stage === "completed" && r.stage_changed_at && r.stage_changed_at >= start && r.stage_changed_at < endPlusOneISO
  );

  const byJeweller = groupByKey(activeJobs, (r) => r.assigned_jeweller ?? "Unassigned")
    .map((j) => ({ jeweller: j.key, count: j.count }))
    .sort((a, b) => b.count - a.count);

  const byStage = groupByKey(activeJobs, (r) => r.stage ?? "unknown")
    .map((s) => ({ stage: s.key, count: s.count }))
    .sort((a, b) => b.count - a.count);

  const overdue = activeJobs
    .filter((r) => r.due_date && r.due_date < today)
    .map((r) => ({
      reference_number: r.reference_number ?? "—",
      customer_surname: r.customer_surname ?? "—",
      jeweller: r.assigned_jeweller ?? "Unassigned",
      stage: r.stage ?? "—",
      due_date: r.due_date,
      days_overdue: r.due_date ? diffDays(r.due_date, today) : 0,
    }))
    .sort((a, b) => b.days_overdue - a.days_overdue);

  return {
    _meta: { section: "workshop", start, end, recordCount: rows.length },
    summary: { totalActive: activeJobs.length, completedInPeriod: completedInPeriod.length, overdueCount: overdue.length },
    byJeweller,
    byStage,
    overdue,
  };
}

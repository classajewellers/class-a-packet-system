// Workshop report. Reads packets (the live workshop jobs), not the empty
// workshop_jobs table. JSON shape stays the one WorkshopSection already
// renders: summary, byJeweller, byStage, overdue.

import { SupabaseClient } from "@supabase/supabase-js";
import { WORKSHOP_JOB_TYPES } from "@/lib/deriveJobType";
import { diffDays, groupByKey, todayISO } from "@/lib/reporting/engine";

interface PacketRow {
  status: string | null;
  status_updated_at: string | null;
  assigned_to: string | null;
  workshop_subcontractor_name: string | null;
  due_date: string | null;
  reference_number: string | null;
  customer_last_name: string | null;
  job_type: string | null;
}

interface ProfileName {
  id: string;
  full_name: string | null;
}

const STAGE_LABELS: Record<string, string> = {
  intake: "Intake",
  on_bench: "Production",
  quality_check: "Quality Control",
  to_be_valued: "Valuation",
  ready: "Ready",
  collected: "Collected",
  pending: "Pending",
};

const EMPTY_REPORT = (start: string, end: string) => ({
  _meta: { section: "workshop", start, end, recordCount: 0 },
  summary: { totalActive: 0, completedInPeriod: 0, overdueCount: 0 },
  byJeweller: [] as unknown[],
  byStage: [] as unknown[],
  overdue: [] as unknown[],
});

function stageLabel(status: string | null): string {
  if (!status) return "—";
  return STAGE_LABELS[status] ?? status;
}

function inRange(iso: string | null, start: string, endExclusive: string): boolean {
  if (!iso) return false;
  return iso >= start && iso < endExclusive;
}

export async function buildWorkshopReport(
  supabase: SupabaseClient,
  { tenantId, start, end }: { tenantId: string; start: string; end: string }
) {
  const endPlusOne = new Date(end);
  endPlusOne.setDate(endPlusOne.getDate() + 1);
  const endPlusOneISO = endPlusOne.toISOString().split("T")[0];
  const today = todayISO();

  let jobsQ = supabase
    .from("packets")
    .select("status, status_updated_at, assigned_to, workshop_subcontractor_name, due_date, reference_number, customer_last_name, job_type")
    .in("job_type", [...WORKSHOP_JOB_TYPES])
    .order("created_at", { ascending: false });
  if (tenantId) jobsQ = jobsQ.eq("tenant_id", tenantId);

  const { data: jobs, error } = await jobsQ;
  if (error) {
    if (error.code === "42P01") return EMPTY_REPORT(start, end);
    throw new Error(error.message);
  }

  const rows = (jobs ?? []) as PacketRow[];
  const profileIds = Array.from(new Set(rows.map((r) => r.assigned_to).filter((id): id is string => !!id)));
  const names = new Map<string, string>();
  if (profileIds.length > 0) {
    const { data: profiles, error: profileError } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", profileIds);
    if (profileError) throw new Error(profileError.message);
    for (const profile of (profiles ?? []) as ProfileName[]) {
      const name = (profile.full_name ?? "").trim();
      if (name) names.set(profile.id, name);
    }
  }

  const jewellerOf = (r: PacketRow) => {
    if (r.assigned_to) {
      const name = names.get(r.assigned_to);
      if (name) return name;
    }
    if (r.workshop_subcontractor_name) return r.workshop_subcontractor_name;
    return "Unassigned";
  };

  // collected is the packet equivalent of the old workshop_jobs "completed" stage.
  const activeJobs = rows.filter((r) => r.status !== "collected");
  const completedInPeriod = rows.filter(
    (r) => r.status === "collected" && inRange(r.status_updated_at, start, endPlusOneISO)
  );

  const byJeweller = groupByKey(activeJobs, jewellerOf)
    .map((j) => ({ jeweller: j.key, count: j.count }))
    .sort((a, b) => b.count - a.count);

  const byStage = groupByKey(activeJobs, (r) => stageLabel(r.status))
    .map((s) => ({ stage: s.key, count: s.count }))
    .sort((a, b) => b.count - a.count);

  const overdue = activeJobs
    .filter((r) => r.due_date && r.due_date < today)
    .map((r) => ({
      reference_number: r.reference_number ?? "—",
      customer_surname: r.customer_last_name ?? "—",
      jeweller: jewellerOf(r),
      stage: stageLabel(r.status),
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

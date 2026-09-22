// Staff report — sixth and final section migrated onto the reporting engine
// (lib/reporting/engine.ts). Produces byte-for-byte the same JSON shape as
// the original hardcoded "staff" block in app/api/reporting/route.ts —
// verified by running both against the same real data and diffing the
// output before this was ever wired into the live route. See
// VAULT_BUILD_CHECKLIST.md Phase 2.3.
//
// Per-staff performance combines two independent sources (packets +
// quotes) into one row per staff name, each tracking multiple counters —
// a genuinely bespoke shape, so it stays a local Map-based reducer here
// rather than being forced through groupByKey.

import { SupabaseClient } from "@supabase/supabase-js";
import { addDays } from "@/lib/reporting/engine";

interface StaffPacketRow {
  staff_member: string | null;
  total_charges: number | null;
  created_at: string;
  packet_type: string | null;
}

interface StaffQuoteRow {
  assigned_to: string | null;
  staff_member: string | null;
  status: string | null;
}

interface StaffRow {
  staff: string;
  ordersCreated: number;
  revenueGenerated: number;
  quotesCreated: number;
  quotesWon: number;
}

export async function buildStaffReport(
  supabase: SupabaseClient,
  { tenantId, start, end }: { tenantId: string; start: string; end: string }
) {
  const endPlusOne = addDays(end, 1);

  const staffPacketsQ = supabase
    .from("packets")
    .select("staff_member, total_charges, created_at, packet_type")
    .gte("created_at", start)
    .lt("created_at", endPlusOne)
    .neq("packet_type", "client_intake");
  const { data: packets, error: pe } = await (tenantId ? staffPacketsQ.eq("tenant_id", tenantId) : staffPacketsQ);
  if (pe) throw new Error(pe.message);

  const staffQuotesQ = supabase
    .from("quotes")
    .select("assigned_to, staff_member, status")
    .gte("created_at", start)
    .lt("created_at", endPlusOne);
  const { data: quotes, error: qe } = await (tenantId ? staffQuotesQ.eq("tenant_id", tenantId) : staffQuotesQ);
  if (qe) throw new Error(qe.message);

  const packetRows = (packets ?? []) as StaffPacketRow[];
  const quoteRows = (quotes ?? []) as StaffQuoteRow[];

  const staffMap = new Map<string, StaffRow>();
  const ensure = (name: string) => {
    if (!staffMap.has(name)) {
      staffMap.set(name, { staff: name, ordersCreated: 0, revenueGenerated: 0, quotesCreated: 0, quotesWon: 0 });
    }
  };

  for (const p of packetRows) {
    const s = p.staff_member ?? "Unknown";
    ensure(s);
    const entry = staffMap.get(s)!;
    entry.ordersCreated += 1;
    entry.revenueGenerated += p.total_charges ?? 0;
  }

  for (const q of quoteRows) {
    const s = q.assigned_to ?? q.staff_member ?? "Unknown";
    ensure(s);
    const entry = staffMap.get(s)!;
    entry.quotesCreated += 1;
    if (q.status === "job_won") entry.quotesWon += 1;
  }

  const performance = Array.from(staffMap.values())
    .map((s) => ({
      ...s,
      conversionRate: s.quotesCreated > 0 ? (s.quotesWon / s.quotesCreated) * 100 : 0,
    }))
    .sort((a, b) => b.revenueGenerated - a.revenueGenerated);

  return {
    _meta: { section: "staff", start, end, recordCount: packetRows.length },
    performance,
  };
}

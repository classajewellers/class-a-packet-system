// Customers report — fifth section migrated onto the reporting engine
// (lib/reporting/engine.ts). Produces byte-for-byte the same JSON shape as
// the original hardcoded "customers" block in app/api/reporting/route.ts —
// verified by running both against the same real data and diffing the
// output before this was ever wired into the live route. See
// VAULT_BUILD_CHECKLIST.md Phase 2.3.
//
// Unlike every other section, this one aggregates across ALL packets ever
// (no created_at filter on the initial query) and only uses start/end
// afterward to classify customers as new/returning within the selected
// window. The per-customer roll-up (first/last visit, total spend) is a
// genuinely different shape than the engine's groupByKey — it's a running
// accumulator keyed by email, not a one-pass count+sum — so it stays a
// local Map-based reducer here.

import { SupabaseClient } from "@supabase/supabase-js";
import { addDays, todayISO } from "@/lib/reporting/engine";

interface CustomerPacketRow {
  customer_email: string | null;
  customer_first_name: string | null;
  customer_last_name: string | null;
  customer_phone: string | null;
  total_charges: number | null;
  created_at: string;
}

interface CustomerEntry {
  name: string;
  email: string;
  phone: string | null;
  totalOrders: number;
  totalSpend: number;
  firstVisit: string;
  lastVisit: string;
}

export async function buildCustomersReport(
  supabase: SupabaseClient,
  { tenantId, start, end }: { tenantId: string; start: string; end: string }
) {
  const today = todayISO();

  const custPacketsQ = supabase
    .from("packets")
    .select("customer_email, customer_first_name, customer_last_name, customer_phone, total_charges, created_at")
    .not("customer_email", "is", null)
    .neq("customer_email", "")
    .order("created_at", { ascending: true });
  const { data: packets, error } = await (tenantId ? custPacketsQ.eq("tenant_id", tenantId) : custPacketsQ);
  if (error) throw new Error(error.message);

  const rows = (packets ?? []) as CustomerPacketRow[];
  const byEmail = new Map<string, CustomerEntry>();

  for (const p of rows) {
    const email = p.customer_email?.trim();
    if (!email) continue;
    if (!byEmail.has(email)) {
      byEmail.set(email, {
        name: [p.customer_first_name, p.customer_last_name].filter(Boolean).join(" ") || "—",
        email,
        phone: p.customer_phone ?? null,
        totalOrders: 0,
        totalSpend: 0,
        firstVisit: p.created_at,
        lastVisit: p.created_at,
      });
    }
    const entry = byEmail.get(email)!;
    entry.totalOrders += 1;
    entry.totalSpend += p.total_charges ?? 0;
    if (p.created_at < entry.firstVisit) entry.firstVisit = p.created_at;
    if (p.created_at > entry.lastVisit) entry.lastVisit = p.created_at;
    if (entry.name === "—" && (p.customer_first_name || p.customer_last_name)) {
      entry.name = [p.customer_first_name, p.customer_last_name].filter(Boolean).join(" ") || "—";
    }
  }

  const allCustomers = Array.from(byEmail.values());
  const totalCustomers = allCustomers.length;

  const date90 = addDays(today, -90);
  const date180 = addDays(today, -180);
  const date365 = addDays(today, -365);

  const activeCustomers = allCustomers.filter((c) => c.lastVisit.split("T")[0] >= date90).length;

  const newInPeriod = allCustomers.filter(
    (c) => c.firstVisit.split("T")[0] >= start && c.firstVisit.split("T")[0] <= end
  ).length;

  const returningInPeriod = allCustomers.filter(
    (c) => c.firstVisit.split("T")[0] < start && c.lastVisit.split("T")[0] >= start && c.lastVisit.split("T")[0] <= end
  ).length;

  const topCustomers = [...allCustomers]
    .sort((a, b) => b.totalSpend - a.totalSpend)
    .slice(0, 20)
    .map((c) => ({
      name: c.name,
      email: c.email,
      phone: c.phone,
      total_orders: c.totalOrders,
      total_spend: c.totalSpend,
      last_visit_date: c.lastVisit.split("T")[0],
    }));

  const toRow = (c: CustomerEntry) => ({
    name: c.name,
    email: c.email,
    phone: c.phone,
    last_visit_date: c.lastVisit.split("T")[0],
    total_spend: c.totalSpend,
  });

  const inactive90 = allCustomers.filter((c) => c.lastVisit.split("T")[0] < date90).sort((a, b) => a.lastVisit.localeCompare(b.lastVisit)).slice(0, 100).map(toRow);
  const inactive180 = allCustomers.filter((c) => c.lastVisit.split("T")[0] < date180).sort((a, b) => a.lastVisit.localeCompare(b.lastVisit)).slice(0, 100).map(toRow);
  const inactive365 = allCustomers.filter((c) => c.lastVisit.split("T")[0] < date365).sort((a, b) => a.lastVisit.localeCompare(b.lastVisit)).slice(0, 100).map(toRow);

  return {
    _meta: { section: "customers", start, end, recordCount: rows.length, uniqueCustomers: totalCustomers },
    summary: { newInPeriod, returningInPeriod, totalCustomers, activeCustomers },
    topCustomers,
    inactive90,
    inactive180,
    inactive365,
  };
}

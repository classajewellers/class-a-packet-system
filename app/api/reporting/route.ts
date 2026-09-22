import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";
import { buildSalesReport } from "@/lib/reporting/reports/sales";
import { buildOrdersReport } from "@/lib/reporting/reports/orders";
import { buildWorkshopReport } from "@/lib/reporting/reports/workshop";
import { buildQuotesReport } from "@/lib/reporting/reports/quotes";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function todayISO() {
  return new Date().toISOString().split("T")[0];
}
function addDays(iso: string, days: number) {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}
function diffDays(a: string, b: string) {
  return Math.floor((new Date(b).getTime() - new Date(a).getTime()) / 86400000);
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  const section = searchParams.get("section") ?? "sales";
  const start =
    searchParams.get("start") ??
    new Date(new Date().getFullYear(), new Date().getMonth(), 1)
      .toISOString()
      .split("T")[0];
  const end = searchParams.get("end") ?? todayISO();

  console.log("[reporting] section:", section, "start:", start, "end:", end);

  const tenantId = req.headers.get('x-tenant-id') ?? ''
  const supabase = await createTenantSupabaseClient(tenantId);
  const today = todayISO();
  // endPlusOne used for exclusive upper-bound on date comparisons
  const endPlusOne = addDays(end, 1);

  try {
    // ── INVENTORY ──────────────────────────────────────────────────────────────
    if (section === "inventory") {
      return NextResponse.json({
        _meta: { section, start, end, recordCount: 0 },
        placeholder: true,
      });
    }

    // ── SALES ──────────────────────────────────────────────────────────────────
    // Migrated onto the reporting engine (lib/reporting/engine.ts,
    // lib/reporting/reports/sales.ts) — 2026-09-22. Verified byte-for-byte
    // identical output against the original hardcoded implementation before
    // this swap (both a populated-range and a zero-rows case) — see
    // VAULT_BUILD_CHECKLIST.md Phase 2.3. First section moved; the rest
    // (orders/workshop/quotes/customers/staff) migrate incrementally.
    if (section === "sales") {
      try {
        const report = await buildSalesReport(supabase, { tenantId, start, end });
        return NextResponse.json(report);
      } catch (err) {
        return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
      }
    }

    // ── ORDERS ─────────────────────────────────────────────────────────────────
    // Migrated onto the reporting engine — 2026-09-22. Verified byte-for-byte
    // identical against the original hardcoded implementation on real
    // staging data (populated range + zero-rows edge case) before this swap.
    if (section === "orders") {
      try {
        const report = await buildOrdersReport(supabase, { tenantId, start, end });
        return NextResponse.json(report);
      } catch (err) {
        return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
      }
    }

    // ── WORKSHOP ───────────────────────────────────────────────────────────────
    // Migrated onto the reporting engine — 2026-09-22. Verified byte-for-byte
    // identical against the original hardcoded implementation on real
    // staging data, plus a simulated table-not-found (42P01) case since
    // workshop_jobs exists but is empty on staging so that branch couldn't
    // be exercised for real.
    if (section === "workshop") {
      try {
        const report = await buildWorkshopReport(supabase, { tenantId, start, end });
        return NextResponse.json(report);
      } catch (err) {
        return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
      }
    }

    // ── QUOTES ─────────────────────────────────────────────────────────────────
    // Migrated onto the reporting engine — 2026-09-22. Verified byte-for-byte
    // identical against the original hardcoded implementation on real
    // staging data (populated range + zero-rows edge case) before this swap.
    if (section === "quotes") {
      try {
        const report = await buildQuotesReport(supabase, { tenantId, start, end });
        return NextResponse.json(report);
      } catch (err) {
        return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
      }
    }

    // ── CUSTOMERS ──────────────────────────────────────────────────────────────
    if (section === "customers") {
      // Query all packets that have a customer email
      const custPacketsQ = supabase
        .from("packets")
        .select(
          "customer_email, customer_first_name, customer_last_name, customer_phone, total_charges, created_at"
        )
        .not("customer_email", "is", null)
        .neq("customer_email", "")
        .order("created_at", { ascending: true });
      const { data: packets, error } = await (tenantId ? custPacketsQ.eq("tenant_id", tenantId) : custPacketsQ);

      console.log(
        "[reporting:customers] packets:",
        packets?.length ?? 0,
        "error:",
        error?.message ?? "none"
      );
      if (error)
        return NextResponse.json({ error: error.message }, { status: 500 });

      type CustomerEntry = {
        name: string;
        email: string;
        phone: string | null;
        totalOrders: number;
        totalSpend: number;
        firstVisit: string;
        lastVisit: string;
      };
      const byEmail: Record<string, CustomerEntry> = {};

      for (const p of packets ?? []) {
        const email = (p.customer_email as string | null)?.trim();
        if (!email) continue;
        if (!byEmail[email]) {
          byEmail[email] = {
            name:
              [p.customer_first_name, p.customer_last_name]
                .filter(Boolean)
                .join(" ") || "—",
            email,
            phone: (p.customer_phone as string | null) ?? null,
            totalOrders: 0,
            totalSpend: 0,
            firstVisit: p.created_at as string,
            lastVisit: p.created_at as string,
          };
        }
        byEmail[email].totalOrders += 1;
        byEmail[email].totalSpend += (p.total_charges as number | null) ?? 0;
        if ((p.created_at as string) < byEmail[email].firstVisit)
          byEmail[email].firstVisit = p.created_at as string;
        if ((p.created_at as string) > byEmail[email].lastVisit)
          byEmail[email].lastVisit = p.created_at as string;
        if (
          byEmail[email].name === "—" &&
          (p.customer_first_name || p.customer_last_name)
        ) {
          byEmail[email].name =
            [p.customer_first_name, p.customer_last_name]
              .filter(Boolean)
              .join(" ") || "—";
        }
      }

      const allCustomers = Object.values(byEmail);
      const totalCustomers = allCustomers.length;

      const date90 = addDays(today, -90);
      const date180 = addDays(today, -180);
      const date365 = addDays(today, -365);

      const activeCustomers = allCustomers.filter(
        (c) => c.lastVisit.split("T")[0] >= date90
      ).length;

      // New = first packet within selected range
      const newInPeriod = allCustomers.filter(
        (c) =>
          c.firstVisit.split("T")[0] >= start &&
          c.firstVisit.split("T")[0] <= end
      ).length;

      // Returning = had visits before range AND within range
      const returningInPeriod = allCustomers.filter(
        (c) =>
          c.firstVisit.split("T")[0] < start &&
          c.lastVisit.split("T")[0] >= start &&
          c.lastVisit.split("T")[0] <= end
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

      const inactive90 = allCustomers
        .filter((c) => c.lastVisit.split("T")[0] < date90)
        .sort((a, b) => a.lastVisit.localeCompare(b.lastVisit))
        .slice(0, 100)
        .map(toRow);
      const inactive180 = allCustomers
        .filter((c) => c.lastVisit.split("T")[0] < date180)
        .sort((a, b) => a.lastVisit.localeCompare(b.lastVisit))
        .slice(0, 100)
        .map(toRow);
      const inactive365 = allCustomers
        .filter((c) => c.lastVisit.split("T")[0] < date365)
        .sort((a, b) => a.lastVisit.localeCompare(b.lastVisit))
        .slice(0, 100)
        .map(toRow);

      return NextResponse.json({
        _meta: {
          section,
          start,
          end,
          recordCount: (packets ?? []).length,
          uniqueCustomers: totalCustomers,
        },
        summary: { newInPeriod, returningInPeriod, totalCustomers, activeCustomers },
        topCustomers,
        inactive90,
        inactive180,
        inactive365,
      });
    }

    // ── STAFF ──────────────────────────────────────────────────────────────────
    if (section === "staff") {
      const staffPacketsQ = supabase
        .from("packets")
        .select("staff_member, total_charges, created_at, packet_type")
        .gte("created_at", start)
        .lt("created_at", endPlusOne)
        .neq("packet_type", "client_intake");
      const { data: packets, error: pe } = await (tenantId ? staffPacketsQ.eq("tenant_id", tenantId) : staffPacketsQ);

      console.log(
        "[reporting:staff] packets:",
        packets?.length ?? 0,
        "error:",
        pe?.message ?? "none"
      );

      const staffQuotesQ = supabase
        .from("quotes")
        .select("assigned_to, staff_member, status")
        .gte("created_at", start)
        .lt("created_at", endPlusOne);
      const { data: quotes, error: qe } = await (tenantId ? staffQuotesQ.eq("tenant_id", tenantId) : staffQuotesQ);

      console.log(
        "[reporting:staff] quotes:",
        quotes?.length ?? 0,
        "error:",
        qe?.message ?? "none"
      );

      if (pe)
        return NextResponse.json({ error: pe.message }, { status: 500 });
      if (qe)
        return NextResponse.json({ error: qe.message }, { status: 500 });

      type StaffRow = {
        staff: string;
        ordersCreated: number;
        revenueGenerated: number;
        quotesCreated: number;
        quotesWon: number;
      };
      const staffMap: Record<string, StaffRow> = {};

      const ensure = (name: string) => {
        if (!staffMap[name])
          staffMap[name] = {
            staff: name,
            ordersCreated: 0,
            revenueGenerated: 0,
            quotesCreated: 0,
            quotesWon: 0,
          };
      };

      for (const p of packets ?? []) {
        const s =
          (p.staff_member as string | null) ?? "Unknown";
        ensure(s);
        staffMap[s].ordersCreated += 1;
        staffMap[s].revenueGenerated +=
          (p.total_charges as number | null) ?? 0;
      }

      for (const q of quotes ?? []) {
        const s =
          (q.assigned_to as string | null) ??
          (q.staff_member as string | null) ??
          "Unknown";
        ensure(s);
        staffMap[s].quotesCreated += 1;
        if (q.status === "job_won") staffMap[s].quotesWon += 1;
      }

      const performance = Object.values(staffMap)
        .map((s) => ({
          ...s,
          conversionRate:
            s.quotesCreated > 0
              ? (s.quotesWon / s.quotesCreated) * 100
              : 0,
        }))
        .sort((a, b) => b.revenueGenerated - a.revenueGenerated);

      return NextResponse.json({
        _meta: {
          section,
          start,
          end,
          recordCount: (packets ?? []).length,
        },
        performance,
      });
    }

    return NextResponse.json({ error: "Unknown section" }, { status: 400 });
  } catch (err) {
    console.error("[reporting] Unhandled error:", err);
    return NextResponse.json(
      { error: String(err) },
      { status: 500 }
    );
  }
}

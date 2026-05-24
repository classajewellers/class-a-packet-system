import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";

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

  const supabase = createServerSupabaseClient();
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
    if (section === "sales") {
      // Use select("*") and plain date strings (matching admin/packets API pattern)
      const { data: packets, error } = await supabase
        .from("packets")
        .select("*")
        .gte("created_at", start)
        .lt("created_at", endPlusOne)
        .neq("packet_type", "client_intake")
        .gt("total_charges", 0)
        .order("created_at", { ascending: true });

      console.log(
        "[reporting:sales] packets:",
        packets?.length ?? 0,
        "error:",
        error?.message ?? "none"
      );
      if (error)
        return NextResponse.json({ error: error.message }, { status: 500 });

      const rows = packets ?? [];
      const totalRevenue = rows.reduce(
        (s: number, r: { total_charges?: number | null }) =>
          s + (r.total_charges ?? 0),
        0
      );
      const orderCount = rows.length;
      const avgOrderValue = orderCount > 0 ? totalRevenue / orderCount : 0;

      // Prior period
      const duration = diffDays(start, end) + 1;
      const priorEnd = addDays(start, -1);
      const priorStart = addDays(priorEnd, -(duration - 1));

      const { data: priorPackets } = await supabase
        .from("packets")
        .select("total_charges")
        .gte("created_at", priorStart)
        .lt("created_at", start)
        .neq("packet_type", "client_intake")
        .gt("total_charges", 0);

      const priorRows = priorPackets ?? [];
      const priorRevenue = priorRows.reduce(
        (s: number, r: { total_charges?: number | null }) =>
          s + (r.total_charges ?? 0),
        0
      );
      const priorOrderCount = priorRows.length;
      const revChange =
        priorRevenue > 0
          ? ((totalRevenue - priorRevenue) / priorRevenue) * 100
          : null;
      const orderChange =
        priorOrderCount > 0
          ? ((orderCount - priorOrderCount) / priorOrderCount) * 100
          : null;

      // Daily
      type DayBucket = { date: string; revenue: number; count: number };
      const byDay: Record<string, DayBucket> = {};
      for (const r of rows) {
        const day = (r.created_at as string).split("T")[0];
        if (!byDay[day]) byDay[day] = { date: day, revenue: 0, count: 0 };
        byDay[day].revenue += r.total_charges ?? 0;
        byDay[day].count += 1;
      }
      const daily = Object.values(byDay)
        .map((d) => ({ ...d, avg: d.count > 0 ? d.revenue / d.count : 0 }))
        .sort((a, b) => a.date.localeCompare(b.date));

      // By type
      type TypeBucket = { type: string; revenue: number; count: number };
      const byTypeMap: Record<string, TypeBucket> = {};
      for (const r of rows) {
        const t = (r.packet_type as string) ?? "unknown";
        if (!byTypeMap[t]) byTypeMap[t] = { type: t, revenue: 0, count: 0 };
        byTypeMap[t].revenue += r.total_charges ?? 0;
        byTypeMap[t].count += 1;
      }
      const byType = Object.values(byTypeMap);

      // By staff (exclude online_order)
      type StaffBucket = { staff: string; revenue: number; count: number };
      const byStaffMap: Record<string, StaffBucket> = {};
      for (const r of rows.filter(
        (r: { packet_type?: string | null }) => r.packet_type !== "online_order"
      )) {
        const s = (r.staff_member as string | null) ?? "Unknown";
        if (!byStaffMap[s])
          byStaffMap[s] = { staff: s, revenue: 0, count: 0 };
        byStaffMap[s].revenue += r.total_charges ?? 0;
        byStaffMap[s].count += 1;
      }
      const byStaff = Object.values(byStaffMap).sort(
        (a, b) => b.revenue - a.revenue
      );

      // Top orders
      const topOrders = [...rows]
        .sort(
          (
            a: { total_charges?: number | null },
            b: { total_charges?: number | null }
          ) => (b.total_charges ?? 0) - (a.total_charges ?? 0)
        )
        .slice(0, 10)
        .map((r) => ({
          reference_number: r.reference_number,
          customer:
            [r.customer_first_name, r.customer_last_name]
              .filter(Boolean)
              .join(" ") || "—",
          type: r.packet_type,
          staff: r.staff_member ?? "—",
          total: r.total_charges,
          date: (r.created_at as string).split("T")[0],
        }));

      return NextResponse.json({
        _meta: { section, start, end, recordCount: rows.length },
        summary: {
          totalRevenue,
          orderCount,
          avgOrderValue,
          priorRevenue,
          priorOrderCount,
          revChange,
          orderChange,
        },
        daily,
        byType,
        byStaff,
        topOrders,
      });
    }

    // ── ORDERS ─────────────────────────────────────────────────────────────────
    if (section === "orders") {
      const { data: packets, error } = await supabase
        .from("packets")
        .select("*")
        .gte("created_at", start)
        .lt("created_at", endPlusOne)
        .order("created_at", { ascending: true });

      console.log(
        "[reporting:orders] packets:",
        packets?.length ?? 0,
        "error:",
        error?.message ?? "none"
      );
      if (error)
        return NextResponse.json({ error: error.message }, { status: 500 });

      const rows = packets ?? [];
      const totalCreated = rows.length;

      // Average turnaround (due_date − created_at)
      const withDue = rows.filter((r: { due_date?: string | null }) => r.due_date);
      const avgTurnaround =
        withDue.length > 0
          ? withDue.reduce(
              (s: number, r: { created_at: string; due_date: string }) =>
                s + diffDays(r.created_at.split("T")[0], r.due_date),
              0
            ) / withDue.length
          : 0;

      // Overdue: repair + custom_order, past due date, not yet label-printed
      // Fetch candidates then filter in JS to avoid complex OR syntax
      const { data: overduePackets } = await supabase
        .from("packets")
        .select(
          "id, reference_number, packet_type, due_date, customer_first_name, customer_last_name, label_printed"
        )
        .in("packet_type", ["repair", "custom_order"])
        .lt("due_date", today)
        .order("due_date", { ascending: true })
        .limit(200);

      console.log(
        "[reporting:orders] overduePackets (pre-filter):",
        overduePackets?.length ?? 0
      );

      const overdueRows = (overduePackets ?? []).filter(
        (r: { label_printed?: boolean | null }) => !r.label_printed
      );
      const overdueCount = overdueRows.length;

      // Daily count
      type DayBucket = { date: string; count: number };
      const byDay: Record<string, DayBucket> = {};
      for (const r of rows) {
        const day = (r.created_at as string).split("T")[0];
        if (!byDay[day]) byDay[day] = { date: day, count: 0 };
        byDay[day].count += 1;
      }
      const daily = Object.values(byDay).sort((a, b) =>
        a.date.localeCompare(b.date)
      );

      // By type
      type TypeBucket = { type: string; count: number };
      const byTypeMap: Record<string, TypeBucket> = {};
      for (const r of rows) {
        const t = (r.packet_type as string) ?? "unknown";
        if (!byTypeMap[t]) byTypeMap[t] = { type: t, count: 0 };
        byTypeMap[t].count += 1;
      }
      const byType = Object.values(byTypeMap);

      const overdue = overdueRows.map(
        (r: {
          reference_number: string;
          customer_first_name?: string | null;
          customer_last_name?: string | null;
          packet_type: string;
          due_date: string;
        }) => ({
          reference_number: r.reference_number,
          customer:
            [r.customer_first_name, r.customer_last_name]
              .filter(Boolean)
              .join(" ") || "—",
          type: r.packet_type,
          due_date: r.due_date,
          days_overdue: diffDays(r.due_date, today),
        })
      );

      return NextResponse.json({
        _meta: { section, start, end, recordCount: rows.length },
        summary: { totalCreated, overdueCount, avgTurnaround },
        daily,
        byType,
        overdue,
      });
    }

    // ── WORKSHOP ───────────────────────────────────────────────────────────────
    if (section === "workshop") {
      const { data: jobs, error } = await supabase
        .from("workshop_jobs")
        .select("*")
        .order("created_at", { ascending: false });

      console.log(
        "[reporting:workshop] jobs:",
        jobs?.length ?? 0,
        "error:",
        error?.message ?? "none"
      );

      // Gracefully handle table-not-found
      if (error) {
        if (error.code === "42P01") {
          // Table does not exist yet
          return NextResponse.json({
            _meta: { section, start, end, recordCount: 0 },
            summary: { totalActive: 0, completedInPeriod: 0, overdueCount: 0 },
            byJeweller: [],
            byStage: [],
            overdue: [],
          });
        }
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      const rows = jobs ?? [];
      const activeJobs = rows.filter(
        (r: { stage?: string | null }) => r.stage !== "completed"
      );

      // Completed within the selected period (by stage_changed_at if available)
      const completedInPeriod = rows.filter((r: {
        stage?: string | null;
        stage_changed_at?: string | null;
      }) =>
        r.stage === "completed" &&
        r.stage_changed_at &&
        r.stage_changed_at >= start &&
        r.stage_changed_at < endPlusOne
      );

      // By jeweller
      type JewellerBucket = { jeweller: string; count: number };
      const byJewellerMap: Record<string, JewellerBucket> = {};
      for (const r of activeJobs) {
        const j = (r.assigned_jeweller as string | null) ?? "Unassigned";
        if (!byJewellerMap[j])
          byJewellerMap[j] = { jeweller: j, count: 0 };
        byJewellerMap[j].count += 1;
      }
      const byJeweller = Object.values(byJewellerMap).sort(
        (a, b) => b.count - a.count
      );

      // By stage
      type StageBucket = { stage: string; count: number };
      const byStageMap: Record<string, StageBucket> = {};
      for (const r of activeJobs) {
        const s = (r.stage as string) ?? "unknown";
        if (!byStageMap[s]) byStageMap[s] = { stage: s, count: 0 };
        byStageMap[s].count += 1;
      }
      const byStage = Object.values(byStageMap).sort(
        (a, b) => b.count - a.count
      );

      // Overdue active jobs
      const overdueJobs = activeJobs
        .filter(
          (r: { due_date?: string | null }) =>
            r.due_date && (r.due_date as string) < today
        )
        .map((r: {
          reference_number?: string | null;
          customer_surname?: string | null;
          assigned_jeweller?: string | null;
          stage?: string | null;
          due_date?: string | null;
        }) => ({
          reference_number: r.reference_number ?? "—",
          customer_surname: r.customer_surname ?? "—",
          jeweller: r.assigned_jeweller ?? "Unassigned",
          stage: r.stage ?? "—",
          due_date: r.due_date,
          days_overdue: r.due_date ? diffDays(r.due_date as string, today) : 0,
        }))
        .sort(
          (a: { days_overdue: number }, b: { days_overdue: number }) =>
            b.days_overdue - a.days_overdue
        );

      return NextResponse.json({
        _meta: { section, start, end, recordCount: rows.length },
        summary: {
          totalActive: activeJobs.length,
          completedInPeriod: completedInPeriod.length,
          overdueCount: overdueJobs.length,
        },
        byJeweller,
        byStage,
        overdue: overdueJobs,
      });
    }

    // ── QUOTES ─────────────────────────────────────────────────────────────────
    if (section === "quotes") {
      const { data: quotes, error } = await supabase
        .from("quotes")
        .select("*")
        .gte("created_at", start)
        .lt("created_at", endPlusOne)
        .order("created_at", { ascending: true });

      console.log(
        "[reporting:quotes] quotes:",
        quotes?.length ?? 0,
        "error:",
        error?.message ?? "none"
      );
      if (error)
        return NextResponse.json({ error: error.message }, { status: 500 });

      const rows = quotes ?? [];
      const totalCreated = rows.length;
      const wonCount = rows.filter(
        (r: { status?: string | null }) => r.status === "job_won"
      ).length;
      const convertedCount = rows.filter(
        (r: { converted_to_packet_id?: string | null }) =>
          r.converted_to_packet_id != null
      ).length;
      const conversionRate =
        totalCreated > 0
          ? ((wonCount + convertedCount) / totalCreated) * 100
          : 0;

      const pipeline = rows.filter(
        (r: { status?: string | null }) =>
          r.status !== "job_lost" && r.status !== "job_won"
      );
      // Use total, quoted_price, or line_items total — whichever is populated
      const totalPipelineValue = pipeline.reduce(
        (s: number, r: { total?: number | null; quoted_price?: number | null }) =>
          s + (r.total ?? r.quoted_price ?? 0),
        0
      );

      // Avg days to close (won quotes)
      const wonWithDate = rows.filter(
        (r: { status?: string | null; job_won_at?: string | null }) =>
          r.status === "job_won" && r.job_won_at
      );
      const avgDaysToClose =
        wonWithDate.length > 0
          ? wonWithDate.reduce(
              (s: number, r: { created_at: string; job_won_at: string }) =>
                s +
                diffDays(
                  r.created_at.split("T")[0],
                  r.job_won_at.split("T")[0]
                ),
              0
            ) / wonWithDate.length
          : 0;

      // By status (doughnut)
      type StatusBucket = { status: string; count: number };
      const byStatusMap: Record<string, StatusBucket> = {};
      for (const r of rows) {
        const st = (r.status as string) ?? "unknown";
        if (!byStatusMap[st]) byStatusMap[st] = { status: st, count: 0 };
        byStatusMap[st].count += 1;
      }
      const byStatus = Object.values(byStatusMap);

      // By staff
      type StaffEntry = {
        staff: string;
        total: number;
        won: number;
        lost: number;
        converted: number;
      };
      const byStaffMap: Record<string, StaffEntry> = {};
      for (const r of rows) {
        const s =
          (r.assigned_to as string | null) ??
          (r.staff_member as string | null) ??
          "Unknown";
        if (!byStaffMap[s])
          byStaffMap[s] = { staff: s, total: 0, won: 0, lost: 0, converted: 0 };
        byStaffMap[s].total += 1;
        if (r.status === "job_won") byStaffMap[s].won += 1;
        if (r.status === "job_lost") byStaffMap[s].lost += 1;
        if (r.converted_to_packet_id) byStaffMap[s].converted += 1;
      }
      const byStaff = Object.values(byStaffMap)
        .map((s) => ({
          ...s,
          rate:
            s.total > 0 ? ((s.won + s.converted) / s.total) * 100 : 0,
        }))
        .sort((a, b) => b.total - a.total);

      const pipelineList = pipeline.slice(0, 50).map(
        (r: {
          reference_number?: string | null;
          customer_first_name?: string | null;
          customer_last_name?: string | null;
          assigned_to?: string | null;
          staff_member?: string | null;
          status?: string | null;
          total?: number | null;
          quoted_price?: number | null;
          created_at: string;
        }) => ({
          reference_number: r.reference_number ?? "—",
          customer:
            [r.customer_first_name, r.customer_last_name]
              .filter(Boolean)
              .join(" ") || "—",
          staff: r.assigned_to ?? r.staff_member ?? "—",
          status: r.status ?? "—",
          value: r.total ?? r.quoted_price ?? 0,
          date: r.created_at.split("T")[0],
        })
      );

      return NextResponse.json({
        _meta: { section, start, end, recordCount: rows.length },
        summary: {
          totalCreated,
          wonCount,
          lostCount: rows.filter(
            (r: { status?: string | null }) => r.status === "job_lost"
          ).length,
          convertedCount,
          conversionRate,
          totalPipelineValue,
          avgDaysToClose,
        },
        byStatus,
        byStaff,
        pipeline: pipelineList,
      });
    }

    // ── CUSTOMERS ──────────────────────────────────────────────────────────────
    if (section === "customers") {
      // Query all packets that have a customer email
      const { data: packets, error } = await supabase
        .from("packets")
        .select(
          "customer_email, customer_first_name, customer_last_name, customer_phone, total_charges, created_at"
        )
        .not("customer_email", "is", null)
        .order("created_at", { ascending: true });

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
      const { data: packets, error: pe } = await supabase
        .from("packets")
        .select("staff_member, total_charges, created_at, packet_type")
        .gte("created_at", start)
        .lt("created_at", endPlusOne)
        .neq("packet_type", "client_intake");

      console.log(
        "[reporting:staff] packets:",
        packets?.length ?? 0,
        "error:",
        pe?.message ?? "none"
      );

      const { data: quotes, error: qe } = await supabase
        .from("quotes")
        .select("assigned_to, staff_member, status")
        .gte("created_at", start)
        .lt("created_at", endPlusOne);

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

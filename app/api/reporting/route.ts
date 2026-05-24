import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

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
  const start = searchParams.get("start") ?? new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split("T")[0];
  const end = searchParams.get("end") ?? new Date().toISOString().split("T")[0];

  const supabase = createServerSupabaseClient();
  const today = todayISO();
  const endPlusOne = addDays(end, 1);

  try {
    // ── SALES ──────────────────────────────────────────────────────────────────
    if (section === "sales") {
      const { data: packets, error } = await supabase
        .from("packets")
        .select("id, reference_number, created_at, packet_type, total_charges, customer_first_name, customer_last_name, staff_member")
        .gte("created_at", `${start}T00:00:00`)
        .lt("created_at", `${endPlusOne}T00:00:00`)
        .neq("packet_type", "client_intake")
        .gt("total_charges", 0)
        .order("created_at", { ascending: true });

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      const rows = packets ?? [];
      const totalRevenue = rows.reduce((s, r) => s + (r.total_charges ?? 0), 0);
      const orderCount = rows.length;
      const avgOrderValue = orderCount > 0 ? totalRevenue / orderCount : 0;

      // Prior period
      const duration = diffDays(start, end) + 1;
      const priorEnd = addDays(start, -1);
      const priorStart = addDays(priorEnd, -(duration - 1));
      const priorEndPlusOne = addDays(priorEnd, 1);

      const { data: priorPackets } = await supabase
        .from("packets")
        .select("total_charges")
        .gte("created_at", `${priorStart}T00:00:00`)
        .lt("created_at", `${priorEndPlusOne}T00:00:00`)
        .neq("packet_type", "client_intake")
        .gt("total_charges", 0);

      const priorRows = priorPackets ?? [];
      const priorRevenue = priorRows.reduce((s, r) => s + (r.total_charges ?? 0), 0);
      const priorOrderCount = priorRows.length;
      const revChange = priorRevenue > 0 ? ((totalRevenue - priorRevenue) / priorRevenue) * 100 : null;
      const orderChange = priorOrderCount > 0 ? ((orderCount - priorOrderCount) / priorOrderCount) * 100 : null;

      // Daily
      const byDay: Record<string, { date: string; revenue: number; count: number }> = {};
      for (const r of rows) {
        const day = r.created_at.split("T")[0];
        if (!byDay[day]) byDay[day] = { date: day, revenue: 0, count: 0 };
        byDay[day].revenue += r.total_charges ?? 0;
        byDay[day].count += 1;
      }
      const daily = Object.values(byDay)
        .map((d) => ({ ...d, avg: d.count > 0 ? d.revenue / d.count : 0 }))
        .sort((a, b) => a.date.localeCompare(b.date));

      // By type
      const byTypeMap: Record<string, { type: string; revenue: number; count: number }> = {};
      for (const r of rows) {
        const t = r.packet_type ?? "unknown";
        if (!byTypeMap[t]) byTypeMap[t] = { type: t, revenue: 0, count: 0 };
        byTypeMap[t].revenue += r.total_charges ?? 0;
        byTypeMap[t].count += 1;
      }
      const byType = Object.values(byTypeMap);

      // By staff (exclude online_order)
      const byStaffMap: Record<string, { staff: string; revenue: number; count: number }> = {};
      for (const r of rows.filter((r) => r.packet_type !== "online_order")) {
        const s = r.staff_member ?? "Unknown";
        if (!byStaffMap[s]) byStaffMap[s] = { staff: s, revenue: 0, count: 0 };
        byStaffMap[s].revenue += r.total_charges ?? 0;
        byStaffMap[s].count += 1;
      }
      const byStaff = Object.values(byStaffMap).sort((a, b) => b.revenue - a.revenue);

      // Top orders
      const topOrders = [...rows]
        .sort((a, b) => (b.total_charges ?? 0) - (a.total_charges ?? 0))
        .slice(0, 10)
        .map((r) => ({
          reference_number: r.reference_number,
          customer: [r.customer_first_name, r.customer_last_name].filter(Boolean).join(" ") || "—",
          type: r.packet_type,
          staff: r.staff_member ?? "—",
          total: r.total_charges,
          date: r.created_at.split("T")[0],
        }));

      return NextResponse.json({
        summary: { totalRevenue, orderCount, avgOrderValue, priorRevenue, priorOrderCount, revChange, orderChange },
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
        .select("id, reference_number, created_at, packet_type, due_date, label_printed, customer_first_name, customer_last_name")
        .gte("created_at", `${start}T00:00:00`)
        .lt("created_at", `${endPlusOne}T00:00:00`)
        .order("created_at", { ascending: true });

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      const rows = packets ?? [];
      const totalCreated = rows.length;

      // Overdue: due_date < today AND (label_printed = false OR null)
      const { data: overduePackets } = await supabase
        .from("packets")
        .select("id, reference_number, packet_type, due_date, label_printed, customer_first_name, customer_last_name")
        .lt("due_date", today)
        .or("label_printed.is.null,label_printed.eq.false")
        .order("due_date", { ascending: true })
        .limit(50);

      const overdueRows = overduePackets ?? [];
      const overdueCount = overdueRows.length;

      // Daily
      const byDay: Record<string, { date: string; count: number }> = {};
      for (const r of rows) {
        const day = r.created_at.split("T")[0];
        if (!byDay[day]) byDay[day] = { date: day, count: 0 };
        byDay[day].count += 1;
      }
      const daily = Object.values(byDay).sort((a, b) => a.date.localeCompare(b.date));

      // By type
      const byTypeMap: Record<string, { type: string; count: number }> = {};
      for (const r of rows) {
        const t = r.packet_type ?? "unknown";
        if (!byTypeMap[t]) byTypeMap[t] = { type: t, count: 0 };
        byTypeMap[t].count += 1;
      }
      const byType = Object.values(byTypeMap);

      const overdue = overdueRows.map((r) => ({
        reference_number: r.reference_number,
        customer: [r.customer_first_name, r.customer_last_name].filter(Boolean).join(" ") || "—",
        type: r.packet_type,
        due_date: r.due_date,
        days_overdue: r.due_date ? diffDays(r.due_date, today) : 0,
      }));

      return NextResponse.json({
        summary: { totalCreated, overdueCount },
        daily,
        byType,
        overdue,
      });
    }

    // ── WORKSHOP ───────────────────────────────────────────────────────────────
    if (section === "workshop") {
      const { data: jobs, error } = await supabase
        .from("workshop_jobs")
        .select("id, reference_number, customer_surname, created_at, stage, assigned_jeweller, due_date, category")
        .order("created_at", { ascending: false });

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      const rows = jobs ?? [];
      const activeJobs = rows.filter((r) => r.stage !== "completed");

      // By jeweller
      const byJewellerMap: Record<string, { jeweller: string; count: number }> = {};
      for (const r of activeJobs) {
        const j = r.assigned_jeweller ?? "Unassigned";
        if (!byJewellerMap[j]) byJewellerMap[j] = { jeweller: j, count: 0 };
        byJewellerMap[j].count += 1;
      }
      const byJeweller = Object.values(byJewellerMap);

      // Overdue
      const overdueJobs = activeJobs
        .filter((r) => r.due_date && r.due_date < today)
        .map((r) => ({
          reference_number: r.reference_number,
          customer_surname: r.customer_surname,
          jeweller: r.assigned_jeweller ?? "Unassigned",
          stage: r.stage,
          due_date: r.due_date,
          days_overdue: r.due_date ? diffDays(r.due_date, today) : 0,
        }))
        .sort((a, b) => b.days_overdue - a.days_overdue);

      return NextResponse.json({ byJeweller, overdue: overdueJobs });
    }

    // ── QUOTES ─────────────────────────────────────────────────────────────────
    if (section === "quotes") {
      const { data: quotes, error } = await supabase
        .from("quotes")
        .select("id, reference_number, created_at, status, total, quoted_price, assigned_to, customer_first_name, customer_last_name, converted_to_packet_id, job_won_at")
        .gte("created_at", `${start}T00:00:00`)
        .lt("created_at", `${endPlusOne}T00:00:00`)
        .order("created_at", { ascending: true });

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      const rows = quotes ?? [];
      const totalCreated = rows.length;
      const wonCount = rows.filter((r) => r.status === "job_won").length;
      const lostCount = rows.filter((r) => r.status === "job_lost").length;
      const convertedCount = rows.filter((r) => r.converted_to_packet_id != null).length;
      const conversionRate = totalCreated > 0 ? (wonCount / totalCreated) * 100 : 0;

      const pipeline = rows.filter((r) => r.status !== "job_lost" && r.status !== "job_won");
      const totalPipelineValue = pipeline.reduce((s, r) => s + (r.total ?? r.quoted_price ?? 0), 0);

      // Avg days to close (won quotes)
      const wonWithDate = rows.filter((r) => r.status === "job_won" && r.job_won_at);
      const avgDaysToClose =
        wonWithDate.length > 0
          ? wonWithDate.reduce((s, r) => s + diffDays(r.created_at.split("T")[0], r.job_won_at!.split("T")[0]), 0) / wonWithDate.length
          : 0;

      // By staff
      const byStaffMap: Record<string, { staff: string; total: number; won: number; lost: number; converted: number }> = {};
      for (const r of rows) {
        const s = r.assigned_to ?? "Unknown";
        if (!byStaffMap[s]) byStaffMap[s] = { staff: s, total: 0, won: 0, lost: 0, converted: 0 };
        byStaffMap[s].total += 1;
        if (r.status === "job_won") byStaffMap[s].won += 1;
        if (r.status === "job_lost") byStaffMap[s].lost += 1;
        if (r.converted_to_packet_id) byStaffMap[s].converted += 1;
      }
      const byStaff = Object.values(byStaffMap)
        .map((s) => ({ ...s, rate: s.total > 0 ? (s.won / s.total) * 100 : 0 }))
        .sort((a, b) => b.total - a.total);

      const pipelineList = pipeline.map((r) => ({
        reference_number: r.reference_number,
        customer: [r.customer_first_name, r.customer_last_name].filter(Boolean).join(" ") || "—",
        staff: r.assigned_to ?? "—",
        status: r.status,
        value: r.total ?? r.quoted_price ?? 0,
        date: r.created_at.split("T")[0],
      }));

      return NextResponse.json({
        summary: { totalCreated, wonCount, lostCount, convertedCount, conversionRate, totalPipelineValue, avgDaysToClose },
        byStaff,
        pipeline: pipelineList,
      });
    }

    // ── CUSTOMERS ──────────────────────────────────────────────────────────────
    if (section === "customers") {
      const date90 = addDays(today, -90);
      const date180 = addDays(today, -180);
      const date365 = addDays(today, -365);

      const { data: allCustomers, error } = await supabase
        .from("customers")
        .select("id, first_name, last_name, email, phone, total_orders, total_spend, last_visit_date, created_at")
        .order("total_spend", { ascending: false });

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      const customers = allCustomers ?? [];
      const totalCustomers = customers.length;
      const activeCustomers = customers.filter((c) => c.last_visit_date && c.last_visit_date >= date90).length;

      const newInPeriod = customers.filter(
        (c) => c.created_at >= `${start}T00:00:00` && c.created_at < `${endPlusOne}T00:00:00`
      ).length;

      const topCustomers = customers.slice(0, 20).map((c) => ({
        name: [c.first_name, c.last_name].filter(Boolean).join(" ") || "—",
        email: c.email,
        phone: c.phone,
        total_orders: c.total_orders,
        total_spend: c.total_spend,
        last_visit_date: c.last_visit_date,
      }));

      const inactive90 = customers
        .filter((c) => c.last_visit_date && c.last_visit_date < date90)
        .map((c) => ({
          name: [c.first_name, c.last_name].filter(Boolean).join(" ") || "—",
          email: c.email,
          phone: c.phone,
          last_visit_date: c.last_visit_date,
          total_spend: c.total_spend,
        }));

      const inactive180 = customers
        .filter((c) => c.last_visit_date && c.last_visit_date < date180)
        .map((c) => ({
          name: [c.first_name, c.last_name].filter(Boolean).join(" ") || "—",
          email: c.email,
          phone: c.phone,
          last_visit_date: c.last_visit_date,
          total_spend: c.total_spend,
        }));

      const inactive365 = customers
        .filter((c) => c.last_visit_date && c.last_visit_date < date365)
        .map((c) => ({
          name: [c.first_name, c.last_name].filter(Boolean).join(" ") || "—",
          email: c.email,
          phone: c.phone,
          last_visit_date: c.last_visit_date,
          total_spend: c.total_spend,
        }));

      return NextResponse.json({
        summary: { newInPeriod, totalCustomers, activeCustomers },
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
        .select("staff_member, total_charges")
        .gte("created_at", `${start}T00:00:00`)
        .lt("created_at", `${endPlusOne}T00:00:00`)
        .neq("packet_type", "client_intake");

      const { data: quotes, error: qe } = await supabase
        .from("quotes")
        .select("assigned_to, status")
        .gte("created_at", `${start}T00:00:00`)
        .lt("created_at", `${endPlusOne}T00:00:00`);

      if (pe) return NextResponse.json({ error: pe.message }, { status: 500 });
      if (qe) return NextResponse.json({ error: qe.message }, { status: 500 });

      const staffMap: Record<
        string,
        { staff: string; ordersCreated: number; revenueGenerated: number; quotesCreated: number; quotesWon: number }
      > = {};

      for (const p of packets ?? []) {
        const s = p.staff_member ?? "Unknown";
        if (!staffMap[s]) staffMap[s] = { staff: s, ordersCreated: 0, revenueGenerated: 0, quotesCreated: 0, quotesWon: 0 };
        staffMap[s].ordersCreated += 1;
        staffMap[s].revenueGenerated += p.total_charges ?? 0;
      }

      for (const q of quotes ?? []) {
        const s = q.assigned_to ?? "Unknown";
        if (!staffMap[s]) staffMap[s] = { staff: s, ordersCreated: 0, revenueGenerated: 0, quotesCreated: 0, quotesWon: 0 };
        staffMap[s].quotesCreated += 1;
        if (q.status === "job_won") staffMap[s].quotesWon += 1;
      }

      const performance = Object.values(staffMap)
        .map((s) => ({
          ...s,
          conversionRate: s.quotesCreated > 0 ? (s.quotesWon / s.quotesCreated) * 100 : 0,
        }))
        .sort((a, b) => b.revenueGenerated - a.revenueGenerated);

      return NextResponse.json({ performance });
    }

    return NextResponse.json({ error: "Unknown section" }, { status: 400 });
  } catch (err) {
    console.error("[reporting]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

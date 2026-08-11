import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function todayISO(): string {
  return new Date().toISOString().split("T")[0];
}

// Returns the Monday (YYYY-MM-DD, UTC) of the week containing dateStr.
function getMondayISO(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00Z");
  const day = d.getUTCDay(); // 0=Sun, 1=Mon, …, 6=Sat
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().split("T")[0];
}

function addDaysISO(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().split("T")[0];
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  const supabase = await createTenantSupabaseClient(tenantId);

  // Fetch all non-draft, non-cancelled POs with their line costs.
  // Lines without actual_cost are pending invoices we want to forecast.
  const { data, error } = await supabase
    .from("inventory_purchase_orders")
    .select("id, po_number, status, expected_date, lines:inventory_po_lines(id, estimated_cost, actual_cost)")
    .eq("tenant_id", tenantId)
    .neq("status", "cancelled")
    .neq("status", "draft");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Flatten to pending lines only (actual_cost IS NULL)
  const pendingLines: { po_number: string; expected_date: string | null; estimated_cost: number }[] = [];
  for (const po of (data ?? [])) {
    for (const line of (po.lines ?? [])) {
      if (line.actual_cost != null) continue;
      pendingLines.push({
        po_number: po.po_number,
        expected_date: po.expected_date ?? null,
        estimated_cost: Number(line.estimated_cost ?? 0),
      });
    }
  }

  // Build the 8-week window starting from this Monday.
  const today = todayISO();
  const thisMonday = getMondayISO(today);

  const weeks: { start: string; end: string }[] = [];
  for (let i = 0; i < 8; i++) {
    const start = addDaysISO(thisMonday, i * 7);
    const end   = addDaysISO(start, 6); // Sunday
    weeks.push({ start, end });
  }
  const windowEnd = weeks[7].end; // last day of week 8

  // Initialise buckets
  const weekBuckets: Record<string, { total: number; count: number }> = {};
  for (const w of weeks) weekBuckets[w.start] = { total: 0, count: 0 };

  const overdue     = { total: 0, count: 0 };
  const later       = { total: 0, count: 0 };
  const unscheduled = { total: 0, count: 0 };

  for (const line of pendingLines) {
    const cost = line.estimated_cost;

    if (!line.expected_date) {
      unscheduled.total += cost;
      unscheduled.count++;
      continue;
    }

    if (line.expected_date < thisMonday) {
      // Expected in the past — still outstanding, show as overdue
      overdue.total += cost;
      overdue.count++;
      continue;
    }

    if (line.expected_date > windowEnd) {
      later.total += cost;
      later.count++;
      continue;
    }

    // Falls within the 8-week window — find its Monday
    const monday = getMondayISO(line.expected_date);
    if (weekBuckets[monday]) {
      weekBuckets[monday].total += cost;
      weekBuckets[monday].count++;
    }
  }

  const weekData = weeks.map(w => ({
    week_start: w.start,
    week_end:   w.end,
    total:      Math.round(weekBuckets[w.start].total * 100) / 100,
    count:      weekBuckets[w.start].count,
  }));

  const round = (n: number) => Math.round(n * 100) / 100;

  return NextResponse.json({
    weeks:       weekData,
    overdue:     { total: round(overdue.total),     count: overdue.count },
    later:       { total: round(later.total),        count: later.count },
    unscheduled: { total: round(unscheduled.total),  count: unscheduled.count },
    coverage: {
      total_pending_lines:     pendingLines.length,
      scheduled_lines:         pendingLines.filter(l => l.expected_date).length,
      unscheduled_lines:       unscheduled.count,
    },
  }, { headers: { "Cache-Control": "no-store" } });
}

import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";
import { buildSalesReport } from "@/lib/reporting/reports/sales";
import { buildOrdersReport } from "@/lib/reporting/reports/orders";
import { buildWorkshopReport } from "@/lib/reporting/reports/workshop";
import { buildQuotesReport } from "@/lib/reporting/reports/quotes";
import { buildCustomersReport } from "@/lib/reporting/reports/customers";
import { buildStaffReport } from "@/lib/reporting/reports/staff";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function todayISO() {
  return new Date().toISOString().split("T")[0];
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
    // Reads packets. workshop_jobs is empty and is not the live job list.
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
    // Migrated onto the reporting engine — 2026-09-22. Verified byte-for-byte
    // identical against the original hardcoded implementation on real
    // staging data before this swap.
    if (section === "customers") {
      try {
        const report = await buildCustomersReport(supabase, { tenantId, start, end });
        return NextResponse.json(report);
      } catch (err) {
        return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
      }
    }

    // ── STAFF ──────────────────────────────────────────────────────────────────
    // Migrated onto the reporting engine — 2026-09-22. Verified byte-for-byte
    // identical against the original hardcoded implementation on real
    // staging data (populated range + zero-rows edge case) before this swap.
    if (section === "staff") {
      try {
        const report = await buildStaffReport(supabase, { tenantId, start, end });
        return NextResponse.json(report);
      } catch (err) {
        return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
      }
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

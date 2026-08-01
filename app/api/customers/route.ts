import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

interface CustomerRow {
  email: string;
  phone: string | null;
  first_name: string | null;
  last_name: string | null;
  maiden_name: string | null;
  total_orders: number;
  non_repair_orders: number;
  total_quotes: number;
  total_spend: number;
  non_repair_spend: number;
  last_visit: string;
  first_seen: string;
  articles_sample: string;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  const search = (searchParams.get("search") ?? "").toLowerCase().trim();

  try {
    const tenantId = req.headers.get('x-tenant-id') ?? '';
    const supabase = await createTenantSupabaseClient(tenantId);

    const packetsQ = supabase
      .from("packets")
      .select(
        "customer_email, customer_phone, customer_first_name, customer_last_name, total_charges, created_at, articles, instructions, packet_type"
      )
      .order("created_at", { ascending: false });
    const { data: packets, error: pErr } = await (tenantId ? packetsQ.eq("tenant_id", tenantId) : packetsQ);

    if (pErr) {
      return NextResponse.json({ customers: [], error: pErr.message }, { status: 500 });
    }

    let quotes: { customer_email: string | null; customer_phone: string | null; customer_first_name: string | null; customer_last_name: string | null; created_at: string }[] = [];
    try {
      const quotesQ = supabase
        .from("quotes")
        .select("customer_email, customer_phone, customer_first_name, customer_last_name, created_at")
        .order("created_at", { ascending: false });
      const { data: qData } = await (tenantId ? quotesQ.eq("tenant_id", tenantId) : quotesQ);
      quotes = qData ?? [];
    } catch {
      // quotes table may not exist
    }

    const customerProfileMap = new Map<string, { first_name: string | null; last_name: string | null; phone: string | null; maiden_name: string | null; created_at: string }>();
    try {
      const custQ = supabase.from("customers").select("email, first_name, last_name, phone, maiden_name, created_at");
      const { data: custData } = await (tenantId ? custQ.eq("tenant_id", tenantId) : custQ);
      for (const c of custData ?? []) {
        if (c.email) {
          customerProfileMap.set(c.email.toLowerCase().trim(), {
            first_name: c.first_name ?? null,
            last_name: c.last_name ?? null,
            phone: c.phone ?? null,
            maiden_name: c.maiden_name ?? null,
            created_at: c.created_at ?? new Date().toISOString(),
          });
        }
      }
    } catch {
      // customers table may not exist
    }

    const map = new Map<string, CustomerRow>();

    for (const p of packets ?? []) {
      const key = (p.customer_email ?? "").toLowerCase().trim();
      if (!key) continue;

      const existing = map.get(key);
      const amount = typeof p.total_charges === "number" ? p.total_charges : 0;
      const isRepair = p.packet_type === "repair";
      const articles = [p.articles, p.instructions].filter(Boolean).join(" ");

      if (existing) {
        existing.total_orders += 1;
        existing.total_spend += amount;
        if (!isRepair) {
          existing.non_repair_orders += 1;
          existing.non_repair_spend += amount;
        }
        if (p.created_at > existing.last_visit) existing.last_visit = p.created_at;
        if (p.created_at < existing.first_seen) existing.first_seen = p.created_at;
        if (p.customer_first_name && !existing.first_name) existing.first_name = p.customer_first_name;
        if (p.customer_last_name && !existing.last_name) existing.last_name = p.customer_last_name;
        if (p.customer_phone && !existing.phone) existing.phone = p.customer_phone;
        existing.articles_sample += " " +
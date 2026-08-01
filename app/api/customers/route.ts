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
        existing.articles_sample += " " + articles;
      } else {
        map.set(key, {
          email: key,
          phone: p.customer_phone ?? null,
          first_name: p.customer_first_name ?? null,
          last_name: p.customer_last_name ?? null,
          maiden_name: customerProfileMap.get(key)?.maiden_name ?? null,
          total_orders: 1,
          non_repair_orders: isRepair ? 0 : 1,
          total_quotes: 0,
          total_spend: amount,
          non_repair_spend: isRepair ? 0 : amount,
          last_visit: p.created_at,
          first_seen: p.created_at,
          articles_sample: articles,
        });
      }
    }

    for (const q of quotes) {
      const key = (q.customer_email ?? "").toLowerCase().trim();
      if (!key) continue;

      const existing = map.get(key);
      if (existing) {
        existing.total_quotes += 1;
        if (q.created_at > existing.last_visit) existing.last_visit = q.created_at;
        if (q.created_at < existing.first_seen) existing.first_seen = q.created_at;
      } else {
        map.set(key, {
          email: key,
          phone: q.customer_phone ?? null,
          first_name: q.customer_first_name ?? null,
          last_name: q.customer_last_name ?? null,
          maiden_name: customerProfileMap.get(key)?.maiden_name ?? null,
          total_orders: 0,
          non_repair_orders: 0,
          total_quotes: 1,
          total_spend: 0,
          non_repair_spend: 0,
          last_visit: q.created_at,
          first_seen: q.created_at,
          articles_sample: "",
        });
      }
    }

    for (const [key, profile] of Array.from(customerProfileMap)) {
      const existing = map.get(key);
      if (existing) {
        if (profile.first_name) existing.first_name = profile.first_name;
        if (profile.last_name) existing.last_name = profile.last_name;
        if (profile.phone) existing.phone = profile.phone;
        existing.maiden_name = profile.maiden_name ?? existing.maiden_name;
      } else {
        map.set(key, {
          email: key,
          phone: profile.phone,
          first_name: profile.first_name,
          last_name: profile.last_name,
          maiden_name: profile.maiden_name,
          total_orders: 0,
          non_repair_orders: 0,
          total_quotes: 0,
          total_spend: 0,
          non_repair_spend: 0,
          last_visit: profile.created_at,
          first_seen: profile.created_at,
          articles_sample: "",
        });
      }
    }

    let customers = Array.from(map.values()).sort(
      (a, b) => new Date(b.last_visit).getTime() - new Date(a.last_visit).getTime()
    );

    if (search) {
      customers = customers.filter((c) => {
        const name = `${c.first_name ?? ""} ${c.last_name ?? ""}`.toLowerCase();
        return (
          name.includes(search) ||
          (c.maiden_name ?? "").toLowerCase().includes(search) ||
          (c.email ?? "").toLowerCase().includes(search) ||
          (c.phone ?? "").toLowerCase().includes(search) ||
          (c.articles_sample ?? "").toLowerCase().includes(search)
        );
      });
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const result = customers.map(({ articles_sample: _a, ...rest }) => rest);

    return NextResponse.json({ customers: result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ customers: [], error: msg }, { status: 500 });
  }
}

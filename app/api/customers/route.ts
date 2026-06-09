import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createTenantSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

interface CustomerRow {
  email: string;
  phone: string | null;
  first_name: string | null;
  last_name: string | null;
  total_orders: number;
  total_quotes: number;
  total_spend: number;
  last_visit: string;
  first_seen: string;
  articles_sample: string; // for search
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  const search = (searchParams.get("search") ?? "").toLowerCase().trim();

  try {
    const tenantId = req.headers.get('x-tenant-id') ?? ''
    const supabase = await createTenantSupabaseClient(tenantId);

    // Fetch packets — only columns needed for aggregation
    const { data: packets, error: pErr } = await supabase
      .from("packets")
      .select(
        "customer_email, customer_phone, customer_first_name, customer_last_name, total_charges, created_at, articles, instructions"
      )
      .order("created_at", { ascending: false });

    if (pErr) {
      return NextResponse.json({ customers: [], error: pErr.message }, { status: 500 });
    }

    // Fetch quotes — only columns needed
    let quotes: { customer_email: string | null; customer_phone: string | null; customer_first_name: string | null; customer_last_name: string | null; created_at: string }[] = [];
    try {
      const { data: qData } = await supabase
        .from("quotes")
        .select("customer_email, customer_phone, customer_first_name, customer_last_name, created_at")
        .order("created_at", { ascending: false });
      quotes = qData ?? [];
    } catch {
      // quotes table may not exist
    }

    // ── Aggregate by email ───────────────────────────────────────────────────
    const map = new Map<string, CustomerRow>();

    for (const p of packets ?? []) {
      const key = (p.customer_email ?? "").toLowerCase().trim();
      if (!key) continue;

      const existing = map.get(key);
      const amount = typeof p.total_charges === "number" ? p.total_charges : 0;
      const articles = [p.articles, p.instructions].filter(Boolean).join(" ");

      if (existing) {
        existing.total_orders += 1;
        existing.total_spend += amount;
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
          total_orders: 1,
          total_quotes: 0,
          total_spend: amount,
          last_visit: p.created_at,
          first_seen: p.created_at,
          articles_sample: articles,
        });
      }
    }

    // Merge in quotes (creates entry if email-only customer)
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
          total_orders: 0,
          total_quotes: 1,
          total_spend: 0,
          last_visit: q.created_at,
          first_seen: q.created_at,
          articles_sample: "",
        });
      }
    }

    // ── Sort by last_visit desc ───────────────────────────────────────────────
    let customers = Array.from(map.values()).sort(
      (a, b) => new Date(b.last_visit).getTime() - new Date(a.last_visit).getTime()
    );

    // ── Search ────────────────────────────────────────────────────────────────
    if (search) {
      customers = customers.filter((c) => {
        const name = `${c.first_name ?? ""} ${c.last_name ?? ""}`.toLowerCase();
        return (
          name.includes(search) ||
          (c.email ?? "").toLowerCase().includes(search) ||
          (c.phone ?? "").toLowerCase().includes(search) ||
          (c.articles_sample ?? "").toLowerCase().includes(search)
        );
      });
    }

    // Strip the articles_sample field from the response (internal only)
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const result = customers.map(({ articles_sample: _a, ...rest }) => rest);

    return NextResponse.json({ customers: result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ customers: [], error: msg }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

interface TierInfo {
  tier_name: string;
  colour: string;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  const { searchParams } = new URL(req.url);
  const emailsParam = searchParams.get("emails") ?? "";
  const emails = emailsParam
    .split(",")
    .map(e => e.trim().toLowerCase())
    .filter(Boolean);

  if (!emails.length) return NextResponse.json({ results: {} });

  try {
    const supabase = await createTenantSupabaseClient(tenantId);

    // Fetch tier config ordered highest → lowest
    const tierQ = supabase
      .from("vip_tier_config")
      .select("tier_name, tier_order, min_spend, min_orders, colour")
      .order("tier_order", { ascending: false });
    const { data: tiers } = await (tenantId ? tierQ.eq("tenant_id", tenantId) : tierQ);
    if (!tiers?.length) return NextResponse.json({ results: {} });

    // Fetch non-repair packets for these customers
    const packetQ = supabase
      .from("packets")
      .select("customer_email, total_charges, job_type, packet_type")
      .in("customer_email", emails)
      .neq("packet_type", "repair");
    const { data: packets } = await (tenantId ? packetQ.eq("tenant_id", tenantId) : packetQ);

    // Aggregate spend + orders per email (exclude job_type = repair)
    const spendMap = new Map<string, number>();
    const ordersMap = new Map<string, number>();
    for (const p of packets ?? []) {
      const key = (p.customer_email ?? "").toLowerCase().trim();
      if (!key) continue;
      if (p.job_type === "repair") continue;
      spendMap.set(key, (spendMap.get(key) ?? 0) + Number(p.total_charges ?? 0));
      ordersMap.set(key, (ordersMap.get(key) ?? 0) + 1);
    }

    // Compute tier for each email
    const results: Record<string, TierInfo | null> = {};
    for (const email of emails) {
      const spend = spendMap.get(email) ?? 0;
      const orders = ordersMap.get(email) ?? 0;
      const matched = tiers.find(
        t => spend >= Number(t.min_spend) || orders >= t.min_orders
      );
      results[email] = matched
        ? { tier_name: matched.tier_name, colour: matched.colour }
        : null;
    }

    return NextResponse.json({ results });
  } catch (err) {
    return NextResponse.json({ results: {}, error: String(err) }, { status: 500 });
  }
}

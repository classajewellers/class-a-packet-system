import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  try {
    const supabase = await createTenantSupabaseClient(tenantId);
    const q = supabase.from("vip_tier_config").select("*").order("tier_order", { ascending: true });
    const { data, error } = await (tenantId ? q.eq("tenant_id", tenantId) : q);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ tiers: data ?? [] });
  } catch (err) {
    return NextResponse.json({ tiers: [], error: String(err) });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  try {
    const body = await req.json();
    const supabase = await createTenantSupabaseClient(tenantId);
    const { data, error } = await supabase
      .from("vip_tier_config")
      .insert({
        tenant_id: tenantId,
        tier_name: body.tier_name ?? "New Tier",
        tier_order: body.tier_order ?? 0,
        min_spend: body.min_spend ?? 0,
        min_orders: body.min_orders ?? 0,
        colour: body.colour ?? "#9CA3AF",
        discount_percent: body.discount_percent ?? 0,
        eligible_ownership_only: body.eligible_ownership_only ?? false,
        manual_only: body.manual_only ?? false,
      })
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ tier: data });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  try {
    const body = await req.json();
    const { id, ...fields } = body;
    const supabase = await createTenantSupabaseClient(tenantId);
    const allowed = ["tier_name", "tier_order", "min_spend", "min_orders", "colour", "discount_percent", "eligible_ownership_only", "manual_only"];
    const update: Record<string, unknown> = {};
    for (const key of allowed) {
      if (key in fields) update[key] = fields[key];
    }
    const { data, error } = await supabase
      .from("vip_tier_config")
      .update(update)
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ tier: data });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  try {
    const body = await req.json();
    const supabase = await createTenantSupabaseClient(tenantId);
    const { error } = await supabase
      .from("vip_tier_config")
      .delete()
      .eq("id", body.id)
      .eq("tenant_id", tenantId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

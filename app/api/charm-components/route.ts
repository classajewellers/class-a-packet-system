import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { createServerClient } from "@supabase/ssr";

export const dynamic    = "force-dynamic";
export const revalidate = 0;

async function getTenantId(req: NextRequest): Promise<string> {
  try {
    const sessionClient = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll() { return req.cookies.getAll(); }, setAll() {} } }
    );
    const { data: { user } } = await sessionClient.auth.getUser();
    if (!user) return req.headers.get("x-tenant-id") ?? "";
    const db = createServerSupabaseClient();
    const { data: profile } = await db.from("profiles").select("tenant_id").eq("auth_user_id", user.id).single();
    return profile?.tenant_id ?? req.headers.get("x-tenant-id") ?? "";
  } catch {
    return req.headers.get("x-tenant-id") ?? "";
  }
}

async function checkFeatureFlag(tenantId: string): Promise<boolean> {
  const db = createServerSupabaseClient();
  const { data } = await db.from("tenant_features").select("feature_configurable_products").eq("tenant_id", tenantId).single();
  return data?.feature_configurable_products === true;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const tenantId = await getTenantId(req);
  if (!tenantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!await checkFeatureFlag(tenantId)) {
    return NextResponse.json({ error: "Feature not enabled" }, { status: 403 });
  }

  const db = createServerSupabaseClient();

  const { data: components, error } = await db
    .from("charm_components")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("active", true)
    .order("sort_order", { ascending: true });

  if (error) {
    console.error("[charm-components] GET error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Resolve the "in stock" status UUID for this tenant once, reuse per charm
  const { data: inStockStatus } = await db
    .from("inventory_statuses")
    .select("id")
    .eq("tenant_id", tenantId)
    .ilike("name", "%in stock%")
    .eq("is_active", true)
    .limit(1)
    .single();
  const inStockStatusId: string | null = inStockStatus?.id ?? null;

  // Enrich with inventory stock count (using supplier_code on inventory_pieces)
  const enriched = await Promise.all(
    (components ?? []).map(async (c) => {
      if (!c.supplier_code || !inStockStatusId) return { ...c, stock_count: 0 };
      try {
        const { count } = await db
          .from("inventory_pieces")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
          .eq("supplier_code", c.supplier_code)
          .eq("status_id", inStockStatusId);
        return { ...c, stock_count: count ?? 0 };
      } catch {
        return { ...c, stock_count: 0 };
      }
    })
  );

  return NextResponse.json(enriched);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const tenantId = await getTenantId(req);
  if (!tenantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!await checkFeatureFlag(tenantId)) {
    return NextResponse.json({ error: "Feature not enabled" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  if (!body.name || !body.component_type) {
    return NextResponse.json({ error: "name and component_type are required" }, { status: 400 });
  }

  const db = createServerSupabaseClient();
  const { data, error } = await db
    .from("charm_components")
    .insert({
      tenant_id:         tenantId,
      name:              body.name,
      supplier_code:     body.supplier_code      ?? null,
      component_type:    body.component_type,
      gram_weight:       body.gram_weight         != null ? Number(body.gram_weight) : null,
      making_charge:     body.making_charge       != null ? Number(body.making_charge) : 0,
      averaged_cost_9y:  body.averaged_cost_9y   != null ? Number(body.averaged_cost_9y) : null,
      averaged_cost_9w:  body.averaged_cost_9w   != null ? Number(body.averaged_cost_9w) : null,
      averaged_cost_18y: body.averaged_cost_18y  != null ? Number(body.averaged_cost_18y) : null,
      averaged_cost_18w: body.averaged_cost_18w  != null ? Number(body.averaged_cost_18w) : null,
      available_for:     body.available_for      ?? "both",
      product_status:    body.product_status     ?? "in_stock",
      labour_per_unit:   body.labour_per_unit    != null ? Number(body.labour_per_unit) : 40,
      sort_order:        body.sort_order         != null ? Number(body.sort_order) : 0,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

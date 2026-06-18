import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { createServerClient } from "@supabase/ssr";

export const dynamic    = "force-dynamic";
export const revalidate = 0;

const METAL_SUFFIX: Record<string, string> = {
  "9ct_yellow":  "9YG",
  "9ct_white":   "9WG",
  "18ct_yellow": "18YG",
  "18ct_white":  "18WG",
};

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

export async function POST(req: NextRequest): Promise<NextResponse> {
  const tenantId = await getTenantId(req);
  if (!tenantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = createServerSupabaseClient();

  // ── Feature flag check ────────────────────────────────────────────────────
  const { data: featureRow } = await db
    .from("tenant_features")
    .select("feature_configurable_products")
    .eq("tenant_id", tenantId)
    .single();
  if (!featureRow?.feature_configurable_products) {
    return NextResponse.json({ error: "Feature not enabled" }, { status: 403 });
  }

  let body: { charm_necklace_config_id: string; notes?: string };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.charm_necklace_config_id) {
    return NextResponse.json({ error: "charm_necklace_config_id is required" }, { status: 400 });
  }

  // ── Load config ────────────────────────────────────────────────────────────
  const { data: config, error: configErr } = await db
    .from("charm_necklace_configs")
    .select("*")
    .eq("id", body.charm_necklace_config_id)
    .eq("tenant_id", tenantId)
    .single();

  if (configErr || !config) {
    return NextResponse.json({ error: "Config not found" }, { status: 404 });
  }

  // ── Build PO items (charms not from stock) ────────────────────────────────
  type SelectedCharm = {
    component_id: string;
    name: string;
    supplier_code: string | null;
    cost: number | null;
    from_stock: boolean;
    status: string;
  };

  const selectedCharms: SelectedCharm[] = Array.isArray(config.selected_charms)
    ? config.selected_charms as SelectedCharm[]
    : [];

  const toOrder = selectedCharms.filter(c => !c.from_stock);

  if (!toOrder.length) {
    return NextResponse.json({ error: "All charms are from stock — no purchase order needed" }, { status: 422 });
  }

  const metalSuffix = METAL_SUFFIX[config.metal] ?? config.metal;

  const poItems = toOrder.map(c => ({
    supplier_code: c.supplier_code ? `${c.supplier_code}-${metalSuffix}` : null,
    name:          c.name,
    metal:         config.metal,
    qty:           1,
    unit_cost:     c.cost ?? 0,
  }));

  const totalCost = poItems.reduce((sum, i) => sum + i.unit_cost, 0);

  // ── Generate reference PO-YYYYMMDD-NNNN ───────────────────────────────────
  const now = new Date();
  const dateStr = now.toISOString().split("T")[0]; // YYYY-MM-DD
  const datePart = dateStr.replace(/-/g, "");       // YYYYMMDD

  const { count } = await db
    .from("charm_purchase_orders")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .gte("created_at", `${dateStr}T00:00:00Z`);

  const seq = String((count ?? 0) + 1).padStart(4, "0");
  const orderReference = `PO-${datePart}-${seq}`;

  // ── Insert purchase order ──────────────────────────────────────────────────
  const { data: po, error: poErr } = await db
    .from("charm_purchase_orders")
    .insert({
      tenant_id:                tenantId,
      order_reference:          orderReference,
      quote_id:                 config.quote_id ?? null,
      charm_necklace_config_id: config.id,
      supplier:                 "McCaskills",
      status:                   "pending",
      items:                    poItems,
      total_cost:               totalCost,
      notes:                    body.notes ?? null,
    })
    .select()
    .single();

  if (poErr) {
    console.error("[charm-purchase-orders] insert error:", poErr.message);
    return NextResponse.json({ error: poErr.message }, { status: 500 });
  }

  // ── Mark config as having a PO ────────────────────────────────────────────
  await db
    .from("charm_necklace_configs")
    .update({ purchase_order_generated: true, updated_at: now.toISOString() })
    .eq("id", config.id);

  return NextResponse.json({ purchase_order: po }, { status: 201 });
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const tenantId = await getTenantId(req);
  if (!tenantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = createServerSupabaseClient();
  const { searchParams } = new URL(req.url);
  const quoteId = searchParams.get("quote_id");

  let query = db
    .from("charm_purchase_orders")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });

  if (quoteId) query = query.eq("quote_id", quoteId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

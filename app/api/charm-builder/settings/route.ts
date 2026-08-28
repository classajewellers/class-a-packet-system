import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const tenantId = req.headers.get("x-tenant-id") ?? "";
    const supabase = await createTenantSupabaseClient(tenantId);

    const [
      { data: catalog,      error: catErr },
      { data: baseConfigs,  error: cfgErr },
      { data: aftermarket,  error: amErr  },
    ] = await Promise.all([
      supabase
        .from("charm_catalog_items")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("category")
        .order("sort_order"),
      supabase
        .from("charm_base_config")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("product_type"),
      supabase
        .from("charm_aftermarket_rates")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("charm_type")
        .order("metal_colour"),
    ]);

    if (catErr) return NextResponse.json({ error: catErr.message }, { status: 500 });
    if (cfgErr) return NextResponse.json({ error: cfgErr.message }, { status: 500 });
    if (amErr)  return NextResponse.json({ error: amErr.message  }, { status: 500 });

    return NextResponse.json({
      catalog:     catalog     ?? [],
      baseConfigs: baseConfigs ?? [],
      aftermarket: aftermarket ?? [],
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load settings" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  try {
    const tenantId = req.headers.get("x-tenant-id") ?? "";
    const supabase = await createTenantSupabaseClient(tenantId);

    const body = await req.json();
    const { type, id, updates } = body as {
      type: "catalog_item" | "base_config" | "aftermarket_rate";
      id:   string;
      updates: Record<string, unknown>;
    };

    if (!type || !id || !updates) {
      return NextResponse.json({ error: "type, id, and updates are required" }, { status: 400 });
    }

    const TABLE: Record<string, string> = {
      catalog_item:     "charm_catalog_items",
      base_config:      "charm_base_config",
      aftermarket_rate: "charm_aftermarket_rates",
    };

    const table = TABLE[type];
    if (!table) return NextResponse.json({ error: `Unknown type: ${type}` }, { status: 400 });

    // Strip any fields that should never be mutated via this endpoint
    const { tenant_id: _t, id: _i, created_at: _c, ...safeUpdates } = updates as Record<string, unknown>;
    void _t; void _i; void _c;

    const { error } = await supabase
      .from(table)
      .update(safeUpdates)
      .eq("id", id)
      .eq("tenant_id", tenantId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Update failed" },
      { status: 500 }
    );
  }
}

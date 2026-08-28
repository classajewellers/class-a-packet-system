import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const tenantId = req.headers.get("x-tenant-id") ?? "";
    const supabase = await createTenantSupabaseClient(tenantId);

    const [{ data: catalog, error: catErr }, { data: baseConfigs, error: cfgErr }] =
      await Promise.all([
        supabase
          .from("charm_catalog_items")
          .select("id, category, name, price, applies_to, month_number, sort_order")
          .eq("tenant_id", tenantId)
          .eq("active", true)
          .order("category")
          .order("sort_order"),
        supabase
          .from("charm_base_config")
          .select("*")
          .eq("tenant_id", tenantId),
      ]);

    if (catErr) return NextResponse.json({ error: catErr.message }, { status: 500 });
    if (cfgErr) return NextResponse.json({ error: cfgErr.message }, { status: 500 });

    const configs: Record<string, unknown> = {};
    for (const row of baseConfigs ?? []) {
      configs[(row as { product_type: string }).product_type] = row;
    }

    return NextResponse.json({ catalog: catalog ?? [], baseConfigs: configs });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load catalog" },
      { status: 500 }
    );
  }
}

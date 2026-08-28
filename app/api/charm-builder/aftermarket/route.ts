import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const tenantId = req.headers.get("x-tenant-id") ?? "";
    const supabase = await createTenantSupabaseClient(tenantId);

    const { data, error } = await supabase
      .from("charm_aftermarket_rates")
      .select("id, charm_type, metal_colour, total_price, active")
      .eq("tenant_id", tenantId)
      .eq("active", true)
      .order("charm_type")
      .order("metal_colour");

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ rates: data ?? [] });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load rates" },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const tenantId = req.headers.get("x-tenant-id") ?? "";
    const supabase = await createTenantSupabaseClient(tenantId);

    const body = await req.json();
    const {
      quote_id = null,
      product_type,
      metal_colour,
      base_price,
      slot_fee,
      metal_surcharge,
      pendant_total,
      total_price,
      pendants,
    } = body;

    if (!product_type || !metal_colour || total_price == null) {
      return NextResponse.json({ error: "product_type, metal_colour, and total_price are required" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("charm_builder_configs")
      .insert({
        tenant_id: tenantId,
        quote_id,
        product_type,
        metal_colour,
        base_price: Number(base_price),
        slot_fee: Number(slot_fee),
        metal_surcharge: Number(metal_surcharge),
        pendant_total: Number(pendant_total),
        total_price: Number(total_price),
        pendants: pendants ?? [],
      })
      .select("id")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ id: data.id });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Save failed" },
      { status: 500 }
    );
  }
}

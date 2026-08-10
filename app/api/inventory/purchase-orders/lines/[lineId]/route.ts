import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

// PATCH /api/inventory/purchase-orders/lines/[lineId]
// Deliberate action to record the actual invoice amount on a PO line.
// Separate from the general PO PATCH to make this an explicit step.
export async function PATCH(
  req: NextRequest,
  { params }: { params: { lineId: string } }
): Promise<NextResponse> {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  const supabase = await createTenantSupabaseClient(tenantId);

  const body = await req.json();
  const rawCost = body.actual_cost;

  if (rawCost == null || isNaN(Number(rawCost)) || Number(rawCost) < 0) {
    return NextResponse.json(
      { error: "actual_cost must be a non-negative number" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("inventory_po_lines")
    .update({ actual_cost: Number(rawCost) })
    .eq("id", params.lineId)
    .eq("tenant_id", tenantId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ line: data });
}

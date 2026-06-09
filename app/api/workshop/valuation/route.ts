import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

// POST: Submit for review
// PATCH: Approve valuation
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const { packet_id, item_specifications } = await req.json();
    const tenantId = req.headers.get('x-tenant-id') ?? ''
    const supabase = await createTenantSupabaseClient(tenantId);

    const { data, error } = await supabase
      .from("packets")
      .update({
        item_specifications,
        valuation_status: "pending_review",
      })
      .eq("id", packet_id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ packet: data });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  try {
    const { packet_id, item_specifications, estimated_replacement_value } = await req.json();
    const tenantId = req.headers.get('x-tenant-id') ?? ''
    const supabase = await createTenantSupabaseClient(tenantId);

    // Generate certificate number: VC-YYYYMMDD-XXXX
    const { data: countData, error: countErr } = await supabase.rpc("increment_valuation_counter", {
      input_date: new Date().toISOString().split("T")[0],
    });
    if (countErr) {
      console.warn("[valuation] Counter increment failed:", countErr.message);
    }
    const count = (countData ?? 1) as number;
    const dateStr = new Date().toISOString().split("T")[0].replace(/-/g, "");
    const certNumber = `VC-${dateStr}-${String(count).padStart(4, "0")}`;

    const { data, error } = await supabase
      .from("packets")
      .update({
        item_specifications,
        estimated_replacement_value,
        valuation_status: "approved",
        valuation_approved_at: new Date().toISOString(),
        valuation_approved_by: "Sam Mucklow",
        valuation_certificate_number: certNumber,
      })
      .eq("id", packet_id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ packet: data, certificate_number: certNumber });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

// GET /api/inventory/open-packets
// Lightweight list of non-collected packets for the PO line "For Order" picker.
// Returns only the fields needed to display and identify a packet.
export async function GET(req: NextRequest): Promise<NextResponse> {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  const supabase = await createTenantSupabaseClient(tenantId);

  const { data, error } = await supabase
    .from("packets")
    .select("id, reference_number, customer_first_name, customer_last_name, packet_type, status")
    .eq("tenant_id", tenantId)
    .neq("status", "collected")
    .order("created_at", { ascending: false })
    .limit(300);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ packets: data ?? [] });
}

import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  try {
    const supabase = await createTenantSupabaseClient(tenantId);
    const { data, error } = await supabase
      .from("packet_activity_log")
      .select("id, event_type, old_value, new_value, created_at")
      .eq("packet_id", params.id)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) return NextResponse.json({ events: [], error: error.message }, { status: 500 });
    return NextResponse.json({ events: data ?? [] });
  } catch (err) {
    return NextResponse.json({ events: [], error: String(err) }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET /api/staff — active staff for the caller's tenant (name + role only).
// Guarded route: the middleware injects the trusted x-tenant-id. Service-role
// read of staff_pins, scoped by tenant; pin_hash is NEVER returned. Replaces
// the hardcoded STAFF_LIST for all staff pickers.
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const tenantId = req.headers.get("x-tenant-id") ?? "";
    if (!tenantId) {
      return NextResponse.json({ staff: [] }, { headers: { "Cache-Control": "no-store" } });
    }
    const supabase = await createTenantSupabaseClient(tenantId);
    const { data, error } = await supabase
      .from("staff_pins")
      .select("name, role")
      .eq("tenant_id", tenantId)
      .eq("active", true)
      .order("name", { ascending: true });

    if (error) {
      console.error("[staff] GET error:", error.message);
      return NextResponse.json({ staff: [] }, { headers: { "Cache-Control": "no-store" } });
    }

    return NextResponse.json(
      { staff: (data ?? []) as { name: string; role: string }[] },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    console.error("[staff] GET fatal:", err);
    return NextResponse.json({ staff: [] }, { headers: { "Cache-Control": "no-store" } });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { validateBridgeAuth } from "@/lib/rfid-bridge-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET /api/rfid/lookup/[epc]
// Look up a piece by its EPC. Authenticated by bridge Bearer token OR tenant header.
// The EPC is the 24-char hex string written to the tag's EPC memory bank.
export async function GET(
  req: NextRequest,
  { params }: { params: { epc: string } }
): Promise<NextResponse> {
  const tenantId = req.headers.get("x-tenant-id");
  const authHeader = req.headers.get("authorization");

  let resolvedTenantId: string;

  if (authHeader) {
    const identity = await validateBridgeAuth(authHeader);
    if (!identity) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    resolvedTenantId = identity.tenantId;
  } else if (tenantId) {
    resolvedTenantId = tenantId;
  } else {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: tag, error } = await supabase
    .from("inventory_rfid_tags")
    .select(`
      id, epc, status, activated_at, last_seen_at,
      piece:inventory_pieces(
        id, sku, title,
        status:inventory_statuses(name),
        location:inventory_locations(name),
        category:inventory_categories(name)
      )
    `)
    .eq("tenant_id", resolvedTenantId)
    .eq("epc", params.epc.toLowerCase())
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!tag)  return NextResponse.json({ error: "EPC not found" }, { status: 404 });

  // Update last_seen_at
  await supabase
    .from("inventory_rfid_tags")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("id", tag.id);

  return NextResponse.json({ tag });
}

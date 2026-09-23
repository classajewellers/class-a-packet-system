import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";
import { buildFilterOptions } from "@/app/api/inventory/pieces/route";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET /api/inventory/pieces/filter-options
// Category/Status dropdown options for the inventory list, merging both
// real schemas (production's inventory_categories/inventory_statuses rows
// and the plain status enum / linked-product category used on staging).
export async function GET(req: NextRequest): Promise<NextResponse> {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  const supabase = await createTenantSupabaseClient(tenantId);
  const options = await buildFilterOptions(supabase, tenantId);
  return NextResponse.json(options, { headers: { "Cache-Control": "no-store" } });
}

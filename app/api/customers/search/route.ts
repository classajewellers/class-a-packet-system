import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim();
  if (!q || q.length < 2) return NextResponse.json({ results: [] });

  try {
    const tenantId = req.headers.get("x-tenant-id") ?? "";
    const supabase = await createTenantSupabaseClient(tenantId);

    const searchQ = supabase
      .from("customers")
      .select("id, first_name, last_name, email, phone, tier_override_id")
      .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,email.ilike.%${q}%`)
      .limit(8);
    const { data, error } = await (tenantId ? searchQ.eq("tenant_id", tenantId) : searchQ);

    if (error) return NextResponse.json({ results: [] });
    return NextResponse.json({ results: data ?? [] });
  } catch {
    return NextResponse.json({ results: [] });
  }
}

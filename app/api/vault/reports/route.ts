import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createTenantSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const tenantId = req.headers.get('x-tenant-id') ?? ''
    const supabase = await createTenantSupabaseClient(tenantId);
    const { data, error } = await supabase
      .from("vault_reports")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) return NextResponse.json({ reports: [], error: error.message });
    return NextResponse.json({ reports: data ?? [] });
  } catch (err) {
    return NextResponse.json({ reports: [], error: String(err) });
  }
}

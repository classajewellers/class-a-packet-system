import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  if (!tenantId) return NextResponse.json({ rows: [] });

  try {
    const supabase = await createTenantSupabaseClient(tenantId);
    const { data, error } = await supabase
      .from("pricing_margin_config")
      .select("id, category, margin_percent, hourly_rate")
      .eq("tenant_id", tenantId)
      .order("category");

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ rows: data ?? [] });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  if (!tenantId) return NextResponse.json({ error: "x-tenant-id required" }, { status: 400 });

  try {
    const body = await req.json() as {
      rows: Array<{ category: string; margin_percent: number; hourly_rate: number | null }>;
    };
    if (!Array.isArray(body.rows)) {
      return NextResponse.json({ error: "rows must be an array" }, { status: 400 });
    }

    const supabase = await createTenantSupabaseClient(tenantId);

    const upsertData = body.rows.map(r => ({
      tenant_id:      tenantId,
      category:       r.category,
      margin_percent: r.margin_percent ?? 0,
      hourly_rate:    r.hourly_rate ?? null,
      updated_at:     new Date().toISOString(),
    }));

    const { data, error } = await supabase
      .from("pricing_margin_config")
      .upsert(upsertData, { onConflict: "tenant_id,category" })
      .select("id, category, margin_percent, hourly_rate");

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ rows: data ?? [] });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export const dynamic    = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  const db = createServerSupabaseClient();

  let query = db
    .from("pricing_products")
    .select(`*, pricing_product_variants ( id, pricing_mode )`)
    .order("name", { ascending: true });

  if (tenantId) query = query.eq("tenant_id", tenantId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  let body: { name?: string; category?: string; description?: string; active?: boolean };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  if (!body.name?.trim()) return NextResponse.json({ error: "name is required" }, { status: 400 });

  const db = createServerSupabaseClient();
  const { data, error } = await db
    .from("pricing_products")
    .insert({
      name:        body.name.trim(),
      category:    body.category    ?? null,
      description: body.description ?? null,
      active:      body.active      ?? true,
      tenant_id:   tenantId         || null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

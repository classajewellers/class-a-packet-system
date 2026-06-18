import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export const dynamic    = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  const cardType = new URL(req.url).searchParams.get("card_type");
  const db = createServerSupabaseClient();

  let query = db
    .from("pricing_rate_cards")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("sort_order", { ascending: true })
    .order("label",      { ascending: true });

  if (cardType) query = query.eq("card_type", cardType);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  let body: { card_type?: string; label?: string; amount?: number; unit?: string; sort_order?: number };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  if (!body.card_type) return NextResponse.json({ error: "card_type is required" }, { status: 400 });
  if (!body.label?.trim()) return NextResponse.json({ error: "label is required" }, { status: 400 });
  if (body.amount == null) return NextResponse.json({ error: "amount is required" }, { status: 400 });

  const db = createServerSupabaseClient();
  const { data, error } = await db
    .from("pricing_rate_cards")
    .insert({
      tenant_id:  tenantId,
      card_type:  body.card_type,
      label:      body.label.trim(),
      amount:     body.amount,
      unit:       body.unit       ?? "flat",
      sort_order: body.sort_order ?? 0,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

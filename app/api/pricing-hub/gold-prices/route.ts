import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export const dynamic    = "force-dynamic";
export const revalidate = 0;

export async function GET(): Promise<NextResponse> {
  const db = createServerSupabaseClient();

  const { data, error } = await db
    .from("pricing_gold_prices")
    .select("*")
    .order("metal_type", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: { id?: string; metal_type?: string; price_per_gram?: number | null; effective_date?: string; notes?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  if (!body.metal_type?.trim()) return NextResponse.json({ error: "metal_type is required" }, { status: 400 });
  // price_per_gram may be null (means "rate not yet set — block calculations using this metal")
  if (!("price_per_gram" in body)) return NextResponse.json({ error: "price_per_gram is required (pass null to mark rate as not yet set)" }, { status: 400 });

  const row = {
    metal_type:     body.metal_type.trim(),
    price_per_gram: body.price_per_gram,
    effective_date: body.effective_date ?? new Date().toISOString().slice(0, 10),
    notes:          body.notes ?? null,
  };

  const db = createServerSupabaseClient();
  let result;
  if (body.id) {
    const { data, error } = await db
      .from("pricing_gold_prices")
      .update(row)
      .eq("id", body.id)
      .select()
      .single();
    result = { data, error };
  } else {
    const { data, error } = await db
      .from("pricing_gold_prices")
      .insert(row)
      .select()
      .single();
    result = { data, error };
  }

  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 });
  return NextResponse.json(result.data, { status: 200 });
}

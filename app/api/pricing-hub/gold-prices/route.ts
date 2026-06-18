import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export const dynamic    = "force-dynamic";
export const revalidate = 0;

async function requireAdmin(supabase: ReturnType<typeof createServerSupabaseClient>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { error: null };
}

export async function GET(): Promise<NextResponse> {
  const db = createServerSupabaseClient();
  const { error: authErr } = await requireAdmin(db);
  if (authErr) return authErr;

  const { data, error } = await db
    .from("pricing_gold_prices")
    .select("*")
    .order("metal_type", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const db = createServerSupabaseClient();
  const { error: authErr } = await requireAdmin(db);
  if (authErr) return authErr;

  let body: { id?: string; metal_type?: string; price_per_gram?: number; effective_date?: string; notes?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  if (!body.metal_type?.trim()) return NextResponse.json({ error: "metal_type is required" }, { status: 400 });
  if (body.price_per_gram == null) return NextResponse.json({ error: "price_per_gram is required" }, { status: 400 });

  const row = {
    metal_type:     body.metal_type.trim(),
    price_per_gram: body.price_per_gram,
    effective_date: body.effective_date ?? new Date().toISOString().slice(0, 10),
    notes:          body.notes ?? null,
  };

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

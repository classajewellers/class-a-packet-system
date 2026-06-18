import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export const dynamic    = "force-dynamic";
export const revalidate = 0;

export async function GET(): Promise<NextResponse> {
  const db = createServerSupabaseClient();

  const { data, error } = await db
    .from("pricing_labour_rates")
    .select("*")
    .order("rate_name", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  let body: { id?: string; rate_name?: string; supplier?: string; rate_per_stone?: number | null; rate_per_hour?: number | null; rate_flat?: number | null; notes?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  if (!body.id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const allowed = ["rate_name", "supplier", "rate_per_stone", "rate_per_hour", "rate_flat", "notes"];
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const key of allowed) {
    if (key in body) patch[key] = (body as Record<string, unknown>)[key];
  }

  const db = createServerSupabaseClient();
  const { data, error } = await db
    .from("pricing_labour_rates")
    .update(patch)
    .eq("id", body.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export const dynamic    = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  const db = createServerSupabaseClient();

  const { data, error } = await db
    .from("rapaport_prices")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("rap_date",  { ascending: false })
    .order("shape",     { ascending: true })
    .order("size_min",  { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  let body: {
    shape?: string; size_min?: number; size_max?: number;
    colour?: string; clarity?: string;
    price_hundreds_usd?: number; rap_date?: string;
  };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const required: (keyof typeof body)[] = ["shape", "size_min", "size_max", "colour", "clarity", "price_hundreds_usd", "rap_date"];
  for (const k of required) {
    if (body[k] == null || body[k] === "") return NextResponse.json({ error: `${k} is required` }, { status: 400 });
  }

  const db = createServerSupabaseClient();
  const { data, error } = await db
    .from("rapaport_prices")
    .insert({
      tenant_id:          tenantId,
      shape:              body.shape!,
      size_min:           body.size_min!,
      size_max:           body.size_max!,
      colour:             body.colour!,
      clarity:            body.clarity!,
      price_hundreds_usd: body.price_hundreds_usd!,
      rap_date:           body.rap_date!,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

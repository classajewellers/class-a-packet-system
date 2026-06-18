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
    .from("pricing_products")
    .select(`
      *,
      pricing_product_variants ( id )
    `)
    .order("name", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const db = createServerSupabaseClient();
  const { error: authErr } = await requireAdmin(db);
  if (authErr) return authErr;

  let body: { name?: string; category?: string; description?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  if (!body.name?.trim()) return NextResponse.json({ error: "name is required" }, { status: 400 });

  const { data, error } = await db
    .from("pricing_products")
    .insert({ name: body.name.trim(), category: body.category ?? null, description: body.description ?? null })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

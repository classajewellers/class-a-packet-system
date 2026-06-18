import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { createServerClient } from "@supabase/ssr";

export const dynamic    = "force-dynamic";
export const revalidate = 0;

async function getTenantId(req: NextRequest): Promise<string> {
  try {
    const sessionClient = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return req.cookies.getAll(); },
          setAll() {},
        },
      }
    );
    const { data: { user } } = await sessionClient.auth.getUser();
    if (!user) return req.headers.get("x-tenant-id") ?? "";
    const db = createServerSupabaseClient();
    const { data: profile } = await db
      .from("profiles")
      .select("tenant_id")
      .eq("auth_user_id", user.id)
      .single();
    return profile?.tenant_id ?? req.headers.get("x-tenant-id") ?? "";
  } catch {
    return req.headers.get("x-tenant-id") ?? "";
  }
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const tenantId = await getTenantId(req);
  if (!tenantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = createServerSupabaseClient();
  const { data, error } = await db
    .from("rapaport_parcels")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("rap_date", { ascending: false })
    .order("size_min",  { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const tenantId = await getTenantId(req);
  if (!tenantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: {
    size_min?: number;
    size_max?: number;
    colour_group?: string;
    clarity?: string;
    price_usd_per_carat?: number;
    rap_date?: string;
  };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { size_min, size_max, colour_group, clarity, price_usd_per_carat, rap_date } = body;
  if (size_min == null || size_max == null || !colour_group || !clarity || price_usd_per_carat == null || !rap_date) {
    return NextResponse.json({ error: "size_min, size_max, colour_group, clarity, price_usd_per_carat and rap_date are required" }, { status: 400 });
  }

  const db = createServerSupabaseClient();
  const { data, error } = await db
    .from("rapaport_parcels")
    .insert({ tenant_id: tenantId, size_min, size_max, colour_group, clarity, price_usd_per_carat, rap_date })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

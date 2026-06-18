import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { createServerClient } from "@supabase/ssr";

export const dynamic    = "force-dynamic";
export const revalidate = 0;

// Resolve tenant_id server-side from the session cookie rather than trusting
// the x-tenant-id header. The client header can be empty (user not yet loaded)
// or stale, so authoritative lookup from the profiles table is more reliable.
async function getTenantIdFromSession(req: NextRequest): Promise<string> {
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
    if (!user) {
      console.log("[pricing-hub/products] no session user — falling back to x-tenant-id header");
      return req.headers.get("x-tenant-id") ?? "";
    }
    const db = createServerSupabaseClient();
    const { data: profile } = await db
      .from("profiles")
      .select("tenant_id")
      .eq("auth_user_id", user.id)
      .single();
    const tenantId = profile?.tenant_id ?? "";
    console.log("[pricing-hub/products] resolved tenant_id:", tenantId, "for user:", user.id);
    return tenantId;
  } catch (err) {
    console.warn("[pricing-hub/products] tenant resolution error — falling back to header:", err);
    return req.headers.get("x-tenant-id") ?? "";
  }
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const tenantId = await getTenantIdFromSession(req);
  const db = createServerSupabaseClient();

  let query = db
    .from("pricing_products")
    .select(`*, pricing_product_variants ( id, pricing_mode )`)
    .order("name", { ascending: true });

  if (tenantId) query = query.eq("tenant_id", tenantId);

  console.log("[pricing-hub/products] querying tenant_id:", tenantId || "(none — no filter)");

  const { data, error } = await query;
  if (error) {
    console.error("[pricing-hub/products] query error:", {
      message: error.message,
      code:    (error as any).code,
      hint:    (error as any).hint,
      details: (error as any).details,
    });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  console.log("[pricing-hub/products] returned", data?.length ?? 0, "products");
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

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
      { cookies: { getAll() { return req.cookies.getAll(); }, setAll() {} } }
    );
    const { data: { user } } = await sessionClient.auth.getUser();
    if (!user) return req.headers.get("x-tenant-id") ?? "";
    const db = createServerSupabaseClient();
    const { data: profile } = await db.from("profiles").select("tenant_id").eq("auth_user_id", user.id).single();
    return profile?.tenant_id ?? req.headers.get("x-tenant-id") ?? "";
  } catch {
    return req.headers.get("x-tenant-id") ?? "";
  }
}

const ALLOWED_FIELDS = [
  "name", "supplier_code", "component_type", "gram_weight", "making_charge",
  "averaged_cost_9y", "averaged_cost_9w", "averaged_cost_18y", "averaged_cost_18w",
  "available_for", "product_status", "labour_per_unit", "sort_order",
];

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const tenantId = await getTenantId(req);
  if (!tenantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const key of ALLOWED_FIELDS) {
    if (key in body) patch[key] = body[key];
  }

  const db = createServerSupabaseClient();
  const { data, error } = await db
    .from("charm_components")
    .update(patch)
    .eq("id", params.id)
    .eq("tenant_id", tenantId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const tenantId = await getTenantId(req);
  if (!tenantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = createServerSupabaseClient();
  const { error } = await db
    .from("charm_components")
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq("id", params.id)
    .eq("tenant_id", tenantId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

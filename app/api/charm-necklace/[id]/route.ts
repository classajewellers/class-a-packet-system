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

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const tenantId = await getTenantId(req);
  if (!tenantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = createServerSupabaseClient();
  const { data, error } = await db
    .from("charm_necklace_configs")
    .select("*")
    .eq("id", params.id)
    .eq("tenant_id", tenantId)
    .single();

  if (error) {
    console.error("[charm-necklace/[id]] GET error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 404 });
  }
  return NextResponse.json(data);
}

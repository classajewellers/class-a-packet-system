import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

const ALLOWED = [
  "name", "phone", "email", "address", "website",
  "bank_name", "account_name", "bsb", "account_number",
] as const;

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  if (!tenantId) return NextResponse.json({ error: "x-tenant-id required" }, { status: 400 });

  try {
    const body = await req.json();
    const supabase = await createTenantSupabaseClient(tenantId);

    const updates: Record<string, unknown> = {};
    for (const field of ALLOWED) {
      if (field in body) updates[field] = body[field] || null;
    }

    // Advance onboarding step to at least 1
    const { data: current } = await supabase
      .from("tenants")
      .select("onboarding_step")
      .eq("id", tenantId)
      .maybeSingle();

    updates.onboarding_step = Math.max((current?.onboarding_step ?? 0), 1);

    const { error } = await supabase
      .from("tenants")
      .update(updates)
      .eq("id", tenantId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

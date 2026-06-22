import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";
import { randomUUID } from "crypto";

export const dynamic = "force-dynamic";

interface InviteRow {
  name:  string;
  email: string;
  role:  "manager" | "staff";
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  if (!tenantId) return NextResponse.json({ error: "x-tenant-id required" }, { status: 400 });

  try {
    const body = await req.json() as { invites?: InviteRow[] };
    const invites: InviteRow[] = (body.invites ?? []).filter(
      i => i.email?.trim() && i.name?.trim()
    );

    const supabase = createServerSupabaseClient();
    const results: { email: string; success: boolean; error?: string }[] = [];

    for (const invite of invites) {
      const email = invite.email.toLowerCase().trim();
      const name  = invite.name.trim();
      const role  = invite.role === "manager" ? "manager" : "staff";

      try {
        const { data: authData, error: authError } = await supabase.auth.admin.inviteUserByEmail(
          email,
          {
            data: { full_name: name, role, tenant_id: tenantId },
            redirectTo: "https://www.jewelleryvault.com.au/accept-invite",
          }
        );

        if (authError) {
          results.push({ email, success: false, error: authError.message });
          continue;
        }

        const profileId = authData?.user?.id ?? randomUUID();
        await supabase.from("profiles").insert({
          id:        profileId,
          full_name: name,
          role,
          email,
          tenant_id: tenantId,
          status:    "active",
        }).then(({ error }) => {
          if (error) console.warn("[onboarding/invite] profile insert failed:", error.message);
        });

        results.push({ email, success: true });
      } catch (err) {
        results.push({ email, success: false, error: String(err) });
      }
    }

    // Advance onboarding step to at least 4
    const tenantSupabase = await createTenantSupabaseClient(tenantId);
    const { data: current } = await tenantSupabase
      .from("tenants")
      .select("onboarding_step")
      .eq("id", tenantId)
      .maybeSingle();

    await tenantSupabase
      .from("tenants")
      .update({ onboarding_step: Math.max((current?.onboarding_step ?? 0), 4) })
      .eq("id", tenantId);

    return NextResponse.json({ results });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { randomUUID } from "crypto";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json();
    const { name, email, role, permissions } = body as { name: string; email: string; role: "manager" | "staff"; permissions?: Record<string, boolean> | null };
    const tenantId = req.headers.get("x-tenant-id") ?? "";
    const fullName = name?.trim();
    const normalizedEmail = email?.toLowerCase().trim();

    if (!fullName || !normalizedEmail || !role) {
      return NextResponse.json({ error: "name, email, and role are required" }, { status: 400 });
    }
    if (!tenantId) {
      return NextResponse.json({ error: "x-tenant-id header required" }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();

    console.log("[invite] Inviting user:", normalizedEmail, "role:", role, "tenant:", tenantId);

    // ── Step 1: Send invite email + create auth user ──────────────────────────
    const { data: authData, error: authError } = await supabase.auth.admin.inviteUserByEmail(
      normalizedEmail,
      {
        data: { full_name: fullName, role, tenant_id: tenantId },
        redirectTo: "https://www.jewelleryvault.com.au/login",
      }
    );

    console.log("[invite] inviteUserByEmail response — error:", JSON.stringify(authError), "user:", JSON.stringify(authData?.user ?? null));

    if (authError) {
      console.error("[invite] inviteUserByEmail failed:", JSON.stringify(authError));
      return NextResponse.json({ error: authError.message }, { status: 500 });
    }

    const authUserId = authData?.user?.id ?? null;
    console.log("[invite] Invite sent, auth user id:", authUserId ?? "(not returned)");

    // ── Step 2: Insert profile ────────────────────────────────────────────────
    const profileId = authUserId ?? randomUUID();

    const { error: profileError } = await supabase
      .from("profiles")
      .insert({
        id:          profileId,
        full_name:   fullName,
        role,
        email:       normalizedEmail,
        tenant_id:   tenantId,
        status:      "active",
        ...(permissions !== undefined && permissions !== null ? { permissions } : {}),
      });

    if (profileError) {
      console.error("[invite] profile insert failed:", JSON.stringify(profileError));
      // Non-fatal — auth user was created; profile will be created on first login.
    } else {
      console.log("[invite] Profile created for", normalizedEmail, "id:", profileId);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[invite] unexpected error:", JSON.stringify(err));
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json();
    const { name, email, role } = body as { name: string; email: string; role: "manager" | "staff" };
    const tenantId = req.headers.get("x-tenant-id") ?? "";

    if (!name?.trim() || !email?.trim() || !role) {
      return NextResponse.json({ error: "name, email, and role are required" }, { status: 400 });
    }
    if (!tenantId) {
      return NextResponse.json({ error: "x-tenant-id header required" }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();

    // Send Supabase invite email
    const { data: inviteData, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(
      email.toLowerCase().trim(),
      {
        data: { name: name.trim(), role, tenant_id: tenantId },
        redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? "https://jewelleryvault.com.au"}/api/auth/callback`,
      }
    );

    if (inviteError) {
      console.error("[invite] auth.admin.inviteUserByEmail failed:", inviteError.message);
      return NextResponse.json({ error: inviteError.message }, { status: 500 });
    }

    // Pre-create the profile so it appears in the users list immediately
    // auth_user_id will be set when they accept the invite via the callback route
    const { error: profileError } = await supabase
      .from("profiles")
      .upsert(
        {
          email:     email.toLowerCase().trim(),
          full_name: name.trim(),
          role,
          tenant_id: tenantId,
          // Set auth_user_id now if available from invite response
          ...(inviteData?.user?.id ? { auth_user_id: inviteData.user.id } : {}),
        },
        { onConflict: "email" }
      );

    if (profileError) {
      console.warn("[invite] profile upsert failed (non-fatal):", profileError.message);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[invite] unexpected error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

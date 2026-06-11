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

    console.log("[invite] Sending invite to:", email, "role:", role, "tenant:", tenantId);

    // Send Supabase invite email
    const { data: inviteData, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(
      email.toLowerCase().trim(),
      {
        data: { full_name: name.trim(), role, tenant_id: tenantId },
        redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? "https://jewelleryvault.com.au"}/api/auth/callback`,
      }
    );

    console.log("[invite] inviteUserByEmail response — error:", JSON.stringify(inviteError), "user:", JSON.stringify(inviteData?.user ?? null));

    if (inviteError) {
      console.error("[invite] auth.admin.inviteUserByEmail failed:", JSON.stringify(inviteError));
      return NextResponse.json({ error: inviteError.message }, { status: 500 });
    }

    // Invite succeeded. User object may be null if the invite was queued rather than
    // created synchronously — that's fine, the email has been sent.
    const authUserId = inviteData?.user?.id ?? null;
    console.log("[invite] Auth user id:", authUserId ?? "(not returned — invite queued)");

    if (authUserId) {
      // Pre-create the profile so the user appears in the list immediately.
      const { error: profileError } = await supabase
        .from("profiles")
        .insert({
          id:        authUserId,
          full_name: name.trim(),
          role,
          email:     email.toLowerCase().trim(),
          tenant_id: tenantId,
          status:    "active",
        });

      if (profileError) {
        console.error("[invite] profile insert failed:", JSON.stringify(profileError));
        // Non-fatal — invite email was sent; profile will be created on first login.
      } else {
        console.log("[invite] Profile created successfully for", email);
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[invite] unexpected error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

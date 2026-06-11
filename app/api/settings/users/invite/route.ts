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

    if (inviteError) {
      console.error("[invite] auth.admin.inviteUserByEmail failed:", JSON.stringify(inviteError));
      return NextResponse.json({ error: inviteError.message }, { status: 500 });
    }

    const authUserId = inviteData?.user?.id;
    console.log("[invite] Auth user created, id:", authUserId);

    if (!authUserId) {
      console.error("[invite] inviteUserByEmail returned no user id — inviteData:", JSON.stringify(inviteData));
      return NextResponse.json({ error: "Invite sent but no user ID returned from auth" }, { status: 500 });
    }

    // Insert profile so the user appears in the list immediately.
    // id must match the auth user id — this is the primary key.
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
      return NextResponse.json(
        { error: `Invite sent but profile creation failed: ${profileError.message}` },
        { status: 500 }
      );
    }

    console.log("[invite] Profile created successfully for", email);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[invite] unexpected error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

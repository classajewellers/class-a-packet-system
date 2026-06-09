import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

// IMPORTANT: In Supabase Dashboard → Authentication → URL Configuration
// Add to Redirect URLs: https://jewelleryvault.com.au/api/auth/callback

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams, origin } = new URL(req.url);
  const code = searchParams.get("code");

  if (!code) {
    console.error("[auth/callback] No code in request");
    return NextResponse.redirect(new URL("/login?error=missing_code", origin));
  }

  // Create a response we can attach cookies to
  let response = NextResponse.redirect(new URL("/orders", origin));

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return req.cookies.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => req.cookies.set(name, value));
          response = NextResponse.redirect(new URL("/orders", origin));
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.session) {
    console.error("[auth/callback] exchangeCodeForSession failed:", error?.message);
    return NextResponse.redirect(new URL("/login?error=auth_failed", origin));
  }

  const authUser = data.session.user;

  // Link the Supabase auth user to the pre-created profile record
  // Profile was created at invite time — we just need to set auth_user_id
  if (authUser?.email) {
    const adminClient = createServerSupabaseClient();
    const tenantId = authUser.user_metadata?.tenant_id as string | undefined;

    const { error: linkError } = await adminClient
      .from("profiles")
      .update({ auth_user_id: authUser.id })
      .eq("email", authUser.email.toLowerCase())
      .is("auth_user_id", null) // only update if not already linked
      .order("created_at", { ascending: false });

    if (linkError) {
      console.warn("[auth/callback] profile link failed (non-fatal):", linkError.message);
    }

    // Also update name/role from metadata if present
    if (authUser.user_metadata?.name || authUser.user_metadata?.role) {
      const metaUpdates: Record<string, unknown> = { auth_user_id: authUser.id };
      if (authUser.user_metadata?.name) metaUpdates.full_name = authUser.user_metadata.name;
      if (authUser.user_metadata?.role) metaUpdates.role = authUser.user_metadata.role;
      if (tenantId) metaUpdates.tenant_id = tenantId;

      await adminClient
        .from("profiles")
        .update(metaUpdates)
        .eq("email", authUser.email.toLowerCase());
    }
  }

  return response;
}

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json();
    const { storeName, slug, fullName, email, password, phone } = body as {
      storeName: string;
      slug:      string;
      fullName:  string;
      email:     string;
      password:  string;
      phone?:    string;
    };

    // Basic validation
    if (!storeName?.trim() || !slug?.trim() || !fullName?.trim() || !email?.trim() || !password) {
      return NextResponse.json({ error: "All required fields must be filled" }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
    }

    const cleanSlug = slug.toLowerCase().trim();
    const supabase  = createServerSupabaseClient();

    // 1. Check slug availability
    const { data: existing } = await supabase
      .from("tenants")
      .select("id")
      .eq("slug", cleanSlug)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ error: "This store URL is already taken" }, { status: 400 });
    }

    // 2. Create tenant
    const { data: tenant, error: tenantError } = await supabase
      .from("tenants")
      .insert({ name: storeName.trim(), slug: cleanSlug, subscription_status: "trial" })
      .select("id")
      .single();

    if (tenantError || !tenant) {
      console.error("[signup] tenant insert failed:", tenantError?.message);
      return NextResponse.json({ error: "Failed to create store" }, { status: 500 });
    }

    // 3. Create auth user (email confirmed immediately — no email verify step)
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email:          email.toLowerCase().trim(),
      password,
      email_confirm:  true,
      user_metadata:  { name: fullName.trim(), role: "manager", tenant_id: tenant.id },
    });

    if (authError || !authData.user) {
      console.error("[signup] auth user creation failed:", authError?.message);
      // Roll back tenant
      await supabase.from("tenants").delete().eq("id", tenant.id);
      return NextResponse.json({ error: authError?.message ?? "Failed to create account" }, { status: 500 });
    }

    const authUser = authData.user;

    // 4. Set up the profile.
    //
    // IMPORTANT: the `handle_new_user` trigger on auth.users has ALREADY inserted
    // a profiles row (id, full_name, role) by the time we get here — with no
    // tenant_id (so it takes the column default, historically Class A) and no
    // auth_user_id. A plain INSERT therefore hits ON CONFLICT (id) and fails,
    // leaving the profile pointing at the wrong tenant. That was the root cause of
    // new signups landing inside Class A's tenant. We UPSERT on the id key so the
    // trigger-created row is corrected with THIS tenant and the auth link.
    const { error: profileError } = await supabase
      .from("profiles")
      .upsert(
        {
          id:           authUser.id,
          full_name:    fullName.trim(),
          role:         "manager",
          email:        email.toLowerCase().trim(),
          auth_user_id: authUser.id,
          tenant_id:    tenant.id,
          ...(phone?.trim() ? { phone: phone.trim() } : {}),
        },
        { onConflict: "id" }
      );

    if (profileError) {
      // FATAL: a profile that doesn't point at the new tenant is worse than no
      // account — the user would silently operate inside another tenant. Roll the
      // whole signup back rather than leave a mis-tenanted profile behind.
      console.error("[signup] profile upsert failed:", profileError.message);
      await supabase.auth.admin.deleteUser(authUser.id).catch(() => {});
      await supabase.from("tenants").delete().eq("id", tenant.id);
      return NextResponse.json({ error: "Failed to finish setting up your account" }, { status: 500 });
    }

    return NextResponse.json({ success: true, tenantId: tenant.id, userId: authUser.id });
  } catch (err) {
    console.error("[signup] unexpected error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

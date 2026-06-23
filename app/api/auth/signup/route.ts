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

    // 4. Create profile
    const { error: profileError } = await supabase.from("profiles").insert({
      id:           authUser.id,
      full_name:    fullName.trim(),
      role:         "manager",
      email:        email.toLowerCase().trim(),
      auth_user_id: authUser.id,
      tenant_id:    tenant.id,
      ...(phone?.trim() ? { phone: phone.trim() } : {}),
    });

    if (profileError) {
      console.error("[signup] profile insert failed:", profileError.message);
      // Non-fatal — user can still log in; profile will be created on first login
    }

    return NextResponse.json({ success: true, tenantId: tenant.id, userId: authUser.id });
  } catch (err) {
    console.error("[signup] unexpected error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

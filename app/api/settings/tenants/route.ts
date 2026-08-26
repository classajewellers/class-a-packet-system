import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

// GET — return the caller's own tenant only
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const tenantId = req.headers.get("x-tenant-id") ?? "";
    if (!tenantId) {
      return NextResponse.json({ tenants: [], error: "x-tenant-id header required" }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
      .from("tenants")
      .select("id, name, slug, subscription_status, created_at")
      .eq("id", tenantId)
      .order("name", { ascending: true });

    if (error) {
      console.error("[api/settings/tenants] GET error:", error.message);
      return NextResponse.json({ tenants: [], error: error.message }, { status: 500 });
    }

    return NextResponse.json({ tenants: data ?? [] });
  } catch (err) {
    return NextResponse.json({ tenants: [], error: String(err) }, { status: 500 });
  }
}

// POST — create a new tenant
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json();
    const { name, slug } = body as { name: string; slug: string };

    if (!name?.trim() || !slug?.trim()) {
      return NextResponse.json({ error: "Name and slug are required" }, { status: 400 });
    }

    // Validate slug format: lowercase letters, numbers, hyphens only
    if (!/^[a-z0-9-]+$/.test(slug.trim())) {
      return NextResponse.json(
        { error: "Slug must contain only lowercase letters, numbers, and hyphens" },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
      .from("tenants")
      .insert({ name: name.trim(), slug: slug.trim().toLowerCase(), subscription_status: "active" })
      .select()
      .single();

    if (error) {
      console.error("[api/settings/tenants] POST error:", error.message);
      // Unique constraint violation
      if (error.code === "23505") {
        return NextResponse.json({ error: "A store with that slug already exists" }, { status: 409 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ tenant: data }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// PATCH — update the caller's own tenant's subscription_status or name
export async function PATCH(req: NextRequest): Promise<NextResponse> {
  try {
    const tenantId = req.headers.get("x-tenant-id") ?? "";
    if (!tenantId) {
      return NextResponse.json({ error: "x-tenant-id header required" }, { status: 400 });
    }

    const body = await req.json();
    const updates = body as { name?: string; subscription_status?: string };

    const allowedFields: Record<string, unknown> = {};
    if (updates.name) allowedFields.name = updates.name.trim();
    if (updates.subscription_status) allowedFields.subscription_status = updates.subscription_status;

    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
      .from("tenants")
      .update(allowedFields)
      .eq("id", tenantId)
      .select()
      .single();

    if (error) {
      console.error("[api/settings/tenants] PATCH error:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ tenant: data });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

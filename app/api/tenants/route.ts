import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Public route — not tenant-scoped, returns the list of active stores
// Used by the login page store selector.
export async function GET(): Promise<NextResponse> {
  try {
    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
      .from("tenants")
      .select("id, name, slug")
      .eq("subscription_status", "active")
      .order("name", { ascending: true });

    if (error) {
      console.error("[api/tenants] error:", error.message);
      return NextResponse.json({ tenants: [], error: error.message }, { status: 500 });
    }

    return NextResponse.json({ tenants: data ?? [] });
  } catch (err) {
    return NextResponse.json({ tenants: [], error: String(err) }, { status: 500 });
  }
}

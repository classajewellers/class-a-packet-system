import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search") ?? "";

  try {
    const supabase = createServerSupabaseClient();
    let query = supabase
      .from("customers")
      .select("*")
      .order("last_visit_date", { ascending: false, nullsFirst: false });

    if (search) {
      const s = `%${search}%`;
      query = query.or(
        `first_name.ilike.${s},last_name.ilike.${s},email.ilike.${s},phone.ilike.${s}`
      );
    }

    const { data, error } = await query;

    if (error) {
      // Table may not exist yet
      if (error.code === "42P01") {
        return NextResponse.json({ customers: [] });
      }
      return NextResponse.json({ customers: [], error: error.message }, { status: 500 });
    }

    return NextResponse.json({ customers: data ?? [] });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ customers: [], error: msg }, { status: 500 });
  }
}

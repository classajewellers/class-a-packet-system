import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { Quote } from "@/lib/types";

// Force dynamic so this route never gets statically pre-rendered at build time
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from("quotes")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    console.error("[quotes] Supabase fetch failed:", {
      code:    error.code,
      message: error.message,
      details: error.details,
      hint:    error.hint,
    });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  console.log("[quotes] Fetched", (data ?? []).length, "quotes");
  return NextResponse.json({ quotes: (data ?? []) as Quote[] });
}

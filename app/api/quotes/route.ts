import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { Quote } from "@/lib/types";

// Force dynamic so this route never gets statically pre-rendered at build time
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  // Env check — log whether the service role key is actually present in this environment
  console.log("[quotes] Env check:", {
    hasUrl:            !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    hasServiceKey:     !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    serviceKeyLength:  process.env.SUPABASE_SERVICE_ROLE_KEY?.length ?? 0,
  });

  let supabase: ReturnType<typeof createServerSupabaseClient>;
  try {
    supabase = createServerSupabaseClient();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[quotes] Failed to create Supabase client:", msg);
    return NextResponse.json({ error: msg, quotes: [] }, { status: 500 });
  }

  console.log("[quotes] Running: SELECT * FROM quotes ORDER BY created_at DESC LIMIT 500");

  const { data, error } = await supabase
    .from("quotes")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);

  console.log("[quotes] Query result:", data?.length ?? "null", "| error:", error?.message ?? "none");

  if (error) {
    console.error("[quotes] Supabase fetch failed:", {
      code:    error.code,
      message: error.message,
      details: error.details,
      hint:    error.hint,
    });
    return NextResponse.json({ error: error.message, quotes: [] }, { status: 500 });
  }

  console.log("[quotes] Fetched", (data ?? []).length, "quotes");
  return NextResponse.json({ quotes: (data ?? []) as Quote[] });
}

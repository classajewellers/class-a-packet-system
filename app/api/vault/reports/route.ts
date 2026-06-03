import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(): Promise<NextResponse> {
  try {
    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
      .from("vault_reports")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) return NextResponse.json({ reports: [], error: error.message });
    return NextResponse.json({ reports: data ?? [] });
  } catch (err) {
    return NextResponse.json({ reports: [], error: String(err) });
  }
}

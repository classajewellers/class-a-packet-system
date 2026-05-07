import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { Quote } from "@/lib/types";

export async function GET(): Promise<NextResponse> {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("quotes")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ quotes: (data ?? []) as Quote[] });
}

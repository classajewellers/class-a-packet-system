import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const { id } = params;

  try {
    const supabase = createServerSupabaseClient();

    const [customerResult, packetsResult] = await Promise.all([
      supabase.from("customers").select("*").eq("id", id).single(),
      supabase.from("packets").select("*").order("created_at", { ascending: false }),
    ]);

    if (customerResult.error) {
      return NextResponse.json({ error: customerResult.error.message }, { status: 404 });
    }

    const customer = customerResult.data;

    // Filter packets by email match
    const packets = (packetsResult.data ?? []).filter(
      (p) => p.customer_email && customer.email && p.customer_email.toLowerCase() === customer.email.toLowerCase()
    );

    // Fetch quotes by email
    let quotes: unknown[] = [];
    try {
      const { data: quotesData } = await supabase
        .from("quotes")
        .select("*")
        .ilike("customer_email", customer.email ?? "")
        .order("created_at", { ascending: false });
      quotes = quotesData ?? [];
    } catch {
      // quotes table may not exist
    }

    return NextResponse.json({ customer, packets, quotes });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const { id } = params;

  try {
    const body = await req.json();
    const supabase = createServerSupabaseClient();

    const { data, error } = await supabase
      .from("customers")
      .update({ notes: body.notes })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ customer: data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { Packet } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  console.log("[shopify-orders] GET request received");

  let supabase;
  try {
    supabase = createServerSupabaseClient();
    console.log("[shopify-orders] Supabase client created successfully");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[shopify-orders] Failed to create Supabase client:", msg);
    return NextResponse.json({ error: msg, packets: [] }, { status: 500 });
  }

  const { data, error } = await supabase
    .from("packets")
    .select("*")
    .eq("packet_type", "online_order")
    .eq("order_source", "Shopify")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[shopify-orders] Supabase query error:", error.message, error.code, error.details);
    return NextResponse.json({ error: error.message, packets: [] }, { status: 500 });
  }

  const packets = (data ?? []) as Packet[];
  console.log(`[shopify-orders] Returned ${packets.length} online_order packet(s)`);

  return NextResponse.json({ packets });
}

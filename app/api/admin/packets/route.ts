import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { Packet, AdminPacketsQuery } from "@/lib/types";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  const query: AdminPacketsQuery = {
    search: searchParams.get("search") ?? undefined,
    type: (searchParams.get("type") as AdminPacketsQuery["type"]) ?? undefined,
    from: searchParams.get("from") ?? undefined,
    to: searchParams.get("to") ?? undefined,
    limit: parseInt(searchParams.get("limit") ?? "100"),
    offset: parseInt(searchParams.get("offset") ?? "0"),
  };

  const supabase = createServiceClient();
  let dbQuery = supabase
    .from("packets")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(query.limit ?? 100)
    .range(query.offset ?? 0, (query.offset ?? 0) + (query.limit ?? 100) - 1);

  if (query.search) {
    const s = `%${query.search}%`;
    dbQuery = dbQuery.or(
      `reference_number.ilike.${s},customer_first_name.ilike.${s},customer_last_name.ilike.${s},customer_email.ilike.${s},customer_phone.ilike.${s}`
    );
  }

  if (query.type && query.type !== "all") {
    dbQuery = dbQuery.eq("packet_type", query.type);
  }

  if (query.from) {
    dbQuery = dbQuery.gte("created_at", query.from);
  }

  if (query.to) {
    // Add 1 day to include the end date fully
    const toDate = new Date(query.to);
    toDate.setDate(toDate.getDate() + 1);
    dbQuery = dbQuery.lt("created_at", toDate.toISOString().split("T")[0]);
  }

  const { data, error, count } = await dbQuery;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ packets: (data ?? []) as Packet[], count });
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  let body: { id: string; updates: Partial<Packet> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { id, updates } = body;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("packets")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ packet: data });
}

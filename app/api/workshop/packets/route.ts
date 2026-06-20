import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";
import { generateReferenceNumber } from "@/lib/referenceNumber";

export const dynamic = "force-dynamic";

const WORKSHOP_JOB_TYPES = ["repair", "custom_order", "stock_work"];

export async function GET(req: NextRequest): Promise<NextResponse> {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  const { searchParams } = new URL(req.url);
  const includeCollected = searchParams.get("include_collected") === "1";

  try {
    const supabase = await createTenantSupabaseClient(tenantId);

    let q = supabase
      .from("packets")
      .select("*")
      .in("job_type", WORKSHOP_JOB_TYPES)
      .order("due_date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false });

    if (tenantId) q = q.eq("tenant_id", tenantId);
    if (!includeCollected) q = q.neq("status", "collected");

    const { data: packets, error } = await q;
    if (error) return NextResponse.json({ packets: [], error: error.message }, { status: 500 });
    if (!packets?.length) return NextResponse.json({ packets: [] });

    // Join assigned_to names from profiles
    const profileIds = Array.from(
      new Set(packets.map(p => p.assigned_to as string).filter(Boolean))
    );

    const namesMap = new Map<string, string>();
    if (profileIds.length) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", profileIds);
      for (const pr of profiles ?? []) {
        namesMap.set(pr.id, pr.full_name ?? "Unknown");
      }
    }

    const enriched = packets.map(p => ({
      ...p,
      assigned_to_name: p.assigned_to ? (namesMap.get(p.assigned_to) ?? null) : null,
    }));

    return NextResponse.json({ packets: enriched });
  } catch (err) {
    return NextResponse.json({ packets: [], error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  try {
    const body = await req.json();
    const supabase = await createTenantSupabaseClient(tenantId);

    const referenceNumber = await generateReferenceNumber(undefined, "repair");

    const insert: Record<string, unknown> = {
      tenant_id: tenantId || null,
      reference_number: referenceNumber,
      packet_type: body.job_type === "stock_work" ? "repair" : (body.job_type ?? "repair"),
      job_type: body.job_type ?? "repair",
      status: "intake",
      status_updated_at: new Date().toISOString(),
      customer_first_name: body.customer_first_name || null,
      customer_last_name: body.customer_last_name || null,
      customer_email: body.customer_email || null,
      customer_phone: body.customer_phone || null,
      articles: body.articles || null,
      instructions: body.instructions || null,
      total_charges: body.total_charges ? Number(body.total_charges) : null,
      deposit: body.deposit ? Number(body.deposit) : null,
      balance: body.total_charges && body.deposit
        ? Math.max(0, Number(body.total_charges) - Number(body.deposit))
        : null,
      due_date: body.due_date || null,
      assigned_to: body.assigned_to || null,
      in_date: new Date().toISOString().split("T")[0],
      staff_member: body.staff_member || null,
      internal_notes: body.internal_notes || null,
      valuation_required: false,
    };

    const { data, error } = await supabase.from("packets").insert(insert).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ packet: data });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

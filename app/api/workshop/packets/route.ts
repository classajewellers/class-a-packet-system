import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";
import { generateReferenceNumber } from "@/lib/referenceNumber";

export const dynamic = "force-dynamic";

const WORKSHOP_JOB_TYPES = [
  "repair",
  "custom_order",
  "stock_work",
  "online_order",
  "collection_order",
];

export async function GET(req: NextRequest): Promise<NextResponse> {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  const { searchParams } = new URL(req.url);
  const includeCollected = searchParams.get("include_collected") === "1";
  const sourceOrderRef = searchParams.get("source_order_ref");

  try {
    const supabase = await createTenantSupabaseClient(tenantId);

    let q = supabase
      .from("packets")
      .select(
        "*, workshop_subcontractor_name, workshop_pathway_id, workshop_step_index, workshop_intake_substatus, workshop_needs_valuation, workshop_valuer, workshop_supplier, workshop_po_number, customer_id"
      )
      .in("job_type", WORKSHOP_JOB_TYPES)
      .order("due_date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false });

    if (tenantId) q = q.eq("tenant_id", tenantId);
    if (!includeCollected) q = q.neq("status", "collected");
    if (sourceOrderRef) q = q.eq("source_order_ref", sourceOrderRef);

    const { data: packets, error } = await q;
    if (error) return NextResponse.json({ packets: [], error: error.message }, { status: 500 });
    if (!packets?.length) return NextResponse.json({ packets: [] });

    // Join assigned_to names from profiles
    const profileIds = Array.from(
      new Set(packets.map((p) => p.assigned_to as string).filter(Boolean))
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

    // Resolve customer names from the customers table
    const customerIds = Array.from(
      new Set(packets.map((p) => p.customer_id as string).filter(Boolean))
    );

    const customersMap = new Map<string, { first_name: string | null; last_name: string | null }>();
    if (customerIds.length) {
      const { data: customers } = await supabase
        .from("customers")
        .select("id, first_name, last_name")
        .in("id", customerIds);
      for (const c of customers ?? []) {
        customersMap.set(c.id, { first_name: c.first_name, last_name: c.last_name });
      }
    }

    const enriched = packets.map((p) => {
      // Prefer customers table name; fall back to packet's own columns
      const customerRecord = p.customer_id ? customersMap.get(p.customer_id) : null;
      const firstName = customerRecord?.first_name ?? p.customer_first_name ?? null;
      const lastName = customerRecord?.last_name ?? p.customer_last_name ?? null;
      const customer_display_name = [firstName, lastName].filter(Boolean).join(" ") || null;

      return {
        ...p,
        assigned_to_name: p.assigned_to ? (namesMap.get(p.assigned_to) ?? null) : null,
        customer_display_name,
      };
    });

    return NextResponse.json({ packets: enriched });
  } catch (err) {
    return NextResponse.json({ packets: [], error: String(err) }, { status: 500 });
  }
}

function deriveJobType(rawJobType: string | undefined, packetType: string | undefined): string {
  if (rawJobType && WORKSHOP_JOB_TYPES.includes(rawJobType)) return rawJobType;
  const pt = (packetType ?? "").toLowerCase();
  if (/online_order|online/.test(pt)) return "online_order";
  if (/collection_order|collection/.test(pt)) return "collection_order";
  if (/repair|service/.test(pt)) return "repair";
  if (/custom|bespoke|commission/.test(pt)) return "custom_order";
  if (/stock|internal/.test(pt)) return "stock_work";
  return "repair";
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  try {
    const body = await req.json();
    const supabase = await createTenantSupabaseClient(tenantId);

    const referenceNumber = await generateReferenceNumber(undefined, "repair");

    const jobType = deriveJobType(body.job_type, body.packet_type);

    const totalCharges = body.total_charges ? Number(body.total_charges) : null;
    const deposit = body.deposit ? Number(body.deposit) : null;
    const workshopNeedsValuation = totalCharges !== null && totalCharges >= 3000;

    const insert: Record<string, unknown> = {
      tenant_id: tenantId || null,
      reference_number: referenceNumber,
      packet_type: body.packet_type || jobType,
      job_type: jobType,
      status: "intake",
      status_updated_at: new Date().toISOString(),
      customer_id: body.customer_id || null,
      customer_first_name: body.customer_first_name || null,
      customer_last_name: body.customer_last_name || null,
      customer_email: body.customer_email || null,
      customer_phone: body.customer_phone || null,
      articles: body.articles || null,
      instructions: body.instructions || null,
      total_charges: totalCharges,
      deposit: deposit,
      balance:
        totalCharges !== null && deposit !== null
          ? Math.max(0, totalCharges - deposit)
          : null,
      due_date: body.due_date || null,
      assigned_to: body.assigned_to || null,
      in_date: new Date().toISOString().split("T")[0],
      staff_member: body.staff_member || null,
      internal_notes: body.internal_notes || null,
      valuation_required: false,
      workshop_needs_valuation: workshopNeedsValuation,
      source_order_ref: body.source_order_ref || null,
    };

    const { data, error } = await supabase.from("packets").insert(insert).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ packet: data });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

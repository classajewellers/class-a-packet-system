import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  try {
    const supabase = await createTenantSupabaseClient(tenantId);

    const apptQ = supabase
      .from("customer_appointments")
      .select("*")
      .order("appointment_date", { ascending: true })
      .order("appointment_time", { ascending: true, nullsFirst: false });

    const { data: appointments, error } = await (tenantId ? apptQ.eq("tenant_id", tenantId) : apptQ);
    if (error) return NextResponse.json({ appointments: [], error: error.message }, { status: 500 });
    if (!appointments?.length) return NextResponse.json({ appointments: [] });

    // Resolve customer names from most-recent packet per email
    const emails = Array.from(new Set(appointments.map(a => a.customer_email as string).filter(Boolean)));
    const namesMap = new Map<string, { first_name: string | null; last_name: string | null }>();

    try {
      const pkQ = supabase
        .from("packets")
        .select("customer_email, customer_first_name, customer_last_name")
        .or(emails.map(e => `customer_email.ilike.${e}`).join(","))
        .order("created_at", { ascending: false });
      const { data: packets } = await (tenantId ? pkQ.eq("tenant_id", tenantId) : pkQ);
      for (const p of packets ?? []) {
        const key = (p.customer_email ?? "").toLowerCase().trim();
        if (!namesMap.has(key)) {
          namesMap.set(key, { first_name: p.customer_first_name ?? null, last_name: p.customer_last_name ?? null });
        }
      }
    } catch { /* noop */ }

    const result = appointments.map(a => {
      const key = (a.customer_email ?? "").toLowerCase().trim();
      const names = namesMap.get(key) ?? { first_name: null, last_name: null };
      return { ...a, customer_first_name: names.first_name, customer_last_name: names.last_name };
    });

    return NextResponse.json({ appointments: result });
  } catch (err) {
    return NextResponse.json({ appointments: [], error: String(err) }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const email = decodeURIComponent(params.id).toLowerCase().trim();
  if (!email) return NextResponse.json({ error: "Missing customer email" }, { status: 400 });

  try {
    const tenantId = req.headers.get("x-tenant-id") ?? "";
    const supabase = await createTenantSupabaseClient(tenantId);

    const { data, error } = await supabase
      .from("customer_appointments")
      .select("*")
      .eq("tenant_id", tenantId)
      .ilike("customer_email", email)
      .order("appointment_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ appointments: data ?? [] });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const email = decodeURIComponent(params.id).toLowerCase().trim();
  if (!email) return NextResponse.json({ error: "Missing customer email" }, { status: 400 });

  try {
    const body = await req.json();
    const { appointment_date, appointment_time, notes } = body;

    if (!appointment_date) {
      return NextResponse.json({ error: "Missing appointment_date" }, { status: 400 });
    }

    const tenantId = req.headers.get("x-tenant-id") ?? "";
    const supabase = await createTenantSupabaseClient(tenantId);

    const { data, error } = await supabase
      .from("customer_appointments")
      .insert({
        tenant_id: tenantId,
        customer_email: email,
        appointment_date,
        appointment_time: appointment_time ?? null,
        notes: notes ?? null,
        status: "upcoming",
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ appointment: data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  // params.id not needed for PATCH — we use the appointment id from body
  void params;

  try {
    const body = await req.json();
    const { id, status, notes } = body;

    if (!id) return NextResponse.json({ error: "Missing appointment id" }, { status: 400 });

    const tenantId = req.headers.get("x-tenant-id") ?? "";
    const supabase = await createTenantSupabaseClient(tenantId);

    const updateFields: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (status !== undefined) updateFields.status = status;
    if (notes !== undefined) updateFields.notes = notes;

    const { data, error } = await supabase
      .from("customer_appointments")
      .update(updateFields)
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ appointment: data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  void params;

  try {
    const body = await req.json();
    const { id } = body;

    if (!id) return NextResponse.json({ error: "Missing appointment id" }, { status: 400 });

    const tenantId = req.headers.get("x-tenant-id") ?? "";
    const supabase = await createTenantSupabaseClient(tenantId);

    const { error } = await supabase
      .from("customer_appointments")
      .delete()
      .eq("id", id)
      .eq("tenant_id", tenantId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  try {
    const tenantId = req.headers.get('x-tenant-id') ?? ''
    const supabase = await createTenantSupabaseClient(tenantId);
    const { data, error } = await supabase
      .from("workshop_jobs")
      .select("*")
      .eq("id", params.id)
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 404 });
    return NextResponse.json({ job: data });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  try {
    const body = await req.json();
    const tenantId = req.headers.get('x-tenant-id') ?? ''
    const supabase = await createTenantSupabaseClient(tenantId);

    const updates: Record<string, unknown> = { ...body };

    // If stage is changing, update stage_changed_at
    if (body.stage !== undefined) {
      updates.stage_changed_at = new Date().toISOString();
    }

    const { data, error } = await supabase
      .from("workshop_jobs")
      .update(updates)
      .eq("id", params.id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ job: data });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  console.log("[DELETE workshop job] id:", params.id);
  try {
    const tenantId = req.headers.get('x-tenant-id') ?? ''
    const supabase = await createTenantSupabaseClient(tenantId);
    const { error } = await supabase
      .from("workshop_jobs")
      .delete()
      .eq("id", params.id);

    if (error) {
      console.error("[DELETE workshop job] error:", error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    console.log("[DELETE workshop job] success");
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[DELETE workshop job] exception:", err);
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

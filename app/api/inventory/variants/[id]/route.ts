import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  const supabase = await createTenantSupabaseClient(tenantId);
  const { data, error } = await supabase
    .from("inventory_variants")
    .select("*")
    .eq("id", params.id)
    .eq("tenant_id", tenantId)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json({ variant: data });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const tenantId = req.headers.get("x-tenant-id") ?? "";
    const supabase = await createTenantSupabaseClient(tenantId);
    const body = await req.json();

    const { data, error } = await supabase
      .from("inventory_variants")
      .update({
        title: body.title ?? null,
        metal_type: body.metal_type ?? null,
        metal_karat: body.metal_karat ?? null,
        metal_colour: body.metal_colour ?? null,
        finger_size: body.finger_size ?? null,
        chain_length: body.chain_length ?? null,
        diamond_type: body.diamond_type ?? null,
        diamond_carat: body.diamond_carat ?? null,
        diamond_colour: body.diamond_colour ?? null,
        diamond_clarity: body.diamond_clarity ?? null,
      })
      .eq("id", params.id)
      .eq("tenant_id", tenantId)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ variant: data });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const tenantId = req.headers.get("x-tenant-id") ?? "";
    const supabase = await createTenantSupabaseClient(tenantId);

    const { count } = await supabase
      .from("inventory_pieces")
      .select("id", { count: "exact", head: true })
      .eq("variant_id", params.id);

    if ((count ?? 0) > 0) {
      return NextResponse.json(
        { error: `Cannot delete — ${count} piece(s) still linked to this variant` },
        { status: 409 }
      );
    }

    const { error } = await supabase
      .from("inventory_variants")
      .delete()
      .eq("id", params.id)
      .eq("tenant_id", tenantId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

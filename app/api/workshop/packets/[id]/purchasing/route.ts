import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";
import { tenantScoped } from "@/lib/tenantScoped";
import { fallbackReceiveTitle } from "@/lib/receiveStock";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET /api/workshop/packets/[id]/purchasing
// Every PO line whose packet_id is this workshop job. Castings, stones,
// findings — not filtered by category. The link is packet_id, not the
// free-text workshop_po_number on the packet.
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  if (!tenantId) return NextResponse.json({ error: "Missing tenant" }, { status: 400 });
  const supabase = await createTenantSupabaseClient(tenantId);

  const { data: packet, error: packetErr } = await tenantScoped(supabase, tenantId)
    .from("packets")
    .select("id, reference_number")
    .eq("id", params.id)
    .maybeSingle();

  if (packetErr) return NextResponse.json({ error: packetErr.message }, { status: 500 });
  if (!packet) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  const { data: lines, error: linesErr } = await tenantScoped(supabase, tenantId)
    .from("inventory_po_lines")
    .select("id, po_id, title, notes, category_id, metal_type, metal_karat, metal_colour, quantity, received_quantity, received, estimated_cost, actual_cost, created_at")
    .eq("packet_id", params.id)
    .order("created_at", { ascending: true });

  if (linesErr) return NextResponse.json({ error: linesErr.message }, { status: 500 });

  const lineRows = (lines ?? []) as Array<{
    id: string;
    po_id: string | null;
    title: string | null;
    notes: string | null;
    category_id: string | null;
    metal_type: string | null;
    metal_karat: string | null;
    metal_colour: string | null;
    quantity: number | null;
    received_quantity: number | null;
    received: boolean | null;
    estimated_cost: number | null;
    actual_cost: number | null;
    created_at: string | null;
  }>;
  const poIds = Array.from(new Set(lineRows.map((line) => line.po_id).filter((id): id is string => Boolean(id))));
  const categoryIds = Array.from(new Set(lineRows.map((line) => line.category_id).filter((id): id is string => Boolean(id))));
  const lineIds = lineRows.map((line) => line.id);

  const [poResult, categoryResult, eventResult] = await Promise.all([
    poIds.length
      ? tenantScoped(supabase, tenantId)
          .from("inventory_purchase_orders")
          .select("id, po_number, status, order_date, expected_date, supplier_id, supplier_name")
          .in("id", poIds)
      : Promise.resolve({ data: [] as never[], error: null }),
    categoryIds.length
      ? tenantScoped(supabase, tenantId)
          .from("inventory_categories")
          .select("id, name")
          .in("id", categoryIds)
      : Promise.resolve({ data: [] as never[], error: null }),
    lineIds.length
      ? tenantScoped(supabase, tenantId)
          .from("inventory_receiving_events")
          .select("po_line_id, received_at")
          .in("po_line_id", lineIds)
      : Promise.resolve({ data: [] as never[], error: null }),
  ]);

  if (poResult.error) return NextResponse.json({ error: poResult.error.message }, { status: 500 });

  const supplierIds = Array.from(new Set(
    ((poResult.data ?? []) as Array<{ supplier_id: string | null }>)
      .map((po) => po.supplier_id)
      .filter((id): id is string => Boolean(id))
  ));
  const supplierById: Record<string, string> = {};
  if (supplierIds.length > 0) {
    const { data: suppliers } = await tenantScoped(supabase, tenantId)
      .from("inventory_suppliers")
      .select("id, name")
      .in("id", supplierIds);
    for (const supplier of suppliers ?? []) {
      if (supplier.id && supplier.name) supplierById[supplier.id] = supplier.name;
    }
  }

  const poById = Object.fromEntries((poResult.data ?? []).map((po: { id: string }) => [po.id, po]));
  const categoryById = Object.fromEntries((categoryResult.data ?? []).map((cat: { id: string; name: string }) => [cat.id, cat.name]));

  const receivedAtByLine: Record<string, string> = {};
  for (const event of eventResult.data ?? []) {
    const at = event.received_at as string | null;
    const lineId = event.po_line_id as string | null;
    if (!at || !lineId) continue;
    const prev = receivedAtByLine[lineId];
    if (!prev || at > prev) receivedAtByLine[lineId] = at;
  }

  const purchases = lineRows.map((line) => {
    const po = line.po_id ? poById[line.po_id] : null;
    const categoryName = line.category_id ? (categoryById[line.category_id] ?? null) : null;
    const supplierName = po?.supplier_id
      ? (supplierById[po.supplier_id] ?? po.supplier_name ?? null)
      : (po?.supplier_name ?? null);
    const what = fallbackReceiveTitle({
      title: line.title,
      notes: line.notes,
      categoryName,
      metal_karat: line.metal_karat,
      metal_colour: line.metal_colour,
      metal_type: line.metal_type,
      estimated_cost: line.estimated_cost,
    });
    return {
      id: line.id,
      what: what || "Untitled line",
      category: categoryName,
      quantity: Number(line.quantity ?? 1),
      received_quantity: Number(line.received_quantity ?? 0),
      received: Boolean(line.received),
      estimated_cost: line.estimated_cost,
      actual_cost: line.actual_cost,
      received_at: receivedAtByLine[line.id] ?? null,
      purchase_order: po
        ? {
            id: po.id,
            po_number: po.po_number,
            status: po.status,
            order_date: po.order_date,
            expected_date: po.expected_date,
            supplier_name: supplierName,
          }
        : null,
    };
  });

  return NextResponse.json({
    packet: { id: packet.id, reference_number: packet.reference_number },
    purchases,
  });
}

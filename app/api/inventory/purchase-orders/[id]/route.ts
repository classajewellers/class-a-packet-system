import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  const supabase = await createTenantSupabaseClient(tenantId);

  // Fetch PO header — no embedded joins to avoid PostgREST FK dependency
  const { data: po, error: poErr } = await supabase
    .from("inventory_purchase_orders")
    .select("*")
    .eq("id", params.id)
    .single();

  if (poErr || !po) {
    console.error("[po-detail] PO query error:", poErr?.message, poErr?.code, "id:", params.id);
    return NextResponse.json({ error: poErr?.message ?? "Not found" }, { status: 404 });
  }

  // Supplier name (separate query, FK-independent)
  let supplier: { id: string; name: string } | null = null;
  if (po.supplier_id) {
    const { data: sup } = await supabase
      .from("inventory_suppliers")
      .select("id, name")
      .eq("id", po.supplier_id)
      .single();
    supplier = sup ?? null;
  }

  // PO lines — plain columns only, no nested joins
  const { data: lines, error: linesErr } = await supabase
    .from("inventory_po_lines")
    .select("*")
    .eq("po_id", params.id)
    .order("created_at", { ascending: true });

  if (linesErr) {
    console.error("[po-detail] lines query error:", linesErr.message, linesErr.code);
    return NextResponse.json({ error: linesErr.message }, { status: 500 });
  }

  const lineRows = lines ?? [];
  const lineIds   = lineRows.map((l: any) => l.id);
  const packetIds = lineRows.map((l: any) => l.packet_id).filter(Boolean);

  // Pieces for these lines (separate query)
  const piecesByLineId: Record<string, { id: string; sku: string; quantity: number }[]> = {};
  if (lineIds.length > 0) {
    const { data: pieces } = await supabase
      .from("inventory_pieces")
      .select("id, sku, quantity, po_line_id")
      .in("po_line_id", lineIds);
    for (const p of pieces ?? []) {
      if (!piecesByLineId[p.po_line_id]) piecesByLineId[p.po_line_id] = [];
      piecesByLineId[p.po_line_id].push({ id: p.id, sku: p.sku, quantity: p.quantity });
    }
  }

  // Packets linked to these lines (separate query)
  const packetById: Record<string, any> = {};
  if (packetIds.length > 0) {
    const { data: packets } = await supabase
      .from("packets")
      .select("id, reference_number, customer_first_name, customer_last_name, packet_type")
      .in("id", packetIds);
    for (const pkt of packets ?? []) packetById[pkt.id] = pkt;
  }

  // Assemble the response in the shape the page expects
  const purchase_order = {
    ...po,
    supplier,
    lines: lineRows.map((l: any) => ({
      ...l,
      pieces: piecesByLineId[l.id] ?? [],
      packet: l.packet_id ? (packetById[l.packet_id] ?? null) : null,
    })),
  };

  return NextResponse.json({ purchase_order });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  const supabase = await createTenantSupabaseClient(tenantId);

  const body = await req.json();
  const { lines, deleted_line_ids, supplier: _sup, ...updateData } = body;

  const { data, error } = await supabase
    .from("inventory_purchase_orders")
    .update({ ...updateData, updated_at: new Date().toISOString() })
    .eq("id", params.id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Delete removed lines — only non-received lines belonging to this PO
  if (Array.isArray(deleted_line_ids) && deleted_line_ids.length > 0) {
    const { error: delErr } = await supabase
      .from("inventory_po_lines")
      .delete()
      .in("id", deleted_line_ids)
      .eq("po_id", params.id)
      .eq("received", false);
    if (delErr) return NextResponse.json({ error: `Line delete failed: ${delErr.message}` }, { status: 500 });
  }

  // Upsert lines if provided — lines with id are updated, lines without id are inserted
  if (Array.isArray(lines)) {
    for (const line of lines) {
      if (line.id) {
        const { id: lineId, category: _cat, piece: _pc, packet: _pkt, ...lineUpdate } = line;
        const { error: luErr } = await supabase
          .from("inventory_po_lines").update(lineUpdate).eq("id", lineId);
        if (luErr) return NextResponse.json({ error: `Line update failed: ${luErr.message}` }, { status: 500 });
      } else {
        // Destructure id out so an empty-string id from the UI is never sent —
        // Postgres rejects "" for a UUID column; omitting it triggers the DB default.
        const { id: _newLineId, ...insertData } = line;
        const { error: liErr } = await supabase
          .from("inventory_po_lines").insert({
            ...insertData, po_id: params.id, tenant_id: tenantId, received: false,
          });
        if (liErr) return NextResponse.json({ error: `Line insert failed: ${liErr.message}` }, { status: 500 });
      }
    }
  }

  return NextResponse.json({ purchase_order: data });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  const supabase = await createTenantSupabaseClient(tenantId);

  const { error } = await supabase
    .from("inventory_purchase_orders")
    .delete()
    .eq("id", params.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

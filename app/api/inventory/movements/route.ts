import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET /api/inventory/movements?piece_id=…&limit=50
export async function GET(req: NextRequest): Promise<NextResponse> {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  const supabase = await createTenantSupabaseClient(tenantId);

  const { searchParams } = new URL(req.url);
  const pieceId = searchParams.get("piece_id") ?? "";
  const limit   = Math.min(200, parseInt(searchParams.get("limit") ?? "50", 10));

  let query = supabase
    .from("inventory_movements")
    .select(`
      *,
      from_location:inventory_locations!from_location_id(id,name),
      to_location:inventory_locations!to_location_id(id,name),
      from_status:inventory_statuses!from_status_id(id,name,colour),
      to_status:inventory_statuses!to_status_id(id,name,colour)
    `)
    .order("moved_at", { ascending: false })
    .limit(limit);

  if (pieceId) query = query.eq("piece_id", pieceId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ movements: data ?? [] });
}

// POST /api/inventory/movements
// Body: { piece_id, to_location_id?, to_status_id?, moved_by?, notes? }
// Reads current piece to populate from_location_id / from_status_id automatically.
export async function POST(req: NextRequest): Promise<NextResponse> {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  const supabase = await createTenantSupabaseClient(tenantId);

  const body = await req.json();
  const { piece_id, to_location_id, to_status_id, moved_by, notes } = body;

  if (!piece_id) {
    return NextResponse.json({ error: "piece_id is required" }, { status: 400 });
  }
  if (!to_location_id && !to_status_id) {
    return NextResponse.json(
      { error: "At least one of to_location_id or to_status_id is required" },
      { status: 400 }
    );
  }

  // Fetch current piece state for from_ fields
  const { data: piece, error: pieceErr } = await supabase
    .from("inventory_pieces")
    .select("location_id,status_id")
    .eq("id", piece_id)
    .single();

  if (pieceErr || !piece) {
    return NextResponse.json({ error: "Piece not found" }, { status: 404 });
  }

  const now = new Date().toISOString();

  // Log movement
  const { data: movement, error: movErr } = await supabase
    .from("inventory_movements")
    .insert({
      tenant_id:        tenantId,
      piece_id,
      from_location_id: piece.location_id ?? null,
      to_location_id:   to_location_id   ?? null,
      from_status_id:   piece.status_id  ?? null,
      to_status_id:     to_status_id     ?? null,
      moved_by:         moved_by         ?? null,
      notes:            notes            ?? null,
      moved_at:         now,
    })
    .select()
    .single();

  if (movErr) return NextResponse.json({ error: movErr.message }, { status: 500 });

  // Update piece location and/or status
  const pieceUpdate: Record<string, string | null> = { updated_at: now };
  if (to_location_id) pieceUpdate.location_id = to_location_id;
  if (to_status_id)   pieceUpdate.status_id   = to_status_id;

  const { error: updateErr } = await supabase
    .from("inventory_pieces")
    .update(pieceUpdate)
    .eq("id", piece_id);

  if (updateErr) {
    console.error("[movements POST] piece update failed:", updateErr.message);
  }

  return NextResponse.json({ movement });
}

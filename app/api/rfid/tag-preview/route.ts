import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/require-auth";
import { createTenantSupabaseClient } from "@/lib/supabase-server";
import { tenantScoped } from "@/lib/tenantScoped";
import { loadTagCopy } from "@/lib/rfid-tag-copy";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/rfid/tag-preview?piece_id=
 * The flag copy for the preview. Does not queue a print or write a tag.
 * Tenant comes from the session.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;
  const tenantId = auth.ctx.tenantId;
  const pieceId = new URL(req.url).searchParams.get("piece_id") ?? "";
  if (!pieceId) return NextResponse.json({ error: "piece_id required" }, { status: 400 });

  const supabase = await createTenantSupabaseClient(tenantId);
  const { data: piece, error } = await tenantScoped(supabase, tenantId)
    .from("inventory_pieces")
    .select("id, sku, metal_karat, metal_colour, diamond_carat, diamond_type, finger_size")
    .eq("id", pieceId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!piece) return NextResponse.json({ error: "Piece not found" }, { status: 404 });

  try {
    const copy = await loadTagCopy(supabase, tenantId, pieceId, piece);
    return NextResponse.json({ copy });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not load the tag" },
      { status: 500 },
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/require-auth";
import { createTenantSupabaseClient } from "@/lib/supabase-server";
import { tenantScoped } from "@/lib/tenantScoped";
import { loadTagCopy } from "@/lib/rfid-tag-copy";
import { previewLayoutFromCheck, UNKNOWN_PREVIEW_LAYOUT } from "@/lib/rfid-preview-layout";

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

  let layout = UNKNOWN_PREVIEW_LAYOUT;
  const { data: printer, error: printerErr } = await tenantScoped(supabase, tenantId)
    .from("rfid_printers")
    .select("last_check, head_dpi")
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (printerErr && !/last_check|head_dpi|column/i.test(printerErr.message)) {
    console.warn("[rfid/tag-preview] printer check lookup failed:", printerErr.message);
  }
  if (!printerErr && printer) {
    layout = previewLayoutFromCheck(
      (printer as { last_check?: unknown }).last_check,
      (printer as { head_dpi?: unknown }).head_dpi,
    );
  }

  try {
    const copy = await loadTagCopy(supabase, tenantId, pieceId, piece);
    return NextResponse.json({ copy, layout });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not load the tag" },
      { status: 500 },
    );
  }
}

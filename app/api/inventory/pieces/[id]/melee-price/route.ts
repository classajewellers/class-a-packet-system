import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { requireManager } from "@/lib/require-auth";
import { resolveMeleeOrigin, resolvePieceMeleeQuality, priceMelee } from "@/lib/melee-pricing";

export const dynamic = "force-dynamic";
export const revalidate = 0; // never serve a cached response — always read fresh
                             // melee fields (matches the sibling piece routes)

// Looks up the confirmed melee price for a piece's set melee stones.
// Every step is exact-match-or-flag — no interpolation, no inferred quality.
// Returns a discriminated `status` the UI renders directly.
//
//   ok               → priced: { quantity, carat, mm, per_stone, total, quality, shape, origin }
//   none             → the piece has no melee stones
//   incomplete       → melee present but missing shape / quality / carat / mm
//   no_origin        → diamond_type is None/absent, so no origin
//   origin_unrecognized → diamond_type is set but not a known value (e.g. a typo)
//   no_price         → no exact price-list row matches
export async function GET(req: NextRequest, { params }: { params: { id: string } }): Promise<NextResponse> {
  const auth = await requireManager(req);
  if (!auth.ok) return auth.response;
  const { tenantId } = auth.ctx;

  const supabase = createServerSupabaseClient();

  const { data: piece, error: pErr } = await supabase
    .from("inventory_pieces")
    .select("id, diamond_type, melee_quantity, melee_carat_weight, melee_mm, melee_quality, melee_colour_group, melee_clarity, melee_shape")
    .eq("id", params.id)
    .eq("tenant_id", tenantId)
    .single();
  if (pErr || !piece) return NextResponse.json({ error: "Piece not found" }, { status: 404 });

  const qty     = piece.melee_quantity != null ? Number(piece.melee_quantity) : 0;
  const carat   = piece.melee_carat_weight != null ? Number(piece.melee_carat_weight) : null;
  const mm      = (piece.melee_mm ?? "").trim();
  // Quality selected directly (melee_quality); legacy pieces saved before
  // migration 122 fall back to composing the old colour_group + clarity —
  // see resolvePieceMeleeQuality's doc comment for why this is safe.
  const quality = resolvePieceMeleeQuality(piece.melee_quality, piece.melee_colour_group, piece.melee_clarity);
  const shape   = (piece.melee_shape ?? "").trim();

  // "none" is a piece-only concept (piece has no melee stones set) — kept here.
  if (!qty || qty <= 0) return NextResponse.json({ status: "none" });

  // Preserve the original status ORDER: incomplete is flagged before origin.
  // mm is required for an exact price match (0.01ct differs by mm).
  if (!carat || carat <= 0 || !mm || !quality || !shape) {
    return NextResponse.json({ status: "incomplete", missing: {
      carat: !carat, mm: !mm, quality: !quality, shape: !shape,
    }});
  }

  // diamond_type → origin. Strict: an unrecognised value is flagged, never guessed.
  // (No supplier concept — origin only selects which price rows apply.)
  const originRes = resolveMeleeOrigin(piece.diamond_type);
  if (originRes.origin == null) {
    return NextResponse.json({
      status: originRes.reason === "unrecognized" ? "origin_unrecognized" : "no_origin",
      diamond_type: piece.diamond_type ?? null,
    });
  }

  // Shared, mm-precise, quality-direct pricing lookup.
  const result = await priceMelee(supabase, {
    tenantId, origin: originRes.origin, shape, quality, carat, mm, qty,
  });
  if (result.status === "error") {
    return NextResponse.json({ error: result.message }, { status: 500 });
  }
  return NextResponse.json(result);
}

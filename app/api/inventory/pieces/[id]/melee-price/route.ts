import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { requireManager } from "@/lib/require-auth";
import { resolveMeleeOrigin, priceMelee } from "@/lib/melee-pricing";

export const dynamic = "force-dynamic";
export const revalidate = 0; // never serve a cached response — always read fresh
                             // melee fields (matches the sibling piece routes)

// Looks up the confirmed melee price for a piece's set melee stones.
// Every step is exact-match-or-flag — no interpolation, no inferred quality.
// Returns a discriminated `status` the UI renders directly.
//
//   ok               → priced: { quantity, carat, per_stone, total, quality, shape, supplier_name }
//   none             → the piece has no melee stones
//   incomplete       → melee present but missing shape / colour / clarity / carat
//   no_origin        → diamond_type is None/absent, so no origin → no supplier
//   origin_unrecognized → diamond_type is set but not a known value (e.g. a typo)
//   supplier_missing → the origin's supplier record wasn't found
//   unmapped         → (colour_group, clarity) has no confirmed quality mapping yet
//   no_price         → mapping exists but no exact price-list row matches
export async function GET(req: NextRequest, { params }: { params: { id: string } }): Promise<NextResponse> {
  const auth = await requireManager(req);
  if (!auth.ok) return auth.response;
  const { tenantId } = auth.ctx;

  const supabase = createServerSupabaseClient();

  const { data: piece, error: pErr } = await supabase
    .from("inventory_pieces")
    .select("id, diamond_type, melee_quantity, melee_carat_weight, melee_colour_group, melee_clarity, melee_shape")
    .eq("id", params.id)
    .eq("tenant_id", tenantId)
    .single();
  if (pErr || !piece) return NextResponse.json({ error: "Piece not found" }, { status: 404 });

  const qty    = piece.melee_quantity != null ? Number(piece.melee_quantity) : 0;
  const carat  = piece.melee_carat_weight != null ? Number(piece.melee_carat_weight) : null;
  const colour = (piece.melee_colour_group ?? "").trim();
  const clar   = (piece.melee_clarity ?? "").trim();
  const shape  = (piece.melee_shape ?? "").trim();

  // "none" is a piece-only concept (piece has no melee stones set) — kept here.
  if (!qty || qty <= 0) return NextResponse.json({ status: "none" });

  // Preserve the original status ORDER: incomplete is flagged before origin, so a
  // piece missing both fields and origin still returns "incomplete" as before.
  if (!carat || carat <= 0 || !colour || !clar || !shape) {
    return NextResponse.json({ status: "incomplete", missing: {
      carat: !carat, colour_group: !colour, clarity: !clar, shape: !shape,
    }});
  }

  // Origin → supplier (see lib/melee-pricing.ts for the current-state assumption).
  // Strict: an unrecognised diamond_type (e.g. a typo) is flagged, never guessed.
  // Origin-level resolution stays in the endpoint; priceMelee takes a resolved origin.
  const originRes = resolveMeleeOrigin(piece.diamond_type);
  if (originRes.origin == null) {
    return NextResponse.json({
      status: originRes.reason === "unrecognized" ? "origin_unrecognized" : "no_origin",
      diamond_type: piece.diamond_type ?? null,
    });
  }

  // Shared pricing lookup (identical logic to before — extracted verbatim).
  const result = await priceMelee(supabase, {
    tenantId, origin: originRes.origin, shape, colourGroup: colour, clarity: clar,
    carat: carat ?? NaN, qty,
  });
  if (result.status === "error") {
    return NextResponse.json({ error: result.message }, { status: 500 });
  }
  return NextResponse.json(result);
}

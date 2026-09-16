// POST /api/quotes/melee-price — live melee pricing for a quote-builder product
// line (a draft that is NOT a saved inventory_pieces row). Takes the staff-
// selected melee params directly and calls the SAME shared priceMelee(...) used
// by the per-piece endpoint — one pricing source of truth.
//
// Manager/admin only: melee cost is manager-only in the builder, and this returns
// per-stone cost. Under Switch View, an effective-staff role is correctly 403'd.
//
// Body: { origin, shape, colourGroup, clarity, carat, qty }
//   origin accepts "lab"/"natural" or "Lab Grown"/"Natural" (resolved strictly).
// Returns the priceMelee discriminated status (ok/incomplete/unmapped/no_price/
// supplier_missing/origin_unrecognized/error).

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { requireManager } from "@/lib/require-auth";
import { resolveMeleeOrigin, priceMelee } from "@/lib/melee-pricing";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await requireManager(req);
  if (!auth.ok) return auth.response;
  const { tenantId } = auth.ctx;

  let body: {
    origin?: string; shape?: string; colourGroup?: string;
    clarity?: string; carat?: number | string; mm?: number | string; qty?: number | string;
  } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Origin resolution stays with the caller (mirrors the piece endpoint): a typo
  // is flagged, never guessed.
  const originRes = resolveMeleeOrigin(body.origin);
  if (originRes.origin == null) {
    return NextResponse.json({
      status: originRes.reason === "unrecognized" ? "origin_unrecognized" : "no_origin",
      origin: body.origin ?? null,
    });
  }

  const supabase = createServerSupabaseClient();
  const result = await priceMelee(supabase, {
    tenantId,
    origin:      originRes.origin,
    shape:       String(body.shape ?? ""),
    colourGroup: String(body.colourGroup ?? ""),
    clarity:     String(body.clarity ?? ""),
    carat:       body.carat != null ? Number(body.carat) : NaN,
    mm:          body.mm != null ? String(body.mm) : null,
    qty:         body.qty != null ? Number(body.qty) : 0,
  });

  if (result.status === "error") {
    return NextResponse.json({ error: result.message }, { status: 500 });
  }
  return NextResponse.json(result);
}

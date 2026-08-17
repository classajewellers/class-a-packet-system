import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// POST /api/rfid/pieces/[id]/verify
//
// Confirms that a printed tag has been physically read and the EPC is correct.
// This is the ONLY place tags move to "active".
//
// For the first test, this is a manual admin action (manager clicks
// "Confirm Tag Encoded" in the UI after physically reading the tag).
// Future: the AZH-P1 handheld will call this endpoint automatically.
//
// Atomically:
//   1. Find the "printed" tag for this piece
//   2. Retire any existing "active" tag (replacement case)
//   3. Promote the "printed" tag to "active"
//
// Body: { confirmed_epc?: string } — optional: supply the EPC you physically
// read to verify it matches what Vault expected.
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  const supabase = await createTenantSupabaseClient(tenantId);

  const body = await req.json().catch(() => ({}));
  const { confirmed_epc } = body;

  // Find the printed (unverified) tag for this piece
  const { data: printedTag, error: findErr } = await supabase
    .from("inventory_rfid_tags")
    .select("id, epc, status")
    .eq("inventory_piece_id", params.id)
    .eq("status", "printed")
    .maybeSingle();

  if (findErr) {
    return NextResponse.json({ error: findErr.message }, { status: 500 });
  }
  if (!printedTag) {
    return NextResponse.json(
      { error: "No tag in 'printed' state found for this piece. Nothing to verify." },
      { status: 404 }
    );
  }

  // If the caller supplied a confirmed EPC, verify it matches
  if (confirmed_epc) {
    if (confirmed_epc.toLowerCase() !== printedTag.epc.toLowerCase()) {
      return NextResponse.json(
        {
          error: "EPC mismatch: the tag you read does not match the EPC Vault assigned.",
          expected_epc: printedTag.epc,
          confirmed_epc: confirmed_epc.toLowerCase(),
        },
        { status: 422 }
      );
    }
  }

  const now = new Date().toISOString();

  // Retire any existing active tag for this piece (replacement scenario)
  // This is safe: done before activating the new tag, but the unique index
  // (WHERE status='active') means only one active tag can exist — so retiring
  // the old one first leaves a window with zero active tags, then we immediately
  // fill it with the verified tag.
  const { data: existingActive } = await supabase
    .from("inventory_rfid_tags")
    .select("id")
    .eq("inventory_piece_id", params.id)
    .eq("status", "active")
    .maybeSingle();

  if (existingActive) {
    const { error: retireErr } = await supabase
      .from("inventory_rfid_tags")
      .update({
        status:            "replaced",
        retired_at:        now,
        retirement_reason: "replaced_by_verified_tag",
      })
      .eq("id", existingActive.id);

    if (retireErr) {
      return NextResponse.json({ error: `Failed to retire existing tag: ${retireErr.message}` }, { status: 500 });
    }
  }

  // Activate the verified tag
  const { data: activatedTag, error: activateErr } = await supabase
    .from("inventory_rfid_tags")
    .update({
      status:       "active",
      activated_at: now,
    })
    .eq("id", printedTag.id)
    .eq("status", "printed")  // guard against race: only update if still printed
    .select("id, epc, status, activated_at")
    .single();

  if (activateErr || !activatedTag) {
    return NextResponse.json(
      { error: activateErr?.message ?? "Failed to activate tag — may have already changed state" },
      { status: 500 }
    );
  }

  return NextResponse.json({ tag: activatedTag, verified: true });
}

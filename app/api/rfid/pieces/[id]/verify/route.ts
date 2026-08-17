import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// POST /api/rfid/pieces/[id]/verify
//
// Verifies a printed RFID tag by confirming the EPC read from the physical tag
// matches what Vault encoded. Uses vault_verify_rfid_tag() — a PostgreSQL stored
// procedure — to atomically:
//   1. Confirm the printed tag exists and the EPC matches exactly
//   2. Retire any existing active tag (replacement case)
//   3. Activate the verified tag with full audit fields
//
// confirmed_epc is REQUIRED. There is no "click to confirm without reading"
// path. If the AZH-P1 (or other UHF EPC Gen2 reader) is not yet available,
// leave the tag in 'printed' state. Do not fake verification.
//
// Body: {
//   confirmed_epc:       string  — the 24-hex-char EPC read from the physical tag
//   verification_method: string  — e.g. "uhf_reader_manual", "azh_p1"
//   device_id?:          string  — device serial/identifier when available
// }
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const tenantId = req.headers.get("x-tenant-id") ?? "";

  const body = await req.json().catch(() => ({}));
  const {
    confirmed_epc,
    verification_method = "uhf_reader_manual",
    device_id = null,
  } = body;

  // confirmed_epc is not optional
  if (!confirmed_epc || typeof confirmed_epc !== "string") {
    return NextResponse.json(
      {
        error: "confirmed_epc is required. Read the physical tag with a UHF EPC Gen2 reader and provide the observed EPC.",
        code: "epc_required",
      },
      { status: 400 }
    );
  }

  const normalised = confirmed_epc.trim().toLowerCase();
  if (!/^[0-9a-f]{24}$/.test(normalised)) {
    return NextResponse.json(
      {
        error: `Invalid EPC format. Expected 24 lowercase hex characters, got: "${confirmed_epc}"`,
        code: "epc_format_invalid",
      },
      { status: 400 }
    );
  }

  // The piece_id is the URL param — find the printed tag for it
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: printedTag, error: findErr } = await supabase
    .from("inventory_rfid_tags")
    .select("id")
    .eq("inventory_piece_id", params.id)
    .eq("tenant_id", tenantId)
    .eq("status", "printed")
    .maybeSingle();

  if (findErr) {
    return NextResponse.json({ error: findErr.message }, { status: 500 });
  }
  if (!printedTag) {
    return NextResponse.json(
      { error: "No tag in 'printed' state found for this piece.", code: "not_found" },
      { status: 404 }
    );
  }

  // Call the atomic PostgreSQL function. This uses SELECT FOR UPDATE internally
  // so concurrent verification attempts on the same tag are serialised by the DB.
  const { data: result, error: rpcErr } = await supabase.rpc("vault_verify_rfid_tag", {
    p_tenant_id:           tenantId,
    p_tag_id:              printedTag.id,
    p_confirmed_epc:       normalised,
    p_verified_by:         null,      // user_id not wired yet — add when auth context available
    p_verification_method: verification_method,
    p_device_id:           device_id,
  });

  if (rpcErr) {
    return NextResponse.json({ error: rpcErr.message }, { status: 500 });
  }

  const res = result as { ok: boolean; error?: string; code?: string; [k: string]: unknown };

  if (!res.ok) {
    const httpStatus = res.code === "epc_mismatch" ? 422 : 404;
    return NextResponse.json(res, { status: httpStatus });
  }

  return NextResponse.json(res);
}

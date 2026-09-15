import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { validateBridgeAuth } from "@/lib/rfid-bridge-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

// POST /api/rfid/bridge/verify  (bridge-authenticated)
// Auto-verification: after the bridge confirms — from the printer's own /rfidlog
// — that the expected EPC was physically written, it calls this to activate the
// tag without a human UHF scan. The manual /api/rfid/pieces/[id]/verify path
// stays available as the fallback/override.
//
// Body: { job_id, epc, device_id?, printer_timestamp? }
export async function POST(req: NextRequest): Promise<NextResponse> {
  const identity = await validateBridgeAuth(req.headers.get("authorization"));
  if (!identity) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { job_id?: string; epc?: string; device_id?: string; printer_timestamp?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const { job_id, epc, device_id } = body;
  if (!job_id || !epc) {
    return NextResponse.json({ error: "job_id and epc are required" }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();

  // Load the job; it must belong to THIS bridge's tenant and carry a tag.
  const { data: job, error: jobErr } = await supabase
    .from("print_jobs")
    .select("id, tenant_id, rfid_tag_id")
    .eq("id", job_id)
    .maybeSingle();

  if (jobErr) {
    console.error("[rfid/bridge/verify] job lookup failed:", jobErr.message);
    return NextResponse.json({ error: jobErr.message }, { status: 500 });
  }
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  if (String(job.tenant_id) !== identity.tenantId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!job.rfid_tag_id) {
    return NextResponse.json({ error: "Job has no associated tag" }, { status: 409 });
  }

  // Atomic verify. EPC must match what Vault encoded (the RPC re-checks it), and
  // any existing active tag for the piece is retired. verified_by is null (no
  // human); method records that this came from the printer log.
  const { data: result, error: rpcErr } = await supabase.rpc("vault_verify_rfid_tag", {
    p_tenant_id:           identity.tenantId,
    p_tag_id:              job.rfid_tag_id,
    p_confirmed_epc:       epc.trim().toLowerCase(),
    p_verified_by:         null,
    p_verification_method: "printer_log",
    p_device_id:           device_id ?? null,
  });

  if (rpcErr) {
    console.error("[rfid/bridge/verify] rpc failed:", rpcErr.message);
    return NextResponse.json({ error: rpcErr.message }, { status: 500 });
  }

  // result is jsonb: { ok: bool, code?, ... }. Pass it through so the bridge logs it.
  return NextResponse.json({ result });
}

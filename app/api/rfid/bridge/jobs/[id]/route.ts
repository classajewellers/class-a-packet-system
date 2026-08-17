import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { validateBridgeAuth } from "@/lib/rfid-bridge-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// PATCH /api/rfid/bridge/jobs/[id]
// Bridge reports status transitions.
//
// Tag lifecycle note:
//   Job "completed" means ZPL was transmitted over TCP — NOT that the RFID chip
//   encoded successfully. The ZD621R does not return encode confirmation over
//   port 9100. Therefore: job completed → tag status "printed" (unverified).
//   Tags only become "active" after physical verification via
//   POST /api/rfid/pieces/[id]/verify.
//
// Valid bridge transitions:
//   queued  → claimed   (bridge took the job)
//   claimed → printing  (ZPL sent to printer socket)
//   printing → completed (no TCP error)
//   *       → failed    (any error; include error_message)
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const identity = await validateBridgeAuth(req.headers.get("authorization"));
  if (!identity) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { status, error_message } = await req.json();
  const validStatuses = ["claimed", "printing", "completed", "failed"];
  if (!validStatuses.includes(status)) {
    return NextResponse.json(
      { error: `Invalid status. Allowed: ${validStatuses.join(", ")}` },
      { status: 400 }
    );
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const now = new Date().toISOString();

  const { data: job, error: fetchErr } = await supabase
    .from("print_jobs")
    .select("id, tenant_id, rfid_tag_id, status, retry_count")
    .eq("id", params.id)
    .single();

  if (fetchErr || !job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }
  if (job.tenant_id !== identity.tenantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const updates: Record<string, unknown> = {
    status,
    installation_id: identity.installationId,
  };

  if (status === "claimed")   updates.claimed_at   = now;
  if (status === "printing")  updates.started_at   = now;
  if (status === "completed") updates.completed_at = now;
  if (status === "failed") {
    updates.failed_at   = now;
    updates.last_error  = error_message ?? "Unknown error";
    updates.retry_count = (job.retry_count ?? 0) + 1;
  }

  const { error: updateErr } = await supabase
    .from("print_jobs")
    .update(updates)
    .eq("id", params.id);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  if (status === "completed" && job.rfid_tag_id) {
    // ZPL transmitted — tag moves to "printed" (NOT "active").
    // Tag only becomes "active" after physical verification.
    await supabase
      .from("inventory_rfid_tags")
      .update({ status: "printed" })
      .eq("id", job.rfid_tag_id)
      .eq("status", "pending");

    if (identity.printerId) {
      await supabase
        .from("rfid_printers")
        .update({ last_print_at: now, last_seen_at: now })
        .eq("id", identity.printerId);
    }
  }

  if (status === "failed" && job.rfid_tag_id) {
    // TCP-level failure — tag is void/unencoded, mark damaged.
    await supabase
      .from("inventory_rfid_tags")
      .update({
        status:             "damaged",
        retired_at:         now,
        retirement_reason:  "print_failed",
      })
      .eq("id", job.rfid_tag_id)
      .in("status", ["pending", "printed"]);

    if (identity.printerId) {
      await supabase
        .from("rfid_printers")
        .update({ last_error: error_message ?? "Print failed", last_seen_at: now })
        .eq("id", identity.printerId);
    }
  }

  return NextResponse.json({ success: true, status });
}

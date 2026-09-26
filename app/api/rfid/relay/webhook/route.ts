import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { printRelayEnabled, relaySecret, verifyRelayBody } from "@/lib/rfid-relay";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

// POST /api/rfid/relay/webhook
// Signed result from the print relay. 404 while RFID_PRINT_RELAY is off.
export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!printRelayEnabled()) {
    return NextResponse.json({ error: "Print relay is off" }, { status: 404 });
  }
  const raw = await req.text();
  const ok = verifyRelayBody(
    relaySecret(),
    req.headers.get("x-relay-timestamp") ?? "",
    raw,
    req.headers.get("x-relay-signature") ?? "",
  );
  if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = JSON.parse(raw) as {
    job_id?: string;
    printer_id?: string;
    status?: string;
    epc?: string;
    reason?: string;
    attempt?: number;
  };
  if (!body.job_id || (body.status !== "printed" && body.status !== "failed")) {
    return NextResponse.json({ error: "job_id and status are required" }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const { data: job, error } = await supabase
    .from("print_jobs")
    .select("id, printer_id, rfid_tag_id, status, label_data")
    .eq("id", body.job_id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  if (body.printer_id && job.printer_id && body.printer_id !== job.printer_id) {
    return NextResponse.json({ error: "Printer does not match the job" }, { status: 409 });
  }
  if (job.status === "completed" || job.status === "failed" || job.status === "cancelled") {
    return NextResponse.json({ ok: true, status: job.status });
  }

  const now = new Date().toISOString();
  if (body.status === "printed") {
    const label = (job.label_data && typeof job.label_data === "object") ? job.label_data as Record<string, unknown> : {};
    const { error: updateErr } = await supabase.from("print_jobs").update({
      status: "completed",
      completed_at: now,
      label_data: { ...label, readback_epc: body.epc ?? null },
    }).eq("id", job.id);
    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });
    if (job.rfid_tag_id) {
      await supabase.from("inventory_rfid_tags").update({ status: "printed" }).eq("id", job.rfid_tag_id).eq("status", "pending");
    }
    return NextResponse.json({ ok: true, status: "completed" });
  }

  const reason = body.reason || "Print relay reported a failure";
  const { error: updateErr } = await supabase.from("print_jobs").update({
    status: "failed",
    failed_at: now,
    last_error: reason,
    retry_count: typeof body.attempt === "number" ? body.attempt : 1,
  }).eq("id", job.id);
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });
  if (job.rfid_tag_id) {
    await supabase.from("inventory_rfid_tags").update({
      status: "damaged",
      retired_at: now,
      retirement_reason: "print_failed",
    }).eq("id", job.rfid_tag_id).in("status", ["pending", "printed"]);
  }
  return NextResponse.json({ ok: true, status: "failed" });
}

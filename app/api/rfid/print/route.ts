import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { createTenantSupabaseClient } from "@/lib/supabase-server";
import { generateJewelleryZpl } from "@/lib/rfid-label";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// POST /api/rfid/print
// Body: { piece_id, replace?: boolean }
//
// Tag lifecycle:
//   pending  — EPC assigned, job queued (not yet on a physical tag)
//   printed  — ZPL transmitted to printer (unverified; TCP success ≠ RFID encode)
//   active   — physically verified; tag read and EPC confirmed correct
//
// Replacement safety:
//   The existing active tag is NOT retired here. It stays active until the new
//   tag is physically verified via POST /api/rfid/pieces/[id]/verify. Only at
//   verification do we retire the old tag and activate the new one atomically.
export async function POST(req: NextRequest): Promise<NextResponse> {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  const supabase = await createTenantSupabaseClient(tenantId);

  const { piece_id, replace = false } = await req.json();
  if (!piece_id) return NextResponse.json({ error: "piece_id required" }, { status: 400 });

  // ── Guard: block if a tag is already pending or printed (not yet verified) ──
  // This prevents double-print from rapid clicks or retried requests.
  const { data: inflightTag } = await supabase
    .from("inventory_rfid_tags")
    .select("id, status, epc")
    .eq("inventory_piece_id", piece_id)
    .in("status", ["pending", "printed"])
    .maybeSingle();

  if (inflightTag) {
    return NextResponse.json(
      {
        error: inflightTag.status === "pending"
          ? "A print job is already queued for this piece. Wait for it to complete."
          : "This piece has a tag awaiting verification. Verify or discard it before printing again.",
        tag: inflightTag,
      },
      { status: 409 }
    );
  }

  // ── Guard: block if a job is already in-flight ─────────────────────────────
  const { data: inflightJob } = await supabase
    .from("print_jobs")
    .select("id, status")
    .eq("piece_id", piece_id)
    .in("status", ["queued", "claimed", "printing"])
    .maybeSingle();

  if (inflightJob) {
    return NextResponse.json(
      { error: "A print job is already in progress for this piece.", job: inflightJob },
      { status: 409 }
    );
  }

  // ── Guard: check for existing active tag ───────────────────────────────────
  const { data: existingActiveTag } = await supabase
    .from("inventory_rfid_tags")
    .select("id, epc, status")
    .eq("inventory_piece_id", piece_id)
    .eq("status", "active")
    .maybeSingle();

  if (existingActiveTag && !replace) {
    return NextResponse.json(
      {
        error: "This piece already has a verified active RFID tag. Pass replace=true to request a replacement.",
        existing_tag: existingActiveTag,
      },
      { status: 409 }
    );
  }

  // NOTE: if replace=true and existingActiveTag exists, we do NOT retire it here.
  // The old tag remains active until the new replacement tag is physically verified.
  // Retirement happens atomically at verification time (POST /api/rfid/pieces/[id]/verify).

  // ── Check for an active printer for this tenant ────────────────────────────
  const { data: printer } = await supabase
    .from("rfid_printers")
    .select("id")
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!printer) {
    return NextResponse.json(
      { error: "No active RFID printer configured. Set one up in Settings → RFID." },
      { status: 422 }
    );
  }

  // ── Fetch piece ────────────────────────────────────────────────────────────
  const { data: piece, error: pErr } = await supabase
    .from("inventory_pieces")
    .select(`
      id, sku, title, notes, barcode,
      metal:inventory_metals(id, name),
      stone:inventory_stones(id, name)
    `)
    .eq("id", piece_id)
    .single();

  if (pErr || !piece) {
    return NextResponse.json({ error: "Piece not found" }, { status: 404 });
  }

  // ── Generate EPC (random 96-bit, 24 hex chars) ─────────────────────────────
  // EPC Gen2 standard is 96 bits minimum on all UHF RFID chips.
  // This is opaque — not derived from any mutable product/pricing data.
  const epc = randomBytes(12).toString("hex"); // always lowercase hex
  const now = new Date().toISOString();

  // ── Build ZPL ──────────────────────────────────────────────────────────────
  // Label dimensions use defaults until Sean confirms actual label spec.
  // widthDots / lengthDots should come from printer config once confirmed.
  const metalName  = (piece as any).metal?.name ?? null;
  const stoneName  = (piece as any).stone?.name ?? null;
  const zplPayload = generateJewelleryZpl({
    epc,
    sku:       piece.sku,
    title:     (piece as any).title ?? piece.sku,
    metal:     metalName,
    stone:     stoneName,
    barcode:   (piece as any).barcode ?? piece.sku,
    // widthDots / lengthDots: not configured yet — using defaults pending label spec
  });

  // ── Create RFID tag record ─────────────────────────────────────────────────
  // The database enforces at most one unresolved (pending/printed) tag per piece
  // via inventory_rfid_tags_one_unresolved_per_piece partial unique index.
  // If a concurrent request slips through the SELECT guards above, the INSERT
  // will fail with a unique constraint violation — we return 409 for that case.
  const { data: tag, error: tagErr } = await supabase
    .from("inventory_rfid_tags")
    .insert({
      tenant_id:           tenantId,
      inventory_piece_id:  piece_id,
      epc,
      status:              "pending",
      assigned_at:         now,
    })
    .select("id, epc")
    .single();

  if (tagErr || !tag) {
    const isConflict = tagErr?.code === "23505"; // PostgreSQL unique_violation
    return NextResponse.json(
      { error: isConflict ? "A print job is already in progress for this piece." : (tagErr?.message ?? "Failed to create RFID tag record") },
      { status: isConflict ? 409 : 500 }
    );
  }

  // ── Create print job ───────────────────────────────────────────────────────
  // The database also enforces at most one in-flight job per piece via
  // print_jobs_one_inflight_per_piece partial unique index.
  const idempotencyKey = `rfid-tag-${tag.id}`;

  const { data: job, error: jobErr } = await supabase
    .from("print_jobs")
    .insert({
      tenant_id:       tenantId,
      piece_id,
      printer_id:      printer.id,
      rfid_tag_id:     tag.id,
      status:          "queued",
      zpl_payload:     zplPayload,
      label_data: {
        epc,
        sku:     piece.sku,
        title:   (piece as any).title,
        metal:   metalName,
        stone:   stoneName,
        barcode: (piece as any).barcode ?? piece.sku,
      },
      label_template:  "jewellery_v1",
      idempotency_key: idempotencyKey,
      requested_at:    now,
    })
    .select("id, status, created_at")
    .single();

  if (jobErr || !job) {
    // Roll back tag record before returning
    await supabase.from("inventory_rfid_tags").delete().eq("id", tag.id);
    const isConflict = jobErr?.code === "23505";
    return NextResponse.json(
      { error: isConflict ? "A print job is already in progress for this piece." : (jobErr?.message ?? "Failed to create print job") },
      { status: isConflict ? 409 : 500 }
    );
  }

  // Link tag → job
  await supabase
    .from("inventory_rfid_tags")
    .update({ print_job_id: job.id })
    .eq("id", tag.id);

  return NextResponse.json({ print_job: job, rfid_tag: tag }, { status: 201 });
}

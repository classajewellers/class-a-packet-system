import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { createTenantSupabaseClient } from "@/lib/supabase-server";
import { generateJewelleryZpl } from "@/lib/rfid-label";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// POST /api/rfid/print
// Body: { piece_id, replace?: boolean }
//
// Creates an RFID tag record (status=pending) and a print_job (status=queued).
// The bridge picks up the job and sends ZPL to the printer.
export async function POST(req: NextRequest): Promise<NextResponse> {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  const supabase = await createTenantSupabaseClient(tenantId);

  const { piece_id, replace = false } = await req.json();
  if (!piece_id) return NextResponse.json({ error: "piece_id required" }, { status: 400 });

  // Fetch piece with enough data to build the label
  const { data: piece, error: pErr } = await supabase
    .from("inventory_pieces")
    .select(`
      id, sku, title, notes, barcode,
      category:inventory_categories(id, name),
      metal:inventory_metals(id, name),
      stone:inventory_stones(id, name)
    `)
    .eq("id", piece_id)
    .single();

  if (pErr || !piece) {
    return NextResponse.json({ error: "Piece not found" }, { status: 404 });
  }

  // Check for existing active tag
  const { data: existingTag } = await supabase
    .from("inventory_rfid_tags")
    .select("id, epc, status")
    .eq("inventory_piece_id", piece_id)
    .eq("status", "active")
    .maybeSingle();

  if (existingTag && !replace) {
    return NextResponse.json(
      { error: "This piece already has an active RFID tag. Pass replace=true to issue a replacement.", existing_tag: existingTag },
      { status: 409 }
    );
  }

  // If replacing, retire existing active tag
  if (existingTag && replace) {
    await supabase
      .from("inventory_rfid_tags")
      .update({ status: "replaced", retired_at: new Date().toISOString(), retirement_reason: "replacement_requested" })
      .eq("id", existingTag.id);
  }

  // Check for an active printer for this tenant
  const { data: printer } = await supabase
    .from("rfid_printers")
    .select("id")
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!printer) {
    return NextResponse.json(
      { error: "No active RFID printer configured for this tenant. Set one up in Settings → RFID." },
      { status: 422 }
    );
  }

  // Generate a random 96-bit EPC (12 bytes → 24 hex chars)
  const epc = randomBytes(12).toString("hex");
  const now = new Date().toISOString();

  // Generate ZPL
  const metalName  = (piece as any).metal?.name  ?? null;
  const stoneName  = (piece as any).stone?.name  ?? null;
  const zplPayload = generateJewelleryZpl({
    epc,
    sku:    piece.sku,
    title:  piece.title ?? piece.sku,
    metal:  metalName,
    stone:  stoneName,
    barcode: piece.barcode ?? piece.sku,
  });

  // Create the RFID tag record
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
    return NextResponse.json({ error: tagErr?.message ?? "Failed to create RFID tag record" }, { status: 500 });
  }

  // Create the print job
  const idempotencyKey = `rfid-${tag.id}`;
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
        sku:       piece.sku,
        title:     piece.title,
        metal:     metalName,
        stone:     stoneName,
        barcode:   piece.barcode ?? piece.sku,
      },
      label_template:  "jewellery_v1",
      idempotency_key: idempotencyKey,
      requested_at:    now,
    })
    .select("id, status, created_at")
    .single();

  if (jobErr || !job) {
    // Roll back the tag record
    await supabase.from("inventory_rfid_tags").delete().eq("id", tag.id);
    return NextResponse.json({ error: jobErr?.message ?? "Failed to create print job" }, { status: 500 });
  }

  // Link tag → job
  await supabase
    .from("inventory_rfid_tags")
    .update({ print_job_id: job.id })
    .eq("id", tag.id);

  return NextResponse.json({ print_job: job, rfid_tag: tag }, { status: 201 });
}

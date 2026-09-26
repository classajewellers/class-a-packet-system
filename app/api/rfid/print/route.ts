import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { createTenantSupabaseClient } from "@/lib/supabase-server";
import { tenantScoped } from "@/lib/tenantScoped";
import { generateJewelleryZpl } from "@/lib/rfid-label";
import { loadTagCopy } from "@/lib/rfid-tag-copy";

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
  if (!tenantId) return NextResponse.json({ error: "Missing tenant" }, { status: 400 });
  const supabase = await createTenantSupabaseClient(tenantId);

  const { piece_id, replace = false } = await req.json();
  if (!piece_id) return NextResponse.json({ error: "piece_id required" }, { status: 400 });

  // ── Guard: block if a tag is already pending or printed (not yet verified) ──
  // This prevents double-print from rapid clicks or retried requests.
  const { data: inflightTag } = await tenantScoped(supabase, tenantId)
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
  const { data: inflightJob } = await tenantScoped(supabase, tenantId)
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
  const { data: existingActiveTag } = await tenantScoped(supabase, tenantId)
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
  const { data: printer } = await tenantScoped(supabase, tenantId)
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

  // ── Fetch piece (scalar columns only — no PostgREST embed) ─────────────────
  const { data: piece, error: pErr } = await tenantScoped(supabase, tenantId)
    .from("inventory_pieces")
    .select(`
      id, sku, notes, barcode,
      metal_karat, metal_colour,
      diamond_carat, diamond_colour, diamond_type,
      finger_size
    `)
    .eq("id", piece_id)
    .maybeSingle();

  // Distinguish a real query error from a genuinely missing piece. A DB error
  // must NEVER be mislabelled as "Piece not found" — that masked a schema
  // mismatch (the old design:inventory_designs(...) embed erroring on tenants
  // whose inventory_pieces has no design_id column).
  if (pErr) {
    console.error("[rfid/print] piece query failed:", pErr.message);
    return NextResponse.json({ error: `Failed to load piece: ${pErr.message}` }, { status: 500 });
  }
  if (!piece) {
    return NextResponse.json({ error: "Piece not found" }, { status: 404 });
  }

  // Design name is OPTIONAL and looked up separately so a missing design_id
  // column (schema drift) can never break printing. Any failure → no title.
  let designName: string | null = null;
  {
    const { data: pd, error: pdErr } = await tenantScoped(supabase, tenantId)
      .from("inventory_pieces")
      .select("design_id")
      .eq("id", piece_id)
      .maybeSingle();
    const designId = !pdErr ? ((pd as { design_id?: string | null } | null)?.design_id ?? null) : null;
    if (designId) {
      // inventory_designs has no tenant_id column (confirmed via migration
      // 029) — it predates tenancy and is scoped only by auth.role() RLS,
      // not per-tenant. Deliberately NOT wrapped in tenantScoped(), which
      // would error trying to filter a column that doesn't exist.
      const { data: d } = await supabase
        .from("inventory_designs")
        .select("name")
        .eq("id", designId)
        .maybeSingle();
      designName = (d as { name?: string | null } | null)?.name ?? null;
    }
  }

  // ── Generate EPC (random 96-bit, 24 hex chars) ─────────────────────────────
  // EPC Gen2 standard is 96 bits minimum on all UHF RFID chips.
  // This is opaque — not derived from any mutable product/pricing data.
  const epc = randomBytes(12).toString("hex"); // always lowercase hex
  const now = new Date().toISOString();

  // ── Build ZPL ──────────────────────────────────────────────────────────────
  // 26 × 26 mm head on a 36 mm face. rfid_printers has no DPI column, so this
  // stored copy is laid out at the generator default (203 dpi). The bridge does not send this
  // string for jewellery_v1. It rebuilds the same label_data at the printer's
  // reported head resolution, or printer.dpi in config.json.
  const p = piece as {
    sku: string;
    barcode?: string | null;
    metal_karat?: string | null;
    metal_colour?: string | null;
    diamond_carat?: number | string | null;
    diamond_type?: string | null;
    finger_size?: string | null;
  };
  let copy;
  try {
    copy = await loadTagCopy(supabase, tenantId, piece_id, p);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not load the tag fields" },
      { status: 500 },
    );
  }

  const zplPayload = generateJewelleryZpl({
    epc,
    sku: piece.sku,
    title: designName ?? piece.sku,
    metal: copy.metal,
    carat: copy.carat,
    shape: copy.shape,
    diamondType: copy.diamondType,
    fingerSize: copy.fingerSize,
    barcode: p.barcode ?? piece.sku,
  });

  // ── Create RFID tag record ─────────────────────────────────────────────────
  // The database enforces at most one unresolved (pending/printed) tag per piece
  // via inventory_rfid_tags_one_unresolved_per_piece partial unique index.
  // If a concurrent request slips through the SELECT guards above, the INSERT
  // will fail with a unique constraint violation — we return 409 for that case.
  const { data: tag, error: tagErr } = await tenantScoped(supabase, tenantId)
    .from("inventory_rfid_tags")
    .insert({
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

  const { data: job, error: jobErr } = await tenantScoped(supabase, tenantId)
    .from("print_jobs")
    .insert({
      piece_id,
      printer_id:      printer.id,
      rfid_tag_id:     tag.id,
      status:          "queued",
      zpl_payload:     zplPayload,
      label_data: {
        epc,
        sku: piece.sku,
        title: designName ?? piece.sku,
        metal: copy.metal,
        carat: copy.carat,
        shape: copy.shape,
        diamond_type: copy.diamondType,
        finger_size: copy.fingerSize,
        barcode: p.barcode ?? piece.sku,
      },
      label_template:  "jewellery_v1",
      idempotency_key: idempotencyKey,
      requested_at:    now,
    })
    .select("id, status, created_at")
    .single();

  if (jobErr || !job) {
    // Roll back tag record before returning
    await tenantScoped(supabase, tenantId).from("inventory_rfid_tags").delete().eq("id", tag.id);
    const isConflict = jobErr?.code === "23505";
    return NextResponse.json(
      { error: isConflict ? "A print job is already in progress for this piece." : (jobErr?.message ?? "Failed to create print job") },
      { status: isConflict ? 409 : 500 }
    );
  }

  // Link tag → job
  await tenantScoped(supabase, tenantId)
    .from("inventory_rfid_tags")
    .update({ print_job_id: job.id })
    .eq("id", tag.id);

  return NextResponse.json({ print_job: job, rfid_tag: tag }, { status: 201 });
}

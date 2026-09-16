// POST /api/pricing/melee-import/parse — dry-run parse of an uploaded melee
// price-list CSV (Settings → Melee "Import CSV"). Manager-only. Parses and
// normalizes via lib/melee-import-shared.mjs — the SAME module
// scripts/import-prana-melee.mjs uses — and returns stats + validation
// detail + the exact payload the confirm endpoint would write. NEVER touches
// the database: this is preview-only, matching the app's standard import
// safety pattern (extract/preview → confirm, same as the complimentary-items
// backfill).
//
// Expects multipart/form-data with a single "file" field (the CSV).
// CURRENT STANDARD FORMAT (replaces the earlier 11-column format entirely):
//   Origin, Shape, Quality, Carat, mm, $/carat, $/stone
// Quality arrives pre-combined (e.g. "EF VVS") — stored verbatim, never
// composed. No Price Mode column in this format — every row is a real price.
//
// If required columns are missing entirely, buildMeleeImportPayload returns
// ok:false BEFORE any row is parsed — that error is returned as-is so the
// preview can say exactly which column(s) are absent, before attempting to
// read a single row. Per-row problems (missing/invalid Shape, Carat, mm, etc.)
// are returned as `rowIssues`: one entry per bad row naming the exact field(s)
// at fault, not just a total skipped count.

import { NextRequest, NextResponse } from "next/server";
import { requireManager } from "@/lib/require-auth";
import { parseCsv, buildMeleeImportPayload } from "@/lib/melee-import-shared.mjs";

export const dynamic = "force-dynamic";

const MAX_BYTES = 15 * 1024 * 1024; // generous headroom over the ~1MB tested file

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await requireManager(req);
  if (!auth.ok) return auth.response;

  let file: File | null = null;
  try {
    const formData = await req.formData();
    const f = formData.get("file");
    if (f instanceof File) file = f;
  } catch {
    return NextResponse.json({ error: "Expected multipart/form-data with a 'file' field" }, { status: 400 });
  }

  if (!file) return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  if (file.size === 0) return NextResponse.json({ error: "Uploaded file is empty" }, { status: 400 });
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: `File too large (${(file.size / 1024 / 1024).toFixed(1)}MB) — max 15MB` }, { status: 400 });
  }
  if (!/\.csv$/i.test(file.name)) {
    return NextResponse.json({ error: "Expected a .csv file" }, { status: 400 });
  }

  const text = await file.text();
  const rows = parseCsv(text);
  if (rows.length < 2) {
    return NextResponse.json({ error: "CSV has no data rows (need a header row plus at least one data row)" }, { status: 400 });
  }
  const [header, ...dataRows] = rows;

  const result = buildMeleeImportPayload(header, dataRows);
  if (!result.ok) {
    return NextResponse.json({ error: result.error, missing: result.missing }, { status: 400 });
  }

  return NextResponse.json({
    filename: file.name,
    header,
    stats: result.stats,
    rowIssues: result.rowIssues,
    rowIssuesTruncated: result.rowIssuesTruncated,
    // Sample rows per origin, for the preview UI — full payload also returned
    // so the client can hold it and POST it to /confirm unchanged on approval.
    samples: Object.fromEntries(
      result.payload.groups.map((g) => [g.origin, g.rows.slice(0, 5)])
    ),
    payload: result.payload,
  });
}

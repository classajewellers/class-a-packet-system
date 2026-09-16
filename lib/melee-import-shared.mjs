/**
 * melee-import-shared.mjs — the ONE normalization pipeline for melee
 * price-list imports, shared by:
 *   • scripts/import-prana-melee.mjs        (local .xltx, two sheets = origin)
 *   • app/api/pricing/melee-import/parse    (uploaded CSV upload feature)
 *
 * Plain JS (no TS syntax) so it runs unmodified under plain `node` AND is
 * importable from the Next.js app (tsconfig has allowJs: true). Do not
 * duplicate this logic anywhere else — both callers must produce identical
 * output for identical input.
 *
 * CURRENT STANDARD FORMAT (replaces the earlier 11-column format entirely):
 *   Origin, Shape, Quality, Carat, mm, $/carat, $/stone
 * Quality arrives PRE-COMBINED (e.g. "EF VVS", "Fancy Yellow SI1-SI2+") — it
 * is stored verbatim, never composed from separate colour/clarity columns.
 * There is no Price Mode column in this format — every data row is a real
 * price to keep (no Parcels/Precised filtering step, since that concept
 * doesn't exist in this source).
 *
 * Rules:
 *   • Keep EVERY (shape, carat, mm, quality) variant distinct — no dedup
 *     across mm. mm is text (round: "0.90"; fancy shapes: "2.50 x 2.50").
 *   • Store the real price_per_stone AND/OR price_per_carat (at least one).
 *   • No supplier concept — origin only selects which rows apply.
 */

// ── mm normalization — MUST match lib/melee-pricing.ts's normalizeMm exactly
// (import + lookup must agree). Duplicated here deliberately: this module runs
// standalone under plain `node` and can't import a TS file. If one changes,
// change both — see lib/melee-pricing.ts's normalizeMm.
//
// Numeric sides are canonicalized to a fixed 2 decimals ("0.9"/"0.90" both
// become "0.90") — mm is an exact-match key, so without this a source that
// drops trailing zeros (e.g. a plain-numeric CSV export) would silently fail
// to match a source that kept them (e.g. an xltx text cell), even for the
// identical physical stone.
function formatMmNumber(s) {
  const n = Number(String(s).trim());
  return Number.isFinite(n) ? n.toFixed(2) : String(s).trim();
}
export function normalizeMm(mm) {
  const trimmed = String(mm ?? "").trim();
  if (!trimmed) return "";
  const parts = trimmed.split(/\s*[xX]\s*/);
  if (parts.length === 2) return `${formatMmNumber(parts[0])} x ${formatMmNumber(parts[1])}`;
  return formatMmNumber(trimmed);
}

/** Loose origin matching, per the confirmed rule — anything else is flagged,
 *  never guessed. */
export function resolveOriginValue(raw) {
  const s = String(raw ?? "").trim().toLowerCase();
  if (s === "natural" || s === "nat") return "natural";
  if (s === "lab" || s === "lab grown" || s === "lab-grown" || s === "labgrown") return "lab";
  return null;
}

export function normalizeHeaderName(h) {
  return String(h ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

// Canonical field -> accepted header spellings (normalized: lowercase, single-spaced).
const HEADER_ALIASES = {
  origin:        ["origin"],
  shape:         ["shape"],
  quality:       ["quality"],
  carat:         ["carat", "carat / stone", "carat/stone"],
  mm:            ["mm", "dimensions (mm)", "dimensions(mm)"],
  pricePerCarat: ["$/carat", "$ / carat", "price / carat (aud)", "price/carat (aud)", "price per carat"],
  pricePerStone: ["$/stone", "$ / stone", "price / stone (aud)", "price/stone (aud)", "price per stone"],
};

// Human-readable label for each field, used in per-row error messages.
const FIELD_LABEL = {
  origin: "Origin", shape: "Shape", quality: "Quality", carat: "Carat", mm: "mm",
  price: "$/carat or $/stone",
};

/**
 * Resolve a header row to canonical-field -> column-index. `originRequired`
 * is false when the caller already knows origin (e.g. one xltx sheet = one
 * origin) rather than reading it from a column.
 * Returns { indices, missing } — `missing` lists required fields not found,
 * as human-readable column names (e.g. "mm", "Origin").
 */
export function resolveColumns(headerRow, { originRequired = true } = {}) {
  const normalized = headerRow.map(normalizeHeaderName);
  const indices = {};
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    const idx = normalized.findIndex((h) => aliases.includes(h));
    if (idx >= 0) indices[field] = idx;
  }
  const requiredFields = ["shape", "quality", "carat", "mm"];
  if (originRequired) requiredFields.push("origin");
  const missing = requiredFields.filter((f) => indices[f] === undefined).map((f) => FIELD_LABEL[f]);
  if (indices.pricePerStone === undefined && indices.pricePerCarat === undefined) {
    missing.push(`${FIELD_LABEL.price} (need at least one)`);
  }
  return { indices, missing };
}

const MAX_ROW_ISSUES = 200; // generous cap so a bad file's real errors are visible, not just a count

/**
 * Normalize a set of data rows (array-of-arrays, header row NOT included)
 * into the melee-import/confirm payload: { groups: [{origin, rows}], quality_map }.
 *
 * @param headerRow  array of header cell strings
 * @param dataRows   array of row arrays (same column order as headerRow)
 * @param opts.forcedOrigin  "natural" | "lab" — when the source has no Origin
 *   column because origin is implied externally (e.g. one xltx sheet). When
 *   given, an Origin column is neither required nor read.
 * @param opts.rowNumberOffset  1-based row number of dataRows[0] in the
 *   original file, for error messages (e.g. 2 when row 1 is the header).
 */
export function buildMeleeImportPayload(headerRow, dataRows, opts = {}) {
  const { forcedOrigin = null, rowNumberOffset = 2 } = opts;
  const { indices, missing } = resolveColumns(headerRow, { originRequired: !forcedOrigin });
  if (missing.length > 0) {
    return {
      ok: false,
      error: `Missing required column(s): ${missing.join(", ")}. No rows were parsed — fix the header row and re-upload.`,
      missing,
    };
  }

  const get = (row, field) => (indices[field] !== undefined ? row[indices[field]] : undefined);

  let totalDataRows = 0;
  let skippedIncomplete = 0;
  let unrecognizedOrigin = 0;
  const unrecognizedOriginValues = new Set();
  const rowIssues = []; // {row, fields: string[], reason} — every issue, up to MAX_ROW_ISSUES
  let rowIssuesTruncated = false;
  const byOrigin = { natural: new Map(), lab: new Map() };
  // NOTE: this format gives Quality pre-combined with no separate colour/
  // clarity — pricing_melee_quality_map (keyed on colour_group + clarity) can
  // NOT be safely populated from it (splitting "Fancy Yellow SI1-SI2+" back
  // into parts would be a guess, which this project's convention forbids).
  // So this module does NOT produce a quality_map — only a diagnostic count
  // of distinct quality strings, surfaced in stats for the preview UI. See
  // the confirm route for the open design question this raises.
  const distinctQualities = new Set();

  const addIssue = (rowNum, fields, reason) => {
    if (rowIssues.length < MAX_ROW_ISSUES) rowIssues.push({ row: rowNum, fields, reason });
    else rowIssuesTruncated = true;
  };

  dataRows.forEach((row, i) => {
    const rowNum = i + rowNumberOffset;
    if (!row || row.every((c) => String(c ?? "").trim() === "")) return; // blank line — not counted
    totalDataRows++;

    let origin = forcedOrigin;
    if (!origin) {
      const originRaw = get(row, "origin");
      origin = resolveOriginValue(originRaw);
      if (!origin) {
        unrecognizedOrigin++;
        const val = String(originRaw ?? "").trim() || "(blank)";
        unrecognizedOriginValues.add(val);
        addIssue(rowNum, ["Origin"], `Unrecognized Origin value: "${val}"`);
        return;
      }
    }

    const shape = String(get(row, "shape") ?? "").trim().toLowerCase();
    const quality = String(get(row, "quality") ?? "").trim();
    const caratRaw = get(row, "carat");
    const caratNum = Number(caratRaw);
    const mm = normalizeMm(get(row, "mm"));
    const ppcRaw = indices.pricePerCarat !== undefined ? Number(get(row, "pricePerCarat")) : NaN;
    const ppsRaw = indices.pricePerStone !== undefined ? Number(get(row, "pricePerStone")) : NaN;

    // Field-specific validation — report exactly which field(s) are the
    // problem for this row, not a generic combined message.
    const badFields = [];
    if (!shape) badFields.push("Shape");
    if (!quality) badFields.push("Quality");
    if (String(caratRaw ?? "").trim() === "" || !Number.isFinite(caratNum) || caratNum <= 0) badFields.push("Carat");
    if (!mm) badFields.push("mm");
    if (!Number.isFinite(ppcRaw) && !Number.isFinite(ppsRaw)) badFields.push("$/carat or $/stone");

    if (badFields.length > 0) {
      skippedIncomplete++;
      addIssue(rowNum, badFields, `Missing/invalid: ${badFields.join(", ")}`);
      return;
    }

    const key = [shape, caratNum, mm, quality].join("||");
    const map = byOrigin[origin];
    if (!map.has(key)) {
      map.set(key, {
        row: {
          shape, size_type: "carat_range", size_label: `${caratNum}ct`,
          size_from: caratNum, size_to: caratNum, mm, quality,
          price_per_carat: Number.isFinite(ppcRaw) ? ppcRaw : null,
          price_per_stone: Number.isFinite(ppsRaw) ? ppsRaw : null,
          flagged: false,
        },
        prices: new Set([Number.isFinite(ppsRaw) ? ppsRaw : ppcRaw]),
      });
    } else {
      map.get(key).prices.add(Number.isFinite(ppsRaw) ? ppsRaw : ppcRaw);
    }

    distinctQualities.add(quality);
  });

  const groups = [];
  const conflicts = [];
  for (const origin of ["natural", "lab"]) {
    const map = byOrigin[origin];
    const rows = [];
    for (const [key, v] of map) {
      if (v.prices.size > 1) conflicts.push({ origin, key, prices: Array.from(v.prices).sort((a, b) => a - b) });
      rows.push(v.row);
    }
    if (rows.length > 0) groups.push({ origin, rows });
  }

  return {
    ok: true,
    // No quality_map — see the NOTE above and lib/melee-pricing.ts for the
    // open design question about how (or whether) the quality-map continues
    // to be populated now that Quality arrives pre-combined.
    payload: { groups },
    stats: {
      totalDataRows,
      skippedIncomplete,
      unrecognizedOrigin,
      unrecognizedOriginValues: Array.from(unrecognizedOriginValues),
      rowsToStore: groups.reduce((s, g) => s + g.rows.length, 0),
      distinctQualities: distinctQualities.size,
      conflicts,
    },
    rowIssues,
    rowIssuesTruncated,
  };
}

/**
 * Minimal RFC4180-ish CSV line splitter: handles quoted fields, embedded
 * commas/quotes ("" escaping), and \r\n or \n line endings. Returns an array
 * of row arrays (including the header as row 0) — no dependency needed for a
 * file this simple, but still defensive against quoted values.
 */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  const pushField = () => { row.push(field); field = ""; };
  const pushRow = () => { pushField(); rows.push(row); row = []; };

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') { inQuotes = true; continue; }
    if (c === ",") { pushField(); continue; }
    if (c === "\r") continue;
    if (c === "\n") { pushRow(); continue; }
    field += c;
  }
  // Final field/row if the file doesn't end with a newline.
  if (field.length > 0 || row.length > 0) pushRow();
  return rows.filter((r) => !(r.length === 1 && r[0] === ""));
}

/**
 * Serialize the current pricing_melee_stones rows back into the standard
 * import CSV format (Origin, Shape, Quality, Carat, mm, $/carat, $/stone) —
 * used by the Settings → Melee "Export CSV" feature. Deliberately the exact
 * inverse column set of buildMeleeImportPayload's input, so an exported file
 * can be re-imported unchanged.
 */
export function rowsToCsv(rows) {
  const header = ["Origin", "Shape", "Quality", "Carat", "mm", "$/carat", "$/stone"];
  const escape = (v) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push([
      r.origin ?? "", r.shape ?? "", r.quality ?? "",
      r.size_from ?? "", r.mm ?? "",
      r.price_per_carat ?? "", r.price_per_stone ?? "",
    ].map(escape).join(","));
  }
  return lines.join("\r\n") + "\r\n";
}

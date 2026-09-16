/**
 * melee-import-shared.mjs — the ONE normalization pipeline for Prana melee
 * price-list imports, shared by:
 *   • scripts/import-prana-melee.mjs        (local .xltx, two sheets = origin)
 *   • app/api/pricing/melee-import/parse    (uploaded combined CSV, Origin column)
 *
 * Plain JS (no TS syntax) so it runs unmodified under plain `node` AND is
 * importable from the Next.js app (tsconfig has allowJs: true). Do not
 * duplicate this logic anywhere else — both callers must produce identical
 * output for identical input.
 *
 * Rules (confirmed with Josh):
 *   • Price mode: keep "Parcels" only; drop "Precised" (and anything else).
 *   • quality = "<Colour> <Clarity>" (space-separated, verbatim).
 *   • Keep EVERY (shape, carat, mm, quality) variant distinct — no dedup
 *     across mm. mm is text (round: "0.90"; fancy shapes: "2.50 x 2.50").
 *   • Store the real price_per_stone AND price_per_carat.
 *   • Category / Listing ID are accepted but not stored (not needed for
 *     pricing — colour/clarity/quality already disambiguate).
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
  priceMode:     ["price mode"],
  shape:         ["shape"],
  carat:         ["carat / stone", "carat/stone", "carat"],
  colour:        ["colour", "color"],
  clarity:       ["clarity"],
  mm:            ["dimensions (mm)", "dimensions(mm)", "mm"],
  pricePerStone: ["price / stone (aud)", "price/stone (aud)", "price per stone (aud)", "price per stone", "price / stone"],
  pricePerCarat: ["price / carat (aud)", "price/carat (aud)", "price per carat (aud)", "price per carat", "price / carat"],
};

/**
 * Resolve a header row to canonical-field -> column-index. `originRequired`
 * is false when the caller already knows origin (e.g. one xltx sheet = one
 * origin) rather than reading it from a column.
 * Returns { indices, missing } — `missing` lists required fields not found.
 */
export function resolveColumns(headerRow, { originRequired = true } = {}) {
  const normalized = headerRow.map(normalizeHeaderName);
  const indices = {};
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    const idx = normalized.findIndex((h) => aliases.includes(h));
    if (idx >= 0) indices[field] = idx;
  }
  const required = ["priceMode", "shape", "carat", "colour", "clarity", "mm"];
  if (originRequired) required.push("origin");
  const missing = required.filter((f) => indices[f] === undefined);
  if (indices.pricePerStone === undefined && indices.pricePerCarat === undefined) {
    missing.push("price_per_stone_or_price_per_carat");
  }
  return { indices, missing };
}

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
    return { ok: false, error: `Missing required column(s): ${missing.join(", ")}`, missing };
  }

  const get = (row, field) => (indices[field] !== undefined ? row[indices[field]] : undefined);

  let totalDataRows = 0;
  let parcelsRows = 0;
  let skippedIncomplete = 0;
  let unrecognizedOrigin = 0;
  const unrecognizedOriginValues = new Set();
  const skippedSamples = []; // capped list of {row, reason} for the dry-run UI
  const byOrigin = { natural: new Map(), lab: new Map() };
  const qualityMap = new Map(); // "colour||clarity" -> {colour_group, clarity, quality}

  dataRows.forEach((row, i) => {
    const rowNum = i + rowNumberOffset;
    if (!row || row.every((c) => String(c ?? "").trim() === "")) return; // blank line — not counted
    totalDataRows++;

    const mode = String(get(row, "priceMode") ?? "").trim().toLowerCase();
    if (mode !== "parcels") return; // drop Precised (and anything else) — reflected in droppedNonParcels

    let origin = forcedOrigin;
    if (!origin) {
      const originRaw = get(row, "origin");
      origin = resolveOriginValue(originRaw);
      if (!origin) {
        unrecognizedOrigin++;
        const val = String(originRaw ?? "").trim() || "(blank)";
        unrecognizedOriginValues.add(val);
        if (skippedSamples.length < 20) skippedSamples.push({ row: rowNum, reason: `Unrecognized Origin value: "${val}"` });
        return;
      }
    }
    parcelsRows++;

    const shape = String(get(row, "shape") ?? "").trim().toLowerCase();
    const caratNum = Number(get(row, "carat"));
    const colour = String(get(row, "colour") ?? "").trim();
    const clarity = String(get(row, "clarity") ?? "").trim();
    const mm = normalizeMm(get(row, "mm"));
    const ppcRaw = indices.pricePerCarat !== undefined ? Number(get(row, "pricePerCarat")) : NaN;
    const ppsRaw = indices.pricePerStone !== undefined ? Number(get(row, "pricePerStone")) : NaN;

    if (
      !shape || !colour || !clarity || !mm ||
      !Number.isFinite(caratNum) || caratNum <= 0 ||
      (!Number.isFinite(ppcRaw) && !Number.isFinite(ppsRaw))
    ) {
      skippedIncomplete++;
      if (skippedSamples.length < 20) {
        skippedSamples.push({ row: rowNum, reason: "Missing/invalid shape, carat, colour, clarity, mm, or price" });
      }
      return;
    }

    const quality = `${colour} ${clarity}`;
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

    const ck = `${colour.toLowerCase()}||${clarity.toLowerCase()}`;
    if (!qualityMap.has(ck)) qualityMap.set(ck, { colour_group: colour, clarity, quality });
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
    payload: { groups, quality_map: Array.from(qualityMap.values()) },
    stats: {
      totalDataRows,
      parcelsRows,
      droppedNonParcels: totalDataRows - parcelsRows - unrecognizedOrigin,
      skippedIncomplete,
      unrecognizedOrigin,
      unrecognizedOriginValues: Array.from(unrecognizedOriginValues),
      rowsToStore: groups.reduce((s, g) => s + g.rows.length, 0),
      qualityMapCombos: qualityMap.size,
      conflicts,
    },
    skippedSamples,
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

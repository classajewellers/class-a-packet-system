#!/usr/bin/env node
/**
 * import-prana-melee.mjs — structured (non-AI) importer for the Prana Diamonds
 * melee price list (.xltx/.xlsx). ~7,600 rows blow past the AI extractor's
 * one-shot token cap, so this parses the workbook directly and emits the payload
 * POST /api/pricing/melee-import/confirm consumes.
 *
 * Model (confirmed with Josh):
 *   • NO supplier concept — pricing is a pure spec fetch.
 *   • mm is price-determining — keep EVERY (shape, carat, mm, colour, clarity)
 *     variant distinct. No dedup/collapse across mm.
 *   • Sheets: "Natural" → origin 'natural'; "Lab grown" → origin 'lab'.
 *   • Price mode: keep "Parcels" only; drop "Precised".
 *   • quality = "<Colour> <Clarity>" (space-separated, verbatim).
 *   • Store real price_per_stone AND price_per_carat + mm. size_label "<carat>ct".
 *   • Category / Dimensions-as-text / Listing ID are not stored.
 *
 * Emits ONE combined payload the confirm endpoint accepts:
 *   { groups: [{ origin, rows: [...] }], quality_map: [{ colour_group, clarity, quality }] }
 * The confirm endpoint does a TENANT-WIDE overwrite (replaces the whole melee
 * list + quality map). DRY-RUN by default: prints counts + samples, writes the
 * payload JSON, and NEVER touches the DB or network.
 *
 * Usage:
 *   node scripts/import-prana-melee.mjs <file.xltx> [--out <dir>]
 */
import { createRequire } from "module";
import fs from "fs";
import path from "path";
const require = createRequire(import.meta.url);
const XLSX = require("xlsx");

const args = process.argv.slice(2);
const filePath = args.find((a) => !a.startsWith("--"));
const outDir = (() => { const i = args.indexOf("--out"); return i >= 0 ? args[i + 1] : "."; })();
if (!filePath) { console.error("Usage: node scripts/import-prana-melee.mjs <file.xltx> [--out <dir>]"); process.exit(1); }

const SHEET_ORIGIN = { "Natural": "natural", "Lab grown": "lab" };

function findHeaderRow(rows) {
  for (let i = 0; i < Math.min(30, rows.length); i++) {
    const r = rows[i].map((c) => String(c).trim().toLowerCase());
    if (r[0] === "category" && r.includes("shape") && r.some((c) => c.startsWith("price / carat"))) return i;
  }
  return -1;
}
const colIndex = (header, name) => header.findIndex((c) => String(c).trim().toLowerCase() === name.trim().toLowerCase());
// Must match lib/melee-pricing.ts normalizeMm exactly (import + lookup agree).
const normalizeMm = (mm) => String(mm ?? "").trim().replace(/\s*[xX]\s*/g, " x ").replace(/\s+/g, " ");

const wb = XLSX.readFile(filePath);
const perSheet = [];
const groups = [];
const qualityMap = new Map(); // colour||clarity -> {colour_group, clarity, quality}

for (const [sheetName, origin] of Object.entries(SHEET_ORIGIN)) {
  if (!wb.SheetNames.includes(sheetName)) { console.error(`!! sheet "${sheetName}" not found`); continue; }
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: "" });
  const hIdx = findHeaderRow(rows);
  if (hIdx < 0) { console.error(`!! header row not found in "${sheetName}"`); continue; }
  const header = rows[hIdx];
  const ci = {
    mode: colIndex(header, "Price mode"), shape: colIndex(header, "Shape"),
    carat: colIndex(header, "Carat / stone"), colour: colIndex(header, "Colour"),
    clarity: colIndex(header, "Clarity"), mm: colIndex(header, "Dimensions (mm)"),
    pps: colIndex(header, "Price / stone (AUD)"), ppc: colIndex(header, "Price / carat (AUD)"),
  };

  let raw = 0, parcels = 0, skippedIncomplete = 0;
  const byKey = new Map(); // full key incl mm -> {row, prices:Set}
  const conflicts = [];
  for (let i = hIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.every((c) => String(c).trim() === "")) continue;
    raw++;
    if (String(r[ci.mode] ?? "").trim().toLowerCase() !== "parcels") continue; // Parcels only
    parcels++;

    const shape = String(r[ci.shape] ?? "").trim().toLowerCase();
    const caratNum = Number(r[ci.carat]);
    const colour = String(r[ci.colour] ?? "").trim();
    const clarity = String(r[ci.clarity] ?? "").trim();
    const mm = normalizeMm(r[ci.mm]); // text: "0.90" or "2.50 x 2.50"
    const ppc = Number(r[ci.ppc]);
    const pps = Number(r[ci.pps]);
    if (!shape || !colour || !clarity || !Number.isFinite(caratNum) || caratNum <= 0 ||
        !mm || (!Number.isFinite(ppc) && !Number.isFinite(pps))) {
      skippedIncomplete++; continue;
    }
    const quality = `${colour} ${clarity}`;
    const key = [origin, shape, caratNum, mm, quality].join("||"); // full key — mm INCLUDED

    if (!byKey.has(key)) {
      byKey.set(key, {
        row: {
          shape, size_type: "carat_range", size_label: `${caratNum}ct`,
          size_from: caratNum, size_to: caratNum, mm, quality,
          price_per_carat: Number.isFinite(ppc) ? ppc : null,
          price_per_stone: Number.isFinite(pps) ? pps : null,
          flagged: false,
        },
        prices: new Set([Number.isFinite(pps) ? pps : ppc]),
      });
    } else {
      byKey.get(key).prices.add(Number.isFinite(pps) ? pps : ppc);
    }

    const ck = `${colour.toLowerCase()}||${clarity.toLowerCase()}`;
    if (!qualityMap.has(ck)) qualityMap.set(ck, { colour_group: colour, clarity, quality });
  }

  const outRows = [];
  for (const [key, v] of byKey) {
    if (v.prices.size > 1) conflicts.push({ key, prices: Array.from(v.prices).sort((a, b) => a - b) });
    outRows.push(v.row);
  }
  perSheet.push({ sheetName, origin, raw, parcels, skippedIncomplete, rows: outRows.length, conflicts });
  groups.push({ origin, rows: outRows });
}

// ── Report ────────────────────────────────────────────────────────────────────
console.log("========== PRANA MELEE IMPORT — DRY RUN (mm-precise, no supplier) ==========");
console.log("file:", filePath, "\n");
let totalParcels = 0, totalRows = 0, totalConflicts = 0;
for (const s of perSheet) {
  totalParcels += s.parcels; totalRows += s.rows; totalConflicts += s.conflicts.length;
  console.log(`sheet "${s.sheetName}" (origin=${s.origin}):`);
  console.log(`   raw data rows:        ${s.raw}`);
  console.log(`   Parcels-only rows:    ${s.parcels}   (dropped non-Parcels: ${s.raw - s.parcels})`);
  console.log(`   skipped (incomplete): ${s.skippedIncomplete}`);
  console.log(`   rows to store:        ${s.rows}   (each carat+mm variant kept distinct)`);
  console.log(`   exact-dup conflicts:  ${s.conflicts.length}${s.conflicts.length ? "  ⚠️ same shape+carat+mm+quality, different price" : ""}`);
  for (const c of s.conflicts.slice(0, 8)) console.log(`       ⚠️ ${c.key}  prices=${c.prices.join(", ")}`);
  console.log("");
}
console.log(`TOTALS: Parcels-only=${totalParcels}  rows-to-store=${totalRows}  quality-map combos=${qualityMap.size}  conflicts=${totalConflicts}\n`);

for (const g of groups) {
  console.log(`--- sample stored rows (${g.origin}) ---`);
  for (const r of g.rows.slice(0, 3)) console.log("   ", JSON.stringify(r));
}
console.log("\n--- quality-map entries (preview) ---");
console.log("   " + Array.from(qualityMap.values()).slice(0, 10).map(m => `(${m.colour_group},${m.clarity})→"${m.quality}"`).join("  "));

// Combined payload for the confirm endpoint.
fs.mkdirSync(outDir, { recursive: true });
const payload = { groups, quality_map: Array.from(qualityMap.values()) };
const outFile = path.join(outDir, "prana-import-payload.json");
fs.writeFileSync(outFile, JSON.stringify(payload, null, 2));
console.log(`\nwrote ${outFile}  (groups + quality_map — feed to POST /api/pricing/melee-import/confirm)`);
console.log("\nDRY RUN ONLY — nothing written to the database.");

#!/usr/bin/env node
/**
 * import-prana-melee.mjs — local dry-run/inspection tool for a Prana Diamonds
 * melee price list .xltx/.xlsx (two sheets: "Natural" / "Lab grown").
 *
 * Delegates ALL normalization to lib/melee-import-shared.mjs — the SAME module
 * the Settings → Melee "Import CSV" upload feature uses (app/api/pricing/
 * melee-import/parse). This script exists for local inspection of the two-
 * sheet Excel format; the combined-CSV upload in the app is the normal monthly
 * workflow now. Both must produce identical output for identical logical data
 * — do not duplicate the normalization logic here.
 *
 * DRY-RUN ONLY: prints counts + samples, writes the payload JSON, and NEVER
 * touches the database or network.
 *
 * Usage:
 *   node scripts/import-prana-melee.mjs <file.xltx> [--out <dir>]
 */
import { createRequire } from "module";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { buildMeleeImportPayload } from "../lib/melee-import-shared.mjs";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx");
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
const filePath = args.find((a) => !a.startsWith("--"));
const outDir = (() => { const i = args.indexOf("--out"); return i >= 0 ? args[i + 1] : "."; })();
if (!filePath) { console.error("Usage: node scripts/import-prana-melee.mjs <file.xltx> [--out <dir>]"); process.exit(1); }
void __dirname;

const SHEET_ORIGIN = { "Natural": "natural", "Lab grown": "lab" };

function findHeaderRow(rows) {
  for (let i = 0; i < Math.min(30, rows.length); i++) {
    const r = rows[i].map((c) => String(c).trim().toLowerCase());
    if (r[0] === "category" && r.includes("shape") && r.some((c) => c.startsWith("price / carat"))) return i;
  }
  return -1;
}

const wb = XLSX.readFile(filePath);
const perSheet = [];
const groups = [];
const qualityMap = new Map();

for (const [sheetName, origin] of Object.entries(SHEET_ORIGIN)) {
  if (!wb.SheetNames.includes(sheetName)) { console.error(`!! sheet "${sheetName}" not found`); continue; }
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: "" });
  const hIdx = findHeaderRow(rows);
  if (hIdx < 0) { console.error(`!! header row not found in "${sheetName}"`); continue; }

  const header = rows[hIdx];
  const dataRows = rows.slice(hIdx + 1);
  // No Origin column on this sheet — origin is implied by which sheet this is.
  const result = buildMeleeImportPayload(header, dataRows, { forcedOrigin: origin, rowNumberOffset: hIdx + 2 });
  if (!result.ok) { console.error(`!! ${sheetName}: ${result.error}`); continue; }

  perSheet.push({ sheetName, origin, ...result.stats });
  const g = result.payload.groups.find((x) => x.origin === origin);
  if (g) groups.push(g);
  for (const m of result.payload.quality_map) {
    const ck = `${m.colour_group.toLowerCase()}||${m.clarity.toLowerCase()}`;
    if (!qualityMap.has(ck)) qualityMap.set(ck, m);
  }
}

// ── Report ────────────────────────────────────────────────────────────────────
console.log("========== PRANA MELEE IMPORT — DRY RUN (mm-precise, no supplier) ==========");
console.log("file:", filePath, "\n");
let totalToStore = 0, totalConflicts = 0;
for (const s of perSheet) {
  totalToStore += s.rowsToStore; totalConflicts += s.conflicts.length;
  console.log(`sheet "${s.sheetName}" (origin=${s.origin}):`);
  console.log(`   data rows:            ${s.totalDataRows}`);
  console.log(`   Parcels-only rows:    ${s.parcelsRows}   (dropped non-Parcels: ${s.droppedNonParcels})`);
  console.log(`   skipped (incomplete): ${s.skippedIncomplete}`);
  console.log(`   rows to store:        ${s.rowsToStore}   (each carat+mm variant kept distinct)`);
  console.log(`   exact-dup conflicts:  ${s.conflicts.length}${s.conflicts.length ? "  ⚠️ same shape+carat+mm+quality, different price" : ""}`);
  for (const c of s.conflicts.slice(0, 8)) console.log(`       ⚠️ ${c.key}  prices=${c.prices.join(", ")}`);
  console.log("");
}
console.log(`TOTALS: rows-to-store=${totalToStore}  quality-map combos=${qualityMap.size}  conflicts=${totalConflicts}\n`);

for (const g of groups) {
  console.log(`--- sample stored rows (${g.origin}) ---`);
  for (const r of g.rows.slice(0, 3)) console.log("   ", JSON.stringify(r));
}
console.log("\n--- quality-map entries (preview) ---");
console.log("   " + Array.from(qualityMap.values()).slice(0, 10).map((m) => `(${m.colour_group},${m.clarity})→"${m.quality}"`).join("  "));

fs.mkdirSync(outDir, { recursive: true });
const payload = { groups, quality_map: Array.from(qualityMap.values()) };
const outFile = path.join(outDir, "prana-import-payload.json");
fs.writeFileSync(outFile, JSON.stringify(payload, null, 2));
console.log(`\nwrote ${outFile}  (groups + quality_map — feed to POST /api/pricing/melee-import/confirm)`);
console.log("\nDRY RUN ONLY — nothing written to the database.");

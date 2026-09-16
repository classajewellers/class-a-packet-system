#!/usr/bin/env node
/**
 * import-prana-melee.mjs — local dry-run/inspection tool for a melee price
 * list in the CURRENT STANDARD FORMAT: Origin, Shape, Quality, Carat, mm,
 * $/carat, $/stone (one combined sheet/file — no more two-sheet split, no
 * more separate Colour/Clarity columns).
 *
 * Delegates ALL normalization to lib/melee-import-shared.mjs — the SAME
 * module the Settings → Melee "Import CSV" upload feature uses (app/api/
 * pricing/melee-import/parse). This script exists for local inspection
 * before uploading; the browser upload is the normal monthly workflow now.
 * Both must produce identical output for identical data — do not duplicate
 * the normalization logic here.
 *
 * Accepts .csv directly, or .xlsx/.xltx (reads the first sheet).
 * DRY-RUN ONLY: prints counts + samples + row issues, writes the payload
 * JSON, and NEVER touches the database or network.
 *
 * Usage:
 *   node scripts/import-prana-melee.mjs <file.csv|.xlsx|.xltx> [--out <dir>]
 */
import fs from "fs";
import path from "path";
import { createRequire } from "module";
import { parseCsv, buildMeleeImportPayload } from "../lib/melee-import-shared.mjs";

const require = createRequire(import.meta.url);

const args = process.argv.slice(2);
const filePath = args.find((a) => !a.startsWith("--"));
const outDir = (() => { const i = args.indexOf("--out"); return i >= 0 ? args[i + 1] : "."; })();
if (!filePath) {
  console.error("Usage: node scripts/import-prana-melee.mjs <file.csv|.xlsx|.xltx> [--out <dir>]");
  process.exit(1);
}

function loadRows(fp) {
  if (/\.csv$/i.test(fp)) {
    return parseCsv(fs.readFileSync(fp, "utf8"));
  }
  const XLSX = require("xlsx");
  const wb = XLSX.readFile(fp);
  const sheetName = wb.SheetNames[0];
  return XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: "" });
}

function findHeaderRow(rows) {
  for (let i = 0; i < Math.min(10, rows.length); i++) {
    const r = rows[i].map((c) => String(c).trim().toLowerCase());
    if (r.includes("origin") && r.includes("shape") && r.includes("quality")) return i;
  }
  return 0; // assume row 0 is the header if no match (small/simple files)
}

const allRows = loadRows(filePath);
const hIdx = findHeaderRow(allRows);
const header = allRows[hIdx];
const dataRows = allRows.slice(hIdx + 1);

const result = buildMeleeImportPayload(header, dataRows, { rowNumberOffset: hIdx + 2 });
if (!result.ok) {
  console.error("PARSE FAILED:", result.error);
  process.exit(1);
}

// ── Report ────────────────────────────────────────────────────────────────────
console.log("========== MELEE IMPORT — DRY RUN ==========");
console.log("file:", filePath);
console.log("header:", JSON.stringify(header), "\n");
console.log(JSON.stringify(result.stats, null, 2));

for (const c of result.stats.conflicts.slice(0, 8)) {
  console.log(`   ⚠️ ${c.origin} ${c.key}  prices=${c.prices.join(", ")}`);
}

console.log("\n--- sample stored rows ---");
for (const g of result.payload.groups) {
  console.log(`  ${g.origin}: ${g.rows.length} rows`);
  for (const r of g.rows.slice(0, 3)) console.log("   ", JSON.stringify(r));
}

if (result.rowIssues.length > 0) {
  console.log(`\n--- row issues (${result.rowIssues.length}${result.rowIssuesTruncated ? "+, truncated" : ""}) ---`);
  for (const issue of result.rowIssues.slice(0, 20)) {
    console.log(`   row ${issue.row}: ${issue.reason}`);
  }
}

fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, "melee-import-payload.json");
fs.writeFileSync(outFile, JSON.stringify(result.payload, null, 2));
console.log(`\nwrote ${outFile}  (groups + quality_map — feed to POST /api/pricing/melee-import/confirm)`);
console.log("\nDRY RUN ONLY — nothing written to the database.");

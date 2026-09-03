"use client";

import { useRef, useState } from "react";
import * as XLSX from "xlsx";
import Link from "next/link";
import { useUser } from "@/context/UserContext";
import { canManage } from "@/lib/userTypes";
import { color, radius, shadow } from "@/lib/theme";
import StatusBadge from "@/components/StatusBadge";

// ── Template columns (must match the Vault Stocktake Import Template exactly) ──

const REQUIRED_HEADERS = [
  "Design Name",
  "Category",
  "Collection",
  "Metal Karat",
  "Metal Colour",
  "Band Width (mm)",
  "Actual Weight (g)",
  "Stone Type",
  "Stone Carat",
  "Stone Shape",
  "Stone Colour",
  "Stone Clarity",
  "Certificate Number",
  "Stone Wholesale Cost",
  "Actual Cost Paid",
  "Retail Price",
  "Finger Size",
  "Status",
  "Location",
  "Old ARMS Stock #",
  "Notes",
] as const;

const VALID_KARATS  = new Set(["9k", "18k", "platinum", "silver"]);
const VALID_COLOURS = new Set(["yellow", "white", "rose", "n/a"]);

// ── Types ──────────────────────────────────────────────────────────────────────

interface Design   { id: string; name: string; category: string | null; collection: string | null; }
interface RefItem  { id: string; name: string; }

interface ImportSummary {
  created:          number;
  skipped:          number;
  newDesigns:       string[];
  newDesignsCount:  number;
  newVariantsCount: number;
  createdPieces:    { rowIndex: number; sku: string; pieceId: string }[];
  skippedDetails:   { rowIndex: number; reason: string }[];
}

interface ReviewRow {
  rowIndex:        number;        // 1-based, excludes header
  raw:             Record<string, string>;
  // Key fields extracted for display
  designName:      string;
  metalKarat:      string;
  metalColour:     string;
  status:          string;
  location:        string;
  retailPrice:     string;
  // Design match
  matchType:       "existing" | "new" | "ambiguous";
  matchedDesign:   Design | null;
  ambiguousHits:   Design[];
  // Validation
  errors:          string[];
  // Reviewer toggle
  included:        boolean;
}

// ── xlsx parse ─────────────────────────────────────────────────────────────────

function parseXlsx(file: File): Promise<Record<string, string>[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data  = new Uint8Array(e.target!.result as ArrayBuffer);
        const wb    = XLSX.read(data, { type: "array" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        resolve(XLSX.utils.sheet_to_json<Record<string, string>>(sheet, { defval: "" }));
      } catch (err) { reject(err); }
    };
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsArrayBuffer(file);
  });
}

// ── Design matching ────────────────────────────────────────────────────────────

function matchDesign(name: string, designs: Design[]) {
  const needle = name.trim().toLowerCase();
  if (!needle) return { matchType: "new" as const, matchedDesign: null, ambiguousHits: [] };

  const exact = designs.find(d => d.name.toLowerCase() === needle);
  if (exact) return { matchType: "existing" as const, matchedDesign: exact, ambiguousHits: [] };

  const ambiguous = designs.filter(d => {
    const hay = d.name.toLowerCase();
    return hay.includes(needle) || needle.includes(hay);
  });
  if (ambiguous.length > 0) {
    return { matchType: "ambiguous" as const, matchedDesign: null, ambiguousHits: ambiguous };
  }

  return { matchType: "new" as const, matchedDesign: null, ambiguousHits: [] };
}

// ── Per-row validation ─────────────────────────────────────────────────────────

function validateRow(
  raw:       Record<string, string>,
  statuses:  RefItem[],
  locations: RefItem[],
): string[] {
  const errors: string[] = [];

  if (!raw["Design Name"]?.trim())
    errors.push("Design Name is required");

  const karat = raw["Metal Karat"]?.trim();
  if (!karat)
    errors.push("Metal Karat is required");
  else if (!VALID_KARATS.has(karat.toLowerCase()))
    errors.push(`Metal Karat "${karat}" not recognised — expected: 9K, 18K, Platinum, Silver`);

  const colour = raw["Metal Colour"]?.trim();
  if (!colour)
    errors.push("Metal Colour is required");
  else if (!VALID_COLOURS.has(colour.toLowerCase()))
    errors.push(`Metal Colour "${colour}" not recognised — expected: Yellow, White, Rose, N/A`);

  const status = raw["Status"]?.trim();
  if (status && !statuses.some(s => s.name.toLowerCase() === status.toLowerCase()))
    errors.push(`Status "${status}" is not in the system`);

  const location = raw["Location"]?.trim();
  if (location && !locations.some(l => l.name.toLowerCase() === location.toLowerCase()))
    errors.push(`Location "${location}" is not in the system`);

  const numericCols: [string, string][] = [
    ["Stone Carat",          "Stone Carat"],
    ["Actual Weight (g)",    "Actual Weight"],
    ["Stone Wholesale Cost", "Stone Wholesale Cost"],
    ["Actual Cost Paid",     "Actual Cost Paid"],
    ["Retail Price",         "Retail Price"],
  ];
  for (const [col, label] of numericCols) {
    const val = raw[col]?.trim();
    if (val && isNaN(Number(val)))
      errors.push(`${label} must be a number (got "${val}")`);
  }

  return errors;
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const TH: React.CSSProperties = {
  padding: "10px 12px",
  textAlign: "left",
  fontFamily: "var(--font-mono)",
  fontWeight: 500,
  color: color.textMuted,
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  whiteSpace: "nowrap",
  background: color.white,
  borderBottom: `1px solid ${color.line}`,
};

const TD: React.CSSProperties = {
  padding: "12px",
  verticalAlign: "top",
  fontSize: 13,
};

function btn(bg: string, fg: string): React.CSSProperties {
  return {
    padding: "8px 16px",
    background: bg,
    color: fg,
    border: `1px solid ${color.line}`,
    borderRadius: radius.pill,
    fontSize: 13,
    cursor: "pointer",
    fontWeight: 500,
  };
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function StocktakeImportPage() {
  const { user } = useUser();
  const [dragging,    setDragging]    = useState(false);
  const [busy,        setBusy]        = useState(false);
  const [busyMsg,     setBusyMsg]     = useState("");
  const [parseError,  setParseError]  = useState<string | null>(null);
  const [rows,        setRows]        = useState<ReviewRow[] | null>(null);
  const [importing,   setImporting]   = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [summary,     setSummary]     = useState<ImportSummary | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  if (!user || !canManage(user.role)) {
    return (
      <div style={{ padding: 40, color: color.text }}>
        <p>This page is managers only.</p>
        <Link href="/inventory" style={{ color: color.ink }}>← Back to Inventory</Link>
      </div>
    );
  }

  const headers = { "x-tenant-id": (user as any).tenant_id ?? "" };

  // ── File handling ──────────────────────────────────────────────────────────

  async function handleFile(file: File) {
    if (!/\.(xlsx|xls)$/i.test(file.name)) {
      setParseError("Please upload an Excel file (.xlsx or .xls)");
      return;
    }

    setBusy(true);
    setBusyMsg("Parsing file…");
    setParseError(null);
    setRows(null);

    try {
      const rawRows = await parseXlsx(file);

      if (rawRows.length === 0) {
        setParseError("The file appears to be empty or has no data rows.");
        return;
      }

      // Validate headers
      const fileHeaders  = Object.keys(rawRows[0]);
      const missing      = REQUIRED_HEADERS.filter(h => !fileHeaders.includes(h));
      if (missing.length > 0) {
        setParseError(
          `Missing ${missing.length} required column${missing.length > 1 ? "s" : ""}:\n` +
          missing.join(", ")
        );
        return;
      }

      // Drop entirely blank rows (can appear at bottom of Excel templates)
      const dataRows = rawRows.filter(r =>
        REQUIRED_HEADERS.some(h => r[h]?.toString().trim())
      );

      if (dataRows.length === 0) {
        setParseError("No data rows found — the file may contain only the header row.");
        return;
      }

      // Load reference data
      setBusyMsg("Loading design data…");
      const refRes = await fetch("/api/inventory/import/stocktake", { headers });
      if (!refRes.ok) throw new Error(`Failed to load reference data: ${refRes.status}`);
      const ref = await refRes.json();

      const designs:   Design[]  = ref.designs   ?? [];
      const statuses:  RefItem[] = ref.statuses   ?? [];
      const locations: RefItem[] = ref.locations  ?? [];

      // Build review rows
      const reviewRows: ReviewRow[] = dataRows.map((raw, idx) => {
        const errors = validateRow(raw, statuses, locations);
        const designName = raw["Design Name"]?.toString().trim() ?? "";
        const { matchType, matchedDesign, ambiguousHits } = matchDesign(designName, designs);

        // Exclude by default: any validation error OR ambiguous design match
        const included = errors.length === 0 && matchType !== "ambiguous";

        return {
          rowIndex:      idx + 1,
          raw:           Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, String(v)])),
          designName,
          metalKarat:    raw["Metal Karat"]?.toString().trim()    ?? "",
          metalColour:   raw["Metal Colour"]?.toString().trim()   ?? "",
          status:        raw["Status"]?.toString().trim()         ?? "",
          location:      raw["Location"]?.toString().trim()       ?? "",
          retailPrice:   raw["Retail Price"]?.toString().trim()   ?? "",
          matchType,
          matchedDesign,
          ambiguousHits,
          errors,
          included,
        };
      });

      setRows(reviewRows);
    } catch (err) {
      setParseError(`Error: ${String(err)}`);
    } finally {
      setBusy(false);
      setBusyMsg("");
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = "";
  }

  function toggleRow(idx: number) {
    setRows(prev => prev?.map((r, i) => i === idx ? { ...r, included: !r.included } : r) ?? null);
  }

  function setAllIncluded(val: boolean) {
    setRows(prev => prev?.map(r => ({ ...r, included: val })) ?? null);
  }

  async function runImport() {
    if (!rows) return;
    const includedRows = rows.filter(r => r.included);
    if (includedRows.length === 0) return;

    setImporting(true);
    setImportError(null);

    const payload = includedRows.map(r => ({ rowIndex: r.rowIndex, raw: r.raw }));

    try {
      const res = await fetch("/api/inventory/import/stocktake", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ rows: payload }),
      });
      const json = await res.json();
      if (!res.ok) {
        setImportError(json.error ?? `Import failed (${res.status})`);
      } else {
        setSummary(json.summary);
        setRows(null);
      }
    } catch (err) {
      setImportError(`Network error: ${String(err)}`);
    } finally {
      setImporting(false);
    }
  }

  // ── Summary counts ────────────────────────────────────────────────────────

  const total      = rows?.length          ?? 0;
  const included   = rows?.filter(r => r.included).length       ?? 0;
  const existing   = rows?.filter(r => r.matchType === "existing").length  ?? 0;
  const newDesigns = rows?.filter(r => r.matchType === "new").length       ?? 0;
  const ambiguous  = rows?.filter(r => r.matchType === "ambiguous").length ?? 0;
  const errors     = rows?.filter(r => r.errors.length > 0).length        ?? 0;
  const newDesignsIncluded = rows?.filter(r => r.included && r.matchType === "new").length ?? 0;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ padding: "24px 32px", maxWidth: 1500, margin: "0 auto" }}>
      {/* Breadcrumb */}
      <div style={{ fontSize: 13, color: color.textFaint, marginBottom: 6 }}>
        <Link href="/inventory" style={{ color: color.textFaint, textDecoration: "none" }}>Inventory</Link>
        {" › "}
        <Link href="/inventory/import" style={{ color: color.textFaint, textDecoration: "none" }}>Import</Link>
        {" › "}
        Stocktake
      </div>

      <div style={{ display: "flex", alignItems: "baseline", gap: 16, marginBottom: 24 }}>
        <h1 style={{ fontSize: 32, fontWeight: 700, letterSpacing: "-0.03em", color: color.ink, margin: 0 }}>
          Stocktake Import
        </h1>
        <span style={{
          fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 500, padding: "3px 10px",
          background: color.fill, color: color.ink, borderRadius: radius.pill,
        }}>STEP 1 — REVIEW</span>
      </div>

      {/* ── Import summary ──────────────────────────────────────────────── */}
      {summary && (
        <div style={{ maxWidth: 700 }}>
          {/* Success banner */}
          <div style={{
            padding: "20px 24px",
            background: color.white,
            border: `1px solid ${color.line}`,
            borderRadius: radius.lg,
            boxShadow: shadow.card,
            marginBottom: 24,
          }}>
            <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", color: color.ink }}>
              {summary.skipped === 0
                ? `✓ Import complete — ${summary.created} piece${summary.created !== 1 ? "s" : ""} created`
                : `Import finished with warnings — ${summary.created} created, ${summary.skipped} skipped`
              }
            </div>
            <div style={{ fontSize: 13, color: color.textMuted, marginTop: 6 }}>
              {summary.newDesignsCount > 0 && (
                <span>{summary.newDesignsCount} new design{summary.newDesignsCount !== 1 ? "s" : ""} created · </span>
              )}
              {summary.newVariantsCount > 0 && (
                <span>{summary.newVariantsCount} new variant{summary.newVariantsCount !== 1 ? "s" : ""} created · </span>
              )}
              <Link href="/inventory" style={{ color: color.ink, fontWeight: 600 }}>
                View in Inventory →
              </Link>
            </div>
          </div>

          {/* New designs created */}
          {summary.newDesigns.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: color.text, marginBottom: 8 }}>
                New designs created ({summary.newDesigns.length})
              </h3>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {summary.newDesigns.map(name => (
                  <span key={name} style={{
                    padding: "3px 10px", background: color.fill, color: color.ink,
                    borderRadius: radius.pill, fontSize: 12, fontWeight: 500,
                  }}>{name}</span>
                ))}
              </div>
            </div>
          )}

          {/* Skipped rows */}
          {summary.skippedDetails.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: color.danger, marginBottom: 8 }}>
                Skipped rows ({summary.skippedDetails.length})
              </h3>
              <div style={{ border: `1px solid ${color.line}`, borderRadius: radius.md, overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr>
                      <th style={{ ...TH, background: color.dangerBg }}>Row #</th>
                      <th style={{ ...TH, background: color.dangerBg }}>Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.skippedDetails.map(({ rowIndex, reason }) => (
                      <tr key={rowIndex} style={{ borderBottom: `1px solid ${color.line}` }}>
                        <td style={{ ...TD, color: color.danger, fontWeight: 600, whiteSpace: "nowrap" }}>
                          Row {rowIndex}
                        </td>
                        <td style={{ ...TD, color: color.danger }}>{reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Created pieces (collapsed, first 20) */}
          {summary.createdPieces.length > 0 && (
            <details style={{ marginBottom: 20 }}>
              <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 600, color: color.text, userSelect: "none" }}>
                Created pieces — {summary.createdPieces.length} total (expand to see SKUs)
              </summary>
              <div style={{ marginTop: 8, fontSize: 12, color: color.textMuted, lineHeight: 1.8 }}>
                {summary.createdPieces.map(p => (
                  <span key={p.sku} style={{ marginRight: 12 }}>
                    <Link href={`/inventory/${p.pieceId}`} style={{ color: color.ink }}>{p.sku}</Link>
                  </span>
                ))}
              </div>
            </details>
          )}

          {/* Actions */}
          <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
            <Link
              href="/inventory"
              style={{
                padding: "10px 20px",
                background: color.ink,
                color: color.white,
                borderRadius: radius.pill,
                fontWeight: 500,
                fontSize: 14,
                textDecoration: "none",
              }}
            >
              View Inventory
            </Link>
            <button
              onClick={() => { setSummary(null); setParseError(null); }}
              style={btn(color.white, color.ink)}
            >
              Import another file
            </button>
          </div>
        </div>
      )}

      {/* ── Upload zone ─────────────────────────────────────────────────── */}
      {!rows && !summary && (
        <div style={{ maxWidth: 640 }}>
          <p style={{ color: color.textMuted, fontSize: 14, marginBottom: 20, lineHeight: 1.6 }}>
            Upload a completed <strong>Vault Stocktake Import Template</strong> (.xlsx).
            Each row will be matched against existing designs before anything is created or committed.
          </p>

          <div
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => !busy && fileRef.current?.click()}
            style={{
              border: `2px dashed ${dragging ? color.ink : color.line}`,
              borderRadius: radius.lg,
              padding: "56px 40px",
              textAlign: "center",
              cursor: busy ? "default" : "pointer",
              background: dragging ? color.fill : color.paper,
              transition: "border-color 0.15s, background 0.15s",
            }}
          >
            <div style={{ fontSize: 48, marginBottom: 12 }}>📊</div>
            {busy ? (
              <p style={{ fontWeight: 600, color: color.text, margin: 0 }}>{busyMsg}</p>
            ) : (
              <>
                <p style={{ fontWeight: 600, color: color.text, margin: "0 0 4px" }}>
                  Drop .xlsx file here, or click to browse
                </p>
                <p style={{ fontSize: 12, color: color.textFaint, margin: 0 }}>
                  Excel format only · must use the Vault Stocktake Import Template
                </p>
              </>
            )}
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={onFileChange}
              style={{ display: "none" }}
            />
          </div>

          {parseError && (
            <div style={{
              marginTop: 16, padding: "12px 16px",
              background: color.dangerBg, border: `1px solid ${color.danger}`,
              borderRadius: radius.md, color: color.danger, fontSize: 13,
              whiteSpace: "pre-wrap",
            }}>
              {parseError}
            </div>
          )}
        </div>
      )}

      {/* ── Review table ────────────────────────────────────────────────── */}
      {rows && !summary && (
        <div>
          {/* Summary chips */}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20 }}>
            <Chip n={total}          label="total rows"               colour={color.ink} />
            <Chip n={existing}       label="matched existing designs"  colour={color.dotSuccess} />
            <Chip n={newDesigns}     label="new designs"               colour={color.dotInfo} />
            {ambiguous > 0 && <Chip n={ambiguous} label="ambiguous — review needed" colour={color.dotWarning} />}
            {errors    > 0 && <Chip n={errors}    label="rows with errors"           colour={color.danger} />}
            <Chip n={included}       label="selected for import"       colour={color.ink} />
            {newDesignsIncluded > 0 && (
              <Chip n={newDesignsIncluded} label="new designs will be created" colour={color.dotInfo} />
            )}
          </div>

          {/* Toolbar */}
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
            <button onClick={() => setAllIncluded(true)}  style={btn(color.white, color.ink)}>Include all</button>
            <button onClick={() => setAllIncluded(false)} style={btn(color.white, color.ink)}>Exclude all</button>
            <span style={{ marginLeft: "auto", fontSize: 13, color: color.textMuted }}>
              {included} of {total} rows selected
            </span>
            <button
              onClick={() => { setRows(null); setParseError(null); }}
              style={btn(color.white, color.textMuted)}
            >
              ← Upload different file
            </button>
          </div>

          {/* Table */}
          <div style={{ overflowX: "auto", border: `1px solid ${color.line}`, borderRadius: radius.lg }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={{ ...TH, width: 32, textAlign: "center" }}>
                    <input
                      type="checkbox"
                      checked={included === total && total > 0}
                      onChange={e => setAllIncluded(e.target.checked)}
                      title="Toggle all"
                    />
                  </th>
                  <th style={{ ...TH, width: 40 }}>#</th>
                  <th style={TH}>Design Name</th>
                  <th style={TH}>Match</th>
                  <th style={TH}>Metal</th>
                  <th style={TH}>Stone</th>
                  <th style={TH}>Status</th>
                  <th style={TH}>Location</th>
                  <th style={{ ...TH, textAlign: "right" }}>Retail Price</th>
                  <th style={TH}>Errors / Notes</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => {
                  const hasError = row.errors.length > 0;
                  const bg = row.included
                    ? hasError
                      ? color.fill
                      : row.matchType === "ambiguous"
                        ? color.fill
                        : color.white
                    : color.paper;

                  const stoneSummary = [
                    row.raw["Stone Type"],
                    row.raw["Stone Carat"] ? `${row.raw["Stone Carat"]}ct` : "",
                    row.raw["Stone Colour"],
                    row.raw["Stone Clarity"],
                  ].filter(Boolean).join(" ");

                  return (
                    <tr
                      key={idx}
                      style={{
                        background: bg,
                        borderBottom: `1px solid ${color.line}`,
                        opacity: row.included ? 1 : 0.45,
                      }}
                    >
                      <td style={{ ...TD, textAlign: "center" }}>
                        <input
                          type="checkbox"
                          checked={row.included}
                          onChange={() => toggleRow(idx)}
                        />
                      </td>
                      <td style={{ ...TD, color: color.textFaint }}>{row.rowIndex}</td>
                      <td style={{ ...TD, fontWeight: 600, maxWidth: 200 }}>
                        {row.designName || (
                          <span style={{ color: color.danger, fontStyle: "italic" }}>BLANK</span>
                        )}
                        {row.raw["Old ARMS Stock #"] && (
                          <div style={{ fontSize: 11, color: color.textFaint, fontWeight: 400, marginTop: 2 }}>
                            ARMS: {row.raw["Old ARMS Stock #"]}
                          </div>
                        )}
                      </td>
                      <td style={TD}>
                        <MatchBadge row={row} />
                      </td>
                      <td style={TD}>
                        {row.metalKarat || row.metalColour ? (
                          <span>
                            {row.metalKarat}
                            {row.metalColour && row.metalColour !== "N/A"
                              ? <span style={{ color: color.textFaint }}> · {row.metalColour}</span>
                              : null
                            }
                          </span>
                        ) : (
                          <span style={{ color: color.danger }}>Missing</span>
                        )}
                        {row.raw["Actual Weight (g)"] && (
                          <div style={{ fontSize: 11, color: color.textFaint, marginTop: 2 }}>
                            {row.raw["Actual Weight (g)"]}g
                          </div>
                        )}
                      </td>
                      <td style={{ ...TD, color: color.textMuted }}>
                        {stoneSummary || <span style={{ color: color.textFaint }}>—</span>}
                      </td>
                      <td style={TD}>
                        {row.status || <span style={{ color: color.textFaint }}>—</span>}
                      </td>
                      <td style={TD}>
                        {row.location || <span style={{ color: color.textFaint }}>—</span>}
                      </td>
                      <td style={{ ...TD, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                        {row.retailPrice && !isNaN(Number(row.retailPrice))
                          ? `$${Number(row.retailPrice).toLocaleString("en-AU")}`
                          : row.retailPrice
                            ? <span style={{ color: color.danger }}>{row.retailPrice}</span>
                            : <span style={{ color: color.textFaint }}>—</span>
                        }
                      </td>
                      <td style={{ ...TD, maxWidth: 300 }}>
                        {hasError ? (
                          <ul style={{ margin: 0, padding: "0 0 0 14px", color: color.danger, fontSize: 12 }}>
                            {row.errors.map((e, i) => <li key={i}>{e}</li>)}
                          </ul>
                        ) : row.matchType === "ambiguous" ? (
                          <span style={{ color: color.dotWarning, fontSize: 12 }}>
                            ⚠ Possible match{row.ambiguousHits.length > 1 ? "es" : ""}:{" "}
                            {row.ambiguousHits.map(d => `"${d.name}"`).join(", ")} — confirm before importing
                          </span>
                        ) : (
                          <span style={{ color: color.dotSuccess, fontSize: 12 }}>✓ Ready</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Import error */}
          {importError && (
            <div style={{
              marginTop: 12, padding: "12px 16px",
              background: color.dangerBg, border: `1px solid ${color.danger}`,
              borderRadius: radius.md, color: color.danger, fontSize: 13,
            }}>
              {importError}
            </div>
          )}

          {/* Bottom action bar */}
          <div style={{
            marginTop: 16,
            padding: "16px 20px",
            background: color.white,
            border: `1px solid ${color.line}`,
            borderRadius: radius.lg,
            boxShadow: shadow.card,
            display: "flex",
            alignItems: "center",
            gap: 16,
          }}>
            <div style={{ flex: 1, fontSize: 13, color: color.textMuted }}>
              <strong style={{ color: color.text }}>{included}</strong> pieces selected for import
              {newDesignsIncluded > 0 && (
                <span> · <strong style={{ color: color.dotInfo }}>{newDesignsIncluded}</strong> new design{newDesignsIncluded > 1 ? "s" : ""} will be created</span>
              )}
              {errors > 0 && (
                <span> · <strong style={{ color: color.danger }}>{rows!.filter(r => !r.included && r.errors.length > 0).length}</strong> rows excluded due to errors</span>
              )}
              {ambiguous > 0 && (
                <span> · <strong style={{ color: color.dotWarning }}>{rows!.filter(r => !r.included && r.matchType === "ambiguous").length}</strong> ambiguous rows excluded</span>
              )}
            </div>
            <button
              onClick={runImport}
              disabled={importing || included === 0}
              style={{
                padding: "10px 24px",
                background: importing || included === 0 ? color.fill : color.ink,
                color: importing || included === 0 ? color.textFaint : color.white,
                border: "none",
                borderRadius: radius.pill,
                fontWeight: 500,
                cursor: importing || included === 0 ? "not-allowed" : "pointer",
                fontSize: 14,
                fontFamily: "inherit",
                transition: "background 0.15s",
              }}
            >
              {importing ? "Importing…" : `Import ${included} piece${included !== 1 ? "s" : ""} →`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function Chip({ n, label, colour }: { n: number; label: string; colour: string }) {
  return (
    <div style={{
      padding: "8px 14px",
      background: color.white,
      border: `1px solid ${color.line}`,
      borderRadius: radius.lg,
      boxShadow: shadow.card,
      fontSize: 13,
      display: "flex",
      alignItems: "baseline",
      gap: 6,
    }}>
      <span style={{ fontWeight: 700, color: colour, fontSize: 18 }}>{n}</span>
      <span style={{ color: color.textMuted }}>{label}</span>
    </div>
  );
}

function MatchBadge({ row }: { row: ReviewRow }) {
  if (row.matchType === "existing") {
    return (
      <div>
        <StatusBadge tone="success" label="EXISTING" />
        <div style={{ fontSize: 11, color: color.textMuted, marginTop: 2 }}>
          {row.matchedDesign!.name}
        </div>
      </div>
    );
  }
  if (row.matchType === "ambiguous") {
    return <StatusBadge tone="warning" label="AMBIGUOUS" />;
  }
  return <StatusBadge tone="info" label="NEW DESIGN" />;
}

"use client";

import { useRef, useState } from "react";
import * as XLSX from "xlsx";
import Link from "next/link";
import { useUser } from "@/context/UserContext";
import { canManage } from "@/lib/userTypes";

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
  padding: "9px 12px",
  textAlign: "left",
  fontWeight: 600,
  color: "#6B7280",
  fontSize: 12,
  whiteSpace: "nowrap",
  background: "#F9FAFB",
  borderBottom: "2px solid #E5E7EB",
};

const TD: React.CSSProperties = {
  padding: "9px 12px",
  verticalAlign: "top",
  fontSize: 13,
};

function btn(bg: string, color: string): React.CSSProperties {
  return {
    padding: "6px 12px",
    background: bg,
    color,
    border: "1px solid #E5E7EB",
    borderRadius: 6,
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
      <div style={{ padding: 40, color: "#374151" }}>
        <p>This page is managers only.</p>
        <Link href="/inventory" style={{ color: "#2563EB" }}>← Back to Inventory</Link>
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
      <div style={{ fontSize: 13, color: "#9CA3AF", marginBottom: 6 }}>
        <Link href="/inventory" style={{ color: "#9CA3AF", textDecoration: "none" }}>Inventory</Link>
        {" › "}
        <Link href="/inventory/import" style={{ color: "#9CA3AF", textDecoration: "none" }}>Import</Link>
        {" › "}
        Stocktake
      </div>

      <div style={{ display: "flex", alignItems: "baseline", gap: 16, marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111827", margin: 0 }}>
          Stocktake Import
        </h1>
        <span style={{
          fontSize: 11, fontWeight: 600, padding: "2px 8px",
          background: "#EEF2FF", color: "#4338CA", borderRadius: 4,
        }}>STEP 1 — REVIEW</span>
      </div>

      {/* ── Import summary ──────────────────────────────────────────────── */}
      {summary && (
        <div style={{ maxWidth: 700 }}>
          {/* Success banner */}
          <div style={{
            padding: "20px 24px",
            background: summary.skipped === 0 ? "#D1FAE5" : "#FEF3C7",
            border: `1px solid ${summary.skipped === 0 ? "#6EE7B7" : "#FCD34D"}`,
            borderRadius: 10,
            marginBottom: 24,
          }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: summary.skipped === 0 ? "#065F46" : "#92400E" }}>
              {summary.skipped === 0
                ? `✓ Import complete — ${summary.created} piece${summary.created !== 1 ? "s" : ""} created`
                : `Import finished with warnings — ${summary.created} created, ${summary.skipped} skipped`
              }
            </div>
            <div style={{ fontSize: 13, color: summary.skipped === 0 ? "#047857" : "#B45309", marginTop: 6 }}>
              {summary.newDesignsCount > 0 && (
                <span>{summary.newDesignsCount} new design{summary.newDesignsCount !== 1 ? "s" : ""} created · </span>
              )}
              {summary.newVariantsCount > 0 && (
                <span>{summary.newVariantsCount} new variant{summary.newVariantsCount !== 1 ? "s" : ""} created · </span>
              )}
              <Link href="/inventory" style={{ color: "inherit", fontWeight: 600 }}>
                View in Inventory →
              </Link>
            </div>
          </div>

          {/* New designs created */}
          {summary.newDesigns.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: "#374151", marginBottom: 8 }}>
                New designs created ({summary.newDesigns.length})
              </h3>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {summary.newDesigns.map(name => (
                  <span key={name} style={{
                    padding: "3px 10px", background: "#DBEAFE", color: "#1E40AF",
                    borderRadius: 4, fontSize: 12, fontWeight: 600,
                  }}>{name}</span>
                ))}
              </div>
            </div>
          )}

          {/* Skipped rows */}
          {summary.skippedDetails.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: "#DC2626", marginBottom: 8 }}>
                Skipped rows ({summary.skippedDetails.length})
              </h3>
              <div style={{ border: "1px solid #FCA5A5", borderRadius: 8, overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr>
                      <th style={{ ...TH, background: "#FEF2F2" }}>Row #</th>
                      <th style={{ ...TH, background: "#FEF2F2" }}>Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.skippedDetails.map(({ rowIndex, reason }) => (
                      <tr key={rowIndex} style={{ borderBottom: "1px solid #FEE2E2" }}>
                        <td style={{ ...TD, color: "#DC2626", fontWeight: 600, whiteSpace: "nowrap" }}>
                          Row {rowIndex}
                        </td>
                        <td style={{ ...TD, color: "#B91C1C" }}>{reason}</td>
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
              <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 600, color: "#374151", userSelect: "none" }}>
                Created pieces — {summary.createdPieces.length} total (expand to see SKUs)
              </summary>
              <div style={{ marginTop: 8, fontSize: 12, color: "#6B7280", lineHeight: 1.8 }}>
                {summary.createdPieces.map(p => (
                  <span key={p.sku} style={{ marginRight: 12 }}>
                    <Link href={`/inventory/${p.pieceId}`} style={{ color: "#2563EB" }}>{p.sku}</Link>
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
                background: "#2563EB",
                color: "#fff",
                borderRadius: 8,
                fontWeight: 600,
                fontSize: 14,
                textDecoration: "none",
              }}
            >
              View Inventory
            </Link>
            <button
              onClick={() => { setSummary(null); setParseError(null); }}
              style={btn("#F3F4F6", "#374151")}
            >
              Import another file
            </button>
          </div>
        </div>
      )}

      {/* ── Upload zone ─────────────────────────────────────────────────── */}
      {!rows && !summary && (
        <div style={{ maxWidth: 640 }}>
          <p style={{ color: "#6B7280", fontSize: 14, marginBottom: 20, lineHeight: 1.6 }}>
            Upload a completed <strong>Vault Stocktake Import Template</strong> (.xlsx).
            Each row will be matched against existing designs before anything is created or committed.
          </p>

          <div
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => !busy && fileRef.current?.click()}
            style={{
              border: `2px dashed ${dragging ? "#3B82F6" : "#D1D5DB"}`,
              borderRadius: 12,
              padding: "56px 40px",
              textAlign: "center",
              cursor: busy ? "default" : "pointer",
              background: dragging ? "#EFF6FF" : "#F9FAFB",
              transition: "border-color 0.15s, background 0.15s",
            }}
          >
            <div style={{ fontSize: 48, marginBottom: 12 }}>📊</div>
            {busy ? (
              <p style={{ fontWeight: 600, color: "#374151", margin: 0 }}>{busyMsg}</p>
            ) : (
              <>
                <p style={{ fontWeight: 600, color: "#374151", margin: "0 0 4px" }}>
                  Drop .xlsx file here, or click to browse
                </p>
                <p style={{ fontSize: 12, color: "#9CA3AF", margin: 0 }}>
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
              background: "#FEF2F2", border: "1px solid #FCA5A5",
              borderRadius: 8, color: "#B91C1C", fontSize: 13,
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
            <Chip n={total}          label="total rows"               colour="#374151" />
            <Chip n={existing}       label="matched existing designs"  colour="#059669" />
            <Chip n={newDesigns}     label="new designs"               colour="#2563EB" />
            {ambiguous > 0 && <Chip n={ambiguous} label="ambiguous — review needed" colour="#D97706" />}
            {errors    > 0 && <Chip n={errors}    label="rows with errors"           colour="#DC2626" />}
            <Chip n={included}       label="selected for import"       colour="#7C3AED" />
            {newDesignsIncluded > 0 && (
              <Chip n={newDesignsIncluded} label="new designs will be created" colour="#0891B2" />
            )}
          </div>

          {/* Toolbar */}
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
            <button onClick={() => setAllIncluded(true)}  style={btn("#F3F4F6", "#374151")}>Include all</button>
            <button onClick={() => setAllIncluded(false)} style={btn("#F3F4F6", "#374151")}>Exclude all</button>
            <span style={{ marginLeft: "auto", fontSize: 13, color: "#6B7280" }}>
              {included} of {total} rows selected
            </span>
            <button
              onClick={() => { setRows(null); setParseError(null); }}
              style={btn("#F3F4F6", "#6B7280")}
            >
              ← Upload different file
            </button>
          </div>

          {/* Table */}
          <div style={{ overflowX: "auto", border: "1px solid #E5E7EB", borderRadius: 8 }}>
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
                      ? "#FFFBEB"
                      : row.matchType === "ambiguous"
                        ? "#FFFBEB"
                        : "white"
                    : "#F9FAFB";

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
                        borderBottom: "1px solid #E5E7EB",
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
                      <td style={{ ...TD, color: "#9CA3AF" }}>{row.rowIndex}</td>
                      <td style={{ ...TD, fontWeight: 600, maxWidth: 200 }}>
                        {row.designName || (
                          <span style={{ color: "#EF4444", fontStyle: "italic" }}>BLANK</span>
                        )}
                        {row.raw["Old ARMS Stock #"] && (
                          <div style={{ fontSize: 11, color: "#9CA3AF", fontWeight: 400, marginTop: 2 }}>
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
                              ? <span style={{ color: "#9CA3AF" }}> · {row.metalColour}</span>
                              : null
                            }
                          </span>
                        ) : (
                          <span style={{ color: "#EF4444" }}>Missing</span>
                        )}
                        {row.raw["Actual Weight (g)"] && (
                          <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 2 }}>
                            {row.raw["Actual Weight (g)"]}g
                          </div>
                        )}
                      </td>
                      <td style={{ ...TD, color: "#6B7280" }}>
                        {stoneSummary || <span style={{ color: "#D1D5DB" }}>—</span>}
                      </td>
                      <td style={TD}>
                        {row.status || <span style={{ color: "#D1D5DB" }}>—</span>}
                      </td>
                      <td style={TD}>
                        {row.location || <span style={{ color: "#D1D5DB" }}>—</span>}
                      </td>
                      <td style={{ ...TD, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                        {row.retailPrice && !isNaN(Number(row.retailPrice))
                          ? `$${Number(row.retailPrice).toLocaleString("en-AU")}`
                          : row.retailPrice
                            ? <span style={{ color: "#EF4444" }}>{row.retailPrice}</span>
                            : <span style={{ color: "#D1D5DB" }}>—</span>
                        }
                      </td>
                      <td style={{ ...TD, maxWidth: 300 }}>
                        {hasError ? (
                          <ul style={{ margin: 0, padding: "0 0 0 14px", color: "#B91C1C", fontSize: 12 }}>
                            {row.errors.map((e, i) => <li key={i}>{e}</li>)}
                          </ul>
                        ) : row.matchType === "ambiguous" ? (
                          <span style={{ color: "#B45309", fontSize: 12 }}>
                            ⚠ Possible match{row.ambiguousHits.length > 1 ? "es" : ""}:{" "}
                            {row.ambiguousHits.map(d => `"${d.name}"`).join(", ")} — confirm before importing
                          </span>
                        ) : (
                          <span style={{ color: "#10B981", fontSize: 12 }}>✓ Ready</span>
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
              background: "#FEF2F2", border: "1px solid #FCA5A5",
              borderRadius: 8, color: "#B91C1C", fontSize: 13,
            }}>
              {importError}
            </div>
          )}

          {/* Bottom action bar */}
          <div style={{
            marginTop: 16,
            padding: "16px 20px",
            background: "#F9FAFB",
            border: "1px solid #E5E7EB",
            borderRadius: 8,
            display: "flex",
            alignItems: "center",
            gap: 16,
          }}>
            <div style={{ flex: 1, fontSize: 13, color: "#6B7280" }}>
              <strong style={{ color: "#374151" }}>{included}</strong> pieces selected for import
              {newDesignsIncluded > 0 && (
                <span> · <strong style={{ color: "#0891B2" }}>{newDesignsIncluded}</strong> new design{newDesignsIncluded > 1 ? "s" : ""} will be created</span>
              )}
              {errors > 0 && (
                <span> · <strong style={{ color: "#DC2626" }}>{rows!.filter(r => !r.included && r.errors.length > 0).length}</strong> rows excluded due to errors</span>
              )}
              {ambiguous > 0 && (
                <span> · <strong style={{ color: "#D97706" }}>{rows!.filter(r => !r.included && r.matchType === "ambiguous").length}</strong> ambiguous rows excluded</span>
              )}
            </div>
            <button
              onClick={runImport}
              disabled={importing || included === 0}
              style={{
                padding: "10px 24px",
                background: importing || included === 0 ? "#E5E7EB" : "#059669",
                color: importing || included === 0 ? "#9CA3AF" : "#fff",
                border: "none",
                borderRadius: 8,
                fontWeight: 600,
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
      background: "white",
      border: "1px solid #E5E7EB",
      borderRadius: 8,
      fontSize: 13,
      display: "flex",
      alignItems: "baseline",
      gap: 6,
    }}>
      <span style={{ fontWeight: 700, color: colour, fontSize: 18 }}>{n}</span>
      <span style={{ color: "#6B7280" }}>{label}</span>
    </div>
  );
}

function MatchBadge({ row }: { row: ReviewRow }) {
  if (row.matchType === "existing") {
    return (
      <div>
        <span style={{
          display: "inline-block", padding: "2px 7px",
          background: "#D1FAE5", color: "#065F46",
          borderRadius: 4, fontSize: 11, fontWeight: 700,
        }}>EXISTING</span>
        <div style={{ fontSize: 11, color: "#6B7280", marginTop: 2 }}>
          {row.matchedDesign!.name}
        </div>
      </div>
    );
  }
  if (row.matchType === "ambiguous") {
    return (
      <span style={{
        display: "inline-block", padding: "2px 7px",
        background: "#FEF3C7", color: "#92400E",
        borderRadius: 4, fontSize: 11, fontWeight: 700,
      }}>AMBIGUOUS</span>
    );
  }
  return (
    <span style={{
      display: "inline-block", padding: "2px 7px",
      background: "#DBEAFE", color: "#1E40AF",
      borderRadius: 4, fontSize: 11, fontWeight: 700,
    }}>NEW DESIGN</span>
  );
}

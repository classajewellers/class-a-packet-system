"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useUser } from "@/context/UserContext";
import { Upload, FileText, CheckCircle2, AlertTriangle, Download, ArrowRight, ArrowLeft, RefreshCw } from "lucide-react";

// ────────────────────────────────────────────────────────────────────────────
// CSV parser (handles quoted fields with commas inside quotes)
// ────────────────────────────────────────────────────────────────────────────
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { current += '"'; i++; }
        else { inQuotes = false; }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === ",") { result.push(current); current = ""; }
      else { current += ch; }
    }
  }
  result.push(current);
  return result;
}

function parseCSV(text: string): Array<Record<string, string>> {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  const headers = parseCSVLine(lines[0]).map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const vals = parseCSVLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = (vals[i] ?? "").trim(); });
    return row;
  });
}

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────
interface ImportResult {
  designs_created: number;
  pieces_created: number;
  bom_items_created: number;
  orphaned_components: number;
  failed_pieces: number;
  failed_bom: number;
  errors: Array<{ row: number; type: "piece" | "bom" | "orphan"; sku: string; reason: string }>;
}

type Step = 1 | 2 | 3;

// ────────────────────────────────────────────────────────────────────────────
// Page
// ────────────────────────────────────────────────────────────────────────────
export default function ArmsImportPage() {
  const { user, roleLoading } = useUser();
  const isAdmin = user?.role === "admin";

  const [step, setStep] = useState<Step>(1);
  const [fileName, setFileName] = useState<string>("");
  const [rows, setRows] = useState<Array<Record<string, string>>>([]);
  const [parseError, setParseError] = useState<string | null>(null);

  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = useState(false);

  // ── derived stats ─────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const stockRows = rows.filter((r) => (r.Type || "").toLowerCase() === "stock");
    const componentRows = rows.filter((r) => (r.Type || "").toLowerCase() === "component");
    const uniqueDesigns = new Set<string>();
    for (const r of stockRows) {
      const name = (r["Shopify Title"] || r["Design Name"] || "Uncategorised").trim();
      if (name) uniqueDesigns.add(name.toLowerCase());
    }
    const stockSkus = new Set(stockRows.map((r) => (r["Stock # / SKU"] || "").trim()).filter(Boolean));
    const orphans: string[] = [];
    const dupeSkus: string[] = [];
    const seenSku = new Set<string>();
    for (const r of stockRows) {
      const sku = (r["Stock # / SKU"] || "").trim();
      if (!sku) continue;
      if (seenSku.has(sku)) dupeSkus.push(sku);
      else seenSku.add(sku);
    }
    for (const r of componentRows) {
      const parent = (r["Parent Stock #"] || "").trim();
      if (!parent || !stockSkus.has(parent)) {
        orphans.push((r["Stock # / SKU"] || parent || "(blank)").trim());
      }
    }
    return {
      stockCount: stockRows.length,
      componentCount: componentRows.length,
      uniqueDesignCount: uniqueDesigns.size,
      orphans,
      dupeSkus,
    };
  }, [rows]);

  // ── handlers ──────────────────────────────────────────────────────────────
  const handleFile = async (file: File) => {
    setParseError(null);
    setResult(null);
    setApiError(null);
    setFileName(file.name);
    try {
      const text = await file.text();
      const parsed = parseCSV(text);
      if (parsed.length === 0) {
        setParseError("CSV contained no data rows.");
        setRows([]);
        return;
      }
      setRows(parsed);
    } catch (err) {
      setParseError(String(err));
      setRows([]);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  };

  const runImport = async () => {
    if (rows.length === 0) return;
    setImporting(true);
    setApiError(null);
    setResult(null);
    setProgress(0);
    setStep(3);

    // Cosmetic progress bar over ~1.5s
    const startTs = Date.now();
    const tick = () => {
      const elapsed = Date.now() - startTs;
      const pct = Math.min(95, (elapsed / 1500) * 100);
      setProgress(pct);
    };
    const timer = setInterval(tick, 50);

    try {
      const res = await fetch("/api/inventory/import-arms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows }),
      });
      const json = await res.json();
      if (!res.ok || json.error) {
        setApiError(json.error || `Failed (${res.status})`);
      } else {
        setResult(json as ImportResult);
      }
    } catch (err) {
      setApiError(String(err));
    } finally {
      clearInterval(timer);
      setProgress(100);
      setImporting(false);
    }
  };

  const reset = () => {
    setStep(1);
    setFileName("");
    setRows([]);
    setParseError(null);
    setResult(null);
    setApiError(null);
    setProgress(0);
  };

  const downloadErrorsCsv = () => {
    if (!result || result.errors.length === 0) return;
    const headers = ["row", "type", "sku", "reason"];
    const escape = (v: string) =>
      /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
    const lines = [headers.join(",")].concat(
      result.errors.map((e) => [String(e.row), e.type, e.sku, e.reason].map(escape).join(","))
    );
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "arms_import_errors.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // ── access control ───────────────────────────────────────────────────────
  if (roleLoading) {
    return (
      <div style={pageStyle}>
        <div style={{ color: "#6B7280", padding: 40, textAlign: "center" }}>Loading…</div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div style={pageStyle}>
        <div style={{
          maxWidth: 480, margin: "80px auto", padding: 32, background: "#fff",
          borderRadius: 12, border: "1px solid #E5E7EB", textAlign: "center",
        }}>
          <AlertTriangle size={36} color="#F59E0B" style={{ marginBottom: 12 }} />
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "#1E1B4B", margin: "0 0 8px 0" }}>Access denied</h1>
          <p style={{ color: "#6B7280", fontSize: 14, margin: 0 }}>
            Importing inventory is restricted to administrators.
          </p>
        </div>
      </div>
    );
  }

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <div style={pageStyle}>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: 24 }}>
        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, color: "#1E1B4B" }}>Import Inventory</h1>
          <p style={{ color: "#6B7280", fontSize: 14, margin: "4px 0 0 0" }}>
            Upload an ARMS / Shopify export to bulk-create Designs, Pieces, and Bill-of-Materials entries.
          </p>
        </div>

        {/* Step indicator */}
        <StepIndicator step={step} />

        {/* Steps */}
        <div style={{ marginTop: 24 }}>
          {step === 1 && (
            <Step1Upload
              fileName={fileName}
              rows={rows}
              stats={stats}
              parseError={parseError}
              dragOver={dragOver}
              setDragOver={setDragOver}
              fileInputRef={fileInputRef}
              onFile={handleFile}
              onDrop={onDrop}
              onNext={() => setStep(2)}
            />
          )}
          {step === 2 && (
            <Step2Review
              stats={stats}
              onBack={() => setStep(1)}
              onConfirm={runImport}
            />
          )}
          {step === 3 && (
            <Step3Results
              importing={importing}
              progress={progress}
              result={result}
              apiError={apiError}
              onDownloadErrors={downloadErrorsCsv}
              onReset={reset}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Step Indicator
// ────────────────────────────────────────────────────────────────────────────
function StepIndicator({ step }: { step: Step }) {
  const labels = ["Upload", "Review", "Import"];
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 0,
      background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12,
      padding: "16px 24px",
    }}>
      {labels.map((label, i) => {
        const n = (i + 1) as Step;
        const isActive = step === n;
        const isComplete = step > n;
        const bg = isComplete ? "#10B981" : isActive ? "#635BFF" : "#E5E7EB";
        const fg = isComplete || isActive ? "#FFFFFF" : "#9CA3AF";
        return (
          <div key={label} style={{ display: "flex", alignItems: "center", flex: i === labels.length - 1 ? "0" : "1" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{
                width: 32, height: 32, borderRadius: "50%", background: bg, color: fg,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontWeight: 700, fontSize: 14, flexShrink: 0,
                transition: "background .2s",
              }}>
                {isComplete ? <CheckCircle2 size={18} /> : n}
              </div>
              <span style={{
                fontSize: 13, fontWeight: 600,
                color: isActive ? "#1E1B4B" : isComplete ? "#10B981" : "#9CA3AF",
              }}>
                {label}
              </span>
            </div>
            {i < labels.length - 1 && (
              <div style={{
                flex: 1, height: 2, margin: "0 16px",
                background: isComplete ? "#10B981" : "#E5E7EB",
                transition: "background .2s",
              }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Step 1 — Upload
// ────────────────────────────────────────────────────────────────────────────
function Step1Upload({
  fileName, rows, stats, parseError, dragOver, setDragOver, fileInputRef,
  onFile, onDrop, onNext,
}: {
  fileName: string;
  rows: Array<Record<string, string>>;
  stats: { stockCount: number; componentCount: number; uniqueDesignCount: number; orphans: string[]; dupeSkus: string[] };
  parseError: string | null;
  dragOver: boolean;
  setDragOver: (v: boolean) => void;
  fileInputRef: React.MutableRefObject<HTMLInputElement | null>;
  onFile: (f: File) => void;
  onDrop: (e: React.DragEvent) => void;
  onNext: () => void;
}) {
  const stockRows = rows.filter((r) => (r.Type || "").toLowerCase() === "stock");
  const preview = stockRows.slice(0, 10);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Drop area */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
        style={{
          border: `2px dashed ${dragOver ? "#635BFF" : "rgba(99,91,255,0.5)"}`,
          background: dragOver ? "rgba(99,91,255,0.08)" : "rgba(99,91,255,0.03)",
          borderRadius: 12, padding: 40,
          textAlign: "center", cursor: "pointer",
          transition: "background .15s, border-color .15s",
        }}
      >
        <Upload size={36} color="#635BFF" style={{ marginBottom: 12 }} />
        <div style={{ fontSize: 15, fontWeight: 600, color: "#1E1B4B", marginBottom: 4 }}>
          {fileName ? fileName : "Drop a CSV file here, or click to select"}
        </div>
        <div style={{ fontSize: 12, color: "#6B7280" }}>
          ARMS / Shopify export format · `.csv` only
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
          }}
          style={{ display: "none" }}
        />
      </div>

      {parseError && (
        <div style={errorBox}>{parseError}</div>
      )}

      {/* Summary card */}
      {rows.length > 0 && !parseError && (
        <div style={cardStyle}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#1E1B4B", marginBottom: 12 }}>Pre-import summary</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 16 }}>
            <StatTile label="Stock rows" value={stats.stockCount} />
            <StatTile label="Component rows" value={stats.componentCount} />
            <StatTile label="Unique design names" value={stats.uniqueDesignCount} />
          </div>

          {preview.length > 0 && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#6B7280", marginBottom: 8 }}>
                Preview — first {preview.length} stock row{preview.length === 1 ? "" : "s"}
              </div>
              <div style={{ overflowX: "auto", border: "1px solid #E5E7EB", borderRadius: 8 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead style={{ background: "#F9FAFB" }}>
                    <tr>
                      {["SKU", "Shopify Title", "Department", "Cost", "Retail Price"].map((h) => (
                        <th key={h} style={{ padding: "8px 10px", textAlign: "left", fontWeight: 600, color: "#6B7280", whiteSpace: "nowrap" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((r, i) => (
                      <tr key={i} style={{ borderTop: "1px solid #F3F4F6" }}>
                        <td style={{ padding: "6px 10px", fontFamily: "monospace" }}>{r["Stock # / SKU"]}</td>
                        <td style={{ padding: "6px 10px" }}>{r["Shopify Title"]}</td>
                        <td style={{ padding: "6px 10px" }}>{r.Department}</td>
                        <td style={{ padding: "6px 10px" }}>{r.Cost}</td>
                        <td style={{ padding: "6px 10px" }}>{r["Retail Price"]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <button
          onClick={onNext}
          disabled={rows.length === 0 || !!parseError}
          style={{
            ...btnPrimary,
            opacity: rows.length === 0 || !!parseError ? 0.5 : 1,
            cursor: rows.length === 0 || !!parseError ? "not-allowed" : "pointer",
            display: "inline-flex", alignItems: "center", gap: 6,
          }}
        >
          Next: Review <ArrowRight size={14} />
        </button>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Step 2 — Review
// ────────────────────────────────────────────────────────────────────────────
function Step2Review({
  stats, onBack, onConfirm,
}: {
  stats: { stockCount: number; componentCount: number; uniqueDesignCount: number; orphans: string[]; dupeSkus: string[] };
  onBack: () => void;
  onConfirm: () => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={cardStyle}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#1E1B4B", marginBottom: 12 }}>What will happen</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 13, color: "#374151" }}>
          <ReviewLine label={`Up to ${stats.uniqueDesignCount} new Design${stats.uniqueDesignCount === 1 ? "" : "s"} will be created`} />
          <ReviewLine label={`${stats.stockCount} Piece${stats.stockCount === 1 ? "" : "s"} will be created`} />
          <ReviewLine label={`${stats.componentCount - stats.orphans.length} BOM line item${stats.componentCount - stats.orphans.length === 1 ? "" : "s"} will be created`} />
          {stats.orphans.length > 0 && (
            <div style={warningBox}>
              <AlertTriangle size={16} color="#92400E" />
              <div>
                <div style={{ fontWeight: 600 }}>
                  {stats.orphans.length} component{stats.orphans.length === 1 ? "" : "s"} with no matching parent stock (will be skipped):
                </div>
                <div style={{ fontSize: 11, marginTop: 4, fontFamily: "monospace" }}>
                  {stats.orphans.slice(0, 12).join(", ")}{stats.orphans.length > 12 ? `, +${stats.orphans.length - 12} more` : ""}
                </div>
              </div>
            </div>
          )}
          {stats.dupeSkus.length > 0 && (
            <div style={warningBox}>
              <AlertTriangle size={16} color="#92400E" />
              <div>
                <div style={{ fontWeight: 600 }}>
                  Duplicate SKUs detected ({stats.dupeSkus.length}) — second occurrence will fail to insert:
                </div>
                <div style={{ fontSize: 11, marginTop: 4, fontFamily: "monospace" }}>
                  {stats.dupeSkus.slice(0, 12).join(", ")}{stats.dupeSkus.length > 12 ? `, +${stats.dupeSkus.length - 12} more` : ""}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <button onClick={onBack} style={{ ...btnSecondary, display: "inline-flex", alignItems: "center", gap: 6 }}>
          <ArrowLeft size={14} /> Back
        </button>
        <button onClick={onConfirm} style={{ ...btnPrimary, display: "inline-flex", alignItems: "center", gap: 6 }}>
          Confirm Import <ArrowRight size={14} />
        </button>
      </div>
    </div>
  );
}

function ReviewLine({ label }: { label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <CheckCircle2 size={16} color="#10B981" />
      <span>{label}</span>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Step 3 — Results
// ────────────────────────────────────────────────────────────────────────────
function Step3Results({
  importing, progress, result, apiError, onDownloadErrors, onReset,
}: {
  importing: boolean;
  progress: number;
  result: ImportResult | null;
  apiError: string | null;
  onDownloadErrors: () => void;
  onReset: () => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={cardStyle}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#1E1B4B", marginBottom: 12 }}>
          {importing ? "Importing…" : apiError ? "Import failed" : "Import complete"}
        </div>

        {/* Progress bar */}
        <div style={{
          height: 8, borderRadius: 999, background: "#E5E7EB",
          overflow: "hidden", marginBottom: 16,
        }}>
          <div style={{
            width: `${progress}%`, height: "100%",
            background: apiError ? "#EF4444" : (result ? "#10B981" : "#635BFF"),
            transition: "width .1s linear",
          }} />
        </div>

        {apiError && <div style={errorBox}>{apiError}</div>}

        {result && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 13 }}>
            <ResultLine ok label={`${result.designs_created} Design${result.designs_created === 1 ? "" : "s"} created`} />
            <ResultLine ok label={`${result.pieces_created} Piece${result.pieces_created === 1 ? "" : "s"} created`} />
            <ResultLine ok label={`${result.bom_items_created} BOM item${result.bom_items_created === 1 ? "" : "s"} created`} />
            {result.orphaned_components > 0 && (
              <ResultLine warn label={`${result.orphaned_components} orphaned component${result.orphaned_components === 1 ? "" : "s"} skipped`} />
            )}
            {(result.failed_pieces + result.failed_bom) > 0 && (
              <ResultLine fail label={`${result.failed_pieces + result.failed_bom} row${result.failed_pieces + result.failed_bom === 1 ? "" : "s"} failed`} />
            )}
          </div>
        )}
      </div>

      {result && result.errors.length > 0 && (
        <div style={cardStyle}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#1E1B4B" }}>
              Errors ({result.errors.length})
            </div>
            <button
              onClick={onDownloadErrors}
              style={{ ...btnSecondary, display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              <Download size={14} /> Download Errors CSV
            </button>
          </div>
          <div style={{ maxHeight: 320, overflowY: "auto", border: "1px solid #E5E7EB", borderRadius: 8 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead style={{ background: "#F9FAFB", position: "sticky", top: 0 }}>
                <tr>
                  {["Row", "Type", "SKU", "Reason"].map((h) => (
                    <th key={h} style={{ padding: "8px 10px", textAlign: "left", fontWeight: 600, color: "#6B7280" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.errors.map((e, i) => (
                  <tr key={i} style={{ borderTop: "1px solid #F3F4F6" }}>
                    <td style={{ padding: "6px 10px" }}>{e.row}</td>
                    <td style={{ padding: "6px 10px" }}>{e.type}</td>
                    <td style={{ padding: "6px 10px", fontFamily: "monospace" }}>{e.sku}</td>
                    <td style={{ padding: "6px 10px", color: "#991B1B" }}>{e.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <button onClick={onReset} style={{ ...btnSecondary, display: "inline-flex", alignItems: "center", gap: 6 }}>
          <RefreshCw size={14} /> Import Another File
        </button>
        <Link href="/inventory/stock" style={{ ...btnPrimary, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6 }}>
          Go to Stock <ArrowRight size={14} />
        </Link>
      </div>
    </div>
  );
}

function ResultLine({ label, ok, warn, fail }: { label: string; ok?: boolean; warn?: boolean; fail?: boolean }) {
  const color = ok ? "#10B981" : warn ? "#F59E0B" : fail ? "#EF4444" : "#6B7280";
  const Icon = ok ? CheckCircle2 : warn ? AlertTriangle : fail ? AlertTriangle : FileText;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <Icon size={16} color={color} />
      <span style={{ color: "#374151" }}>{label}</span>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Shared bits
// ────────────────────────────────────────────────────────────────────────────
function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div style={{
      padding: 14, background: "#F8F7FF", borderRadius: 8,
      border: "1px solid #E5E7EB",
    }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: "#6B7280", textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: "#1E1B4B", marginTop: 4 }}>{value}</div>
    </div>
  );
}

const pageStyle: React.CSSProperties = {
  background: "#F8F7FF",
  minHeight: "100vh",
};

const cardStyle: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #E5E7EB",
  borderRadius: 12,
  padding: 20,
};

const btnPrimary: React.CSSProperties = {
  padding: "10px 16px",
  background: "#635BFF",
  color: "#fff",
  border: "none",
  borderRadius: 8,
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
};

const btnSecondary: React.CSSProperties = {
  padding: "10px 14px",
  background: "#fff",
  color: "#374151",
  border: "1px solid #D1D5DB",
  borderRadius: 8,
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
};

const errorBox: React.CSSProperties = {
  padding: 12,
  background: "#FEE2E2",
  color: "#991B1B",
  borderRadius: 8,
  fontSize: 13,
};

const warningBox: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 10,
  padding: 12,
  background: "#FEF3C7",
  color: "#92400E",
  borderRadius: 8,
  fontSize: 13,
};

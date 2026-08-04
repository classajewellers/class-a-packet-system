"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useUser } from "@/context/UserContext";
import { Upload, FileText, CheckCircle2, AlertTriangle, Download, ArrowRight, ArrowLeft, RefreshCw } from "lucide-react";

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
      } else { current += ch; }
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

interface ImportResult {
  pieces_imported: number;
  failed: number;
  errors: Array<{ row: number; reason: string }>;
}

type Step = 1 | 2 | 3;

export default function ImportPage() {
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
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFile = async (file: File) => {
    setParseError(null); setResult(null); setApiError(null);
    setFileName(file.name);
    try {
      const text = await file.text();
      const parsed = parseCSV(text);
      if (parsed.length === 0) { setParseError("CSV contained no data rows."); setRows([]); return; }
      setRows(parsed);
    } catch (err) { setParseError(String(err)); setRows([]); }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  };

  const runImport = async () => {
    if (rows.length === 0) return;
    setImporting(true); setApiError(null); setResult(null); setProgress(0); setStep(3);
    const startTs = Date.now();
    const timer = setInterval(() => {
      const pct = Math.min(95, ((Date.now() - startTs) / 1500) * 100);
      setProgress(pct);
    }, 50);
    try {
      const res = await fetch("/api/inventory/import-csv", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-tenant-id": user?.tenantId ?? "" },
        body: JSON.stringify({ rows }),
      });
      const json = await res.json();
      if (!res.ok || json.error) setApiError(json.error || `Failed (${res.status})`);
      else setResult(json as ImportResult);
    } catch (err) { setApiError(String(err)); }
    finally { clearInterval(timer); setProgress(100); setImporting(false); }
  };

  const reset = () => {
    setStep(1); setFileName(""); setRows([]); setParseError(null);
    setResult(null); setApiError(null); setProgress(0);
  };

  const downloadErrorsCsv = () => {
    if (!result || result.errors.length === 0) return;
    const escape = (v: string) => /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
    const lines = ["row,reason"].concat(result.errors.map((e) => [String(e.row), e.reason].map(escape).join(",")));
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "import_errors.csv";
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  if (roleLoading) return <div style={pageStyle}><div style={{ color: "#6B7280", padding: 40, textAlign: "center" }}>Loading…</div></div>;

  if (!isAdmin) return (
    <div style={pageStyle}>
      <div style={{ maxWidth: 480, margin: "80px auto", padding: 32, background: "#fff", borderRadius: 12, border: "1px solid #E5E7EB", textAlign: "center" }}>
        <AlertTriangle size={36} color="#F59E0B" style={{ marginBottom: 12 }} />
        <h1 style={{ fontSize: 20, fontWeight: 700, color: "#111827", margin: "0 0 8px 0" }}>Access denied</h1>
        <p style={{ color: "#6B7280", fontSize: 14, margin: 0 }}>Importing inventory is restricted to administrators.</p>
      </div>
    </div>
  );

  return (
    <div style={pageStyle}>
      <div style={{ maxWidth: 860, margin: "0 auto", padding: 24 }}>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, color: "#111827" }}>Import Inventory</h1>
          <p style={{ color: "#6B7280", fontSize: 14, margin: "4px 0 0 0" }}>
            Upload a CSV to bulk-create inventory pieces. One piece per row.
          </p>
        </div>

        <StepIndicator step={step} />

        <div style={{ marginTop: 24 }}>
          {step === 1 && (
            <Step1Upload
              fileName={fileName} rows={rows} parseError={parseError}
              dragOver={dragOver} setDragOver={setDragOver}
              fileInputRef={fileInputRef} onFile={handleFile} onDrop={onDrop}
              onNext={() => setStep(2)}
            />
          )}
          {step === 2 && (
            <Step2Review rows={rows} onBack={() => setStep(1)} onConfirm={runImport} />
          )}
          {step === 3 && (
            <Step3Results
              importing={importing} progress={progress} result={result} apiError={apiError}
              onDownloadErrors={downloadErrorsCsv} onReset={reset}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function StepIndicator({ step }: { step: Step }) {
  const labels = ["Upload", "Review", "Import"];
  return (
    <div style={{ display: "flex", alignItems: "center", background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, padding: "16px 24px" }}>
      {labels.map((label, i) => {
        const n = (i + 1) as Step;
        const isActive = step === n; const isComplete = step > n;
        const bg = isComplete ? "#10B981" : isActive ? "#635BFF" : "#E5E7EB";
        const fg = isComplete || isActive ? "#fff" : "#9CA3AF";
        return (
          <div key={label} style={{ display: "flex", alignItems: "center", flex: i === labels.length - 1 ? "0" : "1" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: "50%", background: bg, color: fg, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 14, flexShrink: 0 }}>
                {isComplete ? <CheckCircle2 size={18} /> : n}
              </div>
              <span style={{ fontSize: 13, fontWeight: 600, color: isActive ? "#111827" : isComplete ? "#10B981" : "#9CA3AF" }}>{label}</span>
            </div>
            {i < labels.length - 1 && (
              <div style={{ flex: 1, height: 2, margin: "0 16px", background: isComplete ? "#10B981" : "#E5E7EB" }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function Step1Upload({ fileName, rows, parseError, dragOver, setDragOver, fileInputRef, onFile, onDrop, onNext }: {
  fileName: string; rows: Array<Record<string, string>>; parseError: string | null;
  dragOver: boolean; setDragOver: (v: boolean) => void;
  fileInputRef: React.MutableRefObject<HTMLInputElement | null>;
  onFile: (f: File) => void; onDrop: (e: React.DragEvent) => void; onNext: () => void;
}) {
  const preview = rows.slice(0, 8);
  const previewCols = ["sku", "title", "category", "status", "metal_karat", "metal_colour", "retail_price"];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
        style={{ border: `2px dashed ${dragOver ? "#635BFF" : "rgba(99,91,255,0.5)"}`, background: dragOver ? "rgba(99,91,255,0.08)" : "rgba(99,91,255,0.03)", borderRadius: 12, padding: 40, textAlign: "center", cursor: "pointer" }}
      >
        <Upload size={36} color="#635BFF" style={{ marginBottom: 12 }} />
        <div style={{ fontSize: 15, fontWeight: 600, color: "#111827", marginBottom: 4 }}>
          {fileName || "Drop a CSV file here, or click to select"}
        </div>
        <div style={{ fontSize: 12, color: "#6B7280" }}>Columns: sku, title, category, status, location, metal_type, metal_karat, metal_colour, finger_size, cost_price, retail_price, notes, supplier_code</div>
        <input ref={fileInputRef} type="file" accept=".csv,text/csv" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }} style={{ display: "none" }} />
      </div>

      {parseError && <div style={errorBox}>{parseError}</div>}

      {rows.length > 0 && !parseError && (
        <div style={cardStyle}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#111827", marginBottom: 12 }}>{rows.length} row{rows.length !== 1 ? "s" : ""} found</div>
          {preview.length > 0 && (
            <div style={{ overflowX: "auto", border: "1px solid #E5E7EB", borderRadius: 8 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead style={{ background: "#F9FAFB" }}>
                  <tr>{previewCols.map((h) => <th key={h} style={{ padding: "8px 10px", textAlign: "left", fontWeight: 600, color: "#6B7280", whiteSpace: "nowrap" }}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {preview.map((r, i) => (
                    <tr key={i} style={{ borderTop: "1px solid #F3F4F6" }}>
                      {previewCols.map((col) => <td key={col} style={{ padding: "6px 10px", fontFamily: col === "sku" ? "monospace" : undefined }}>{r[col] ?? ""}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button onClick={onNext} disabled={rows.length === 0 || !!parseError}
          style={{ ...btnPrimary, opacity: rows.length === 0 || !!parseError ? 0.5 : 1, cursor: rows.length === 0 || !!parseError ? "not-allowed" : "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}>
          Next: Review <ArrowRight size={14} />
        </button>
      </div>
    </div>
  );
}

function Step2Review({ rows, onBack, onConfirm }: { rows: Array<Record<string, string>>; onBack: () => void; onConfirm: () => void }) {
  const skuSet = new Set<string>(); const dupeSkus: string[] = [];
  for (const r of rows) {
    const sku = (r.sku ?? "").trim();
    if (!sku) continue;
    if (skuSet.has(sku)) dupeSkus.push(sku);
    else skuSet.add(sku);
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={cardStyle}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#111827", marginBottom: 12 }}>What will happen</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 13, color: "#374151" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}><CheckCircle2 size={16} color="#10B981" /><span>{rows.length} piece{rows.length !== 1 ? "s" : ""} will be created</span></div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#6B7280", fontSize: 12 }}><FileText size={14} /><span>Category, status, and location names will be matched to your inventory settings</span></div>
          {dupeSkus.length > 0 && (
            <div style={warningBox}>
              <AlertTriangle size={16} color="#92400E" />
              <div>
                <div style={{ fontWeight: 600 }}>{dupeSkus.length} duplicate SKU{dupeSkus.length !== 1 ? "s" : ""} — second occurrence will fail</div>
                <div style={{ fontSize: 11, marginTop: 4, fontFamily: "monospace" }}>{dupeSkus.slice(0, 12).join(", ")}{dupeSkus.length > 12 ? `, +${dupeSkus.length - 12} more` : ""}</div>
              </div>
            </div>
          )}
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <button onClick={onBack} style={{ ...btnSecondary, display: "inline-flex", alignItems: "center", gap: 6 }}><ArrowLeft size={14} /> Back</button>
        <button onClick={onConfirm} style={{ ...btnPrimary, display: "inline-flex", alignItems: "center", gap: 6 }}>Confirm Import <ArrowRight size={14} /></button>
      </div>
    </div>
  );
}

function Step3Results({ importing, progress, result, apiError, onDownloadErrors, onReset }: {
  importing: boolean; progress: number; result: ImportResult | null; apiError: string | null;
  onDownloadErrors: () => void; onReset: () => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={cardStyle}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#111827", marginBottom: 12 }}>
          {importing ? "Importing…" : apiError ? "Import failed" : "Import complete"}
        </div>
        <div style={{ height: 8, borderRadius: 999, background: "#E5E7EB", overflow: "hidden", marginBottom: 16 }}>
          <div style={{ width: `${progress}%`, height: "100%", background: apiError ? "#EF4444" : result ? "#10B981" : "#635BFF", transition: "width .1s linear" }} />
        </div>
        {apiError && <div style={errorBox}>{apiError}</div>}
        {result && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 13 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}><CheckCircle2 size={16} color="#10B981" /><span style={{ color: "#374151" }}>{result.pieces_imported} piece{result.pieces_imported !== 1 ? "s" : ""} imported</span></div>
            {result.failed > 0 && <div style={{ display: "flex", alignItems: "center", gap: 8 }}><AlertTriangle size={16} color="#EF4444" /><span style={{ color: "#374151" }}>{result.failed} row{result.failed !== 1 ? "s" : ""} failed</span></div>}
          </div>
        )}
      </div>

      {result && result.errors.length > 0 && (
        <div style={cardStyle}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>Errors ({result.errors.length})</div>
            <button onClick={onDownloadErrors} style={{ ...btnSecondary, display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Download size={14} /> Download CSV
            </button>
          </div>
          <div style={{ maxHeight: 320, overflowY: "auto", border: "1px solid #E5E7EB", borderRadius: 8 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead style={{ background: "#F9FAFB", position: "sticky", top: 0 }}>
                <tr>{["Row", "Reason"].map((h) => <th key={h} style={{ padding: "8px 10px", textAlign: "left", fontWeight: 600, color: "#6B7280" }}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {result.errors.map((e, i) => (
                  <tr key={i} style={{ borderTop: "1px solid #F3F4F6" }}>
                    <td style={{ padding: "6px 10px" }}>{e.row}</td>
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
        <Link href="/inventory" style={{ ...btnPrimary, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6 }}>
          Go to Inventory <ArrowRight size={14} />
        </Link>
      </div>
    </div>
  );
}

const pageStyle: React.CSSProperties = { background: "#F9FAFB", minHeight: "100vh" };
const cardStyle: React.CSSProperties = { background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, padding: 20 };
const btnPrimary: React.CSSProperties = { padding: "10px 16px", background: "#111827", color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer" };
const btnSecondary: React.CSSProperties = { padding: "10px 14px", background: "#fff", color: "#374151", border: "1px solid #D1D5DB", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer" };
const errorBox: React.CSSProperties = { padding: 12, background: "#FEE2E2", color: "#991B1B", borderRadius: 8, fontSize: 13 };
const warningBox: React.CSSProperties = { display: "flex", alignItems: "flex-start", gap: 10, padding: 12, background: "#FEF3C7", color: "#92400E", borderRadius: 8, fontSize: 13 };

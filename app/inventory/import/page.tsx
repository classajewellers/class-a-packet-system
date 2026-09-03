"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useUser } from "@/context/UserContext";
import { color, radius, shadow } from "@/lib/theme";
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

  if (roleLoading) return <div style={pageStyle}><div style={{ color: color.textMuted, padding: 40, textAlign: "center" }}>Loading…</div></div>;

  if (!isAdmin) return (
    <div style={pageStyle}>
      <div style={{ maxWidth: 480, margin: "80px auto", padding: 32, background: color.white, borderRadius: radius.lg, border: `1px solid ${color.line}`, boxShadow: shadow.card, textAlign: "center" }}>
        <AlertTriangle size={36} color={color.dotWarning} style={{ marginBottom: 12 }} />
        <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", color: color.ink, margin: "0 0 8px 0" }}>Access denied</h1>
        <p style={{ color: color.textMuted, fontSize: 14, margin: 0 }}>Importing inventory is restricted to administrators.</p>
      </div>
    </div>
  );

  return (
    <div style={pageStyle}>
      <div style={{ maxWidth: 860, margin: "0 auto", padding: 24 }}>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 32, fontWeight: 700, letterSpacing: "-0.03em", margin: 0, color: color.ink }}>Import Inventory</h1>
          <p style={{ color: color.textMuted, fontSize: 14, margin: "4px 0 0 0" }}>
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
    <div style={{ display: "flex", alignItems: "center", background: color.white, border: `1px solid ${color.line}`, borderRadius: radius.lg, boxShadow: shadow.card, padding: "16px 24px" }}>
      {labels.map((label, i) => {
        const n = (i + 1) as Step;
        const isActive = step === n; const isComplete = step > n;
        const bg = isComplete ? color.dotSuccess : isActive ? color.ink : color.fill;
        const fg = isComplete || isActive ? color.white : color.textFaint;
        return (
          <div key={label} style={{ display: "flex", alignItems: "center", flex: i === labels.length - 1 ? "0" : "1" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: "50%", background: bg, color: fg, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 14, flexShrink: 0 }}>
                {isComplete ? <CheckCircle2 size={18} /> : n}
              </div>
              <span style={{ fontSize: 13, fontWeight: 600, color: isActive ? color.ink : isComplete ? color.dotSuccess : color.textFaint }}>{label}</span>
            </div>
            {i < labels.length - 1 && (
              <div style={{ flex: 1, height: 2, margin: "0 16px", background: isComplete ? color.dotSuccess : color.line }} />
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
        style={{ border: `2px dashed ${dragOver ? color.ink : color.line}`, background: dragOver ? color.fill : color.paper, borderRadius: radius.lg, padding: 40, textAlign: "center", cursor: "pointer" }}
      >
        <Upload size={36} color={color.ink} style={{ marginBottom: 12 }} />
        <div style={{ fontSize: 15, fontWeight: 600, color: color.ink, marginBottom: 4 }}>
          {fileName || "Drop a CSV file here, or click to select"}
        </div>
        <div style={{ fontSize: 12, color: color.textMuted }}>Columns: sku, title, category, status, location, metal_type, metal_karat, metal_colour, finger_size, cost_price, retail_price, notes, supplier_code</div>
        <input ref={fileInputRef} type="file" accept=".csv,text/csv" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }} style={{ display: "none" }} />
      </div>

      {parseError && <div style={errorBox}>{parseError}</div>}

      {rows.length > 0 && !parseError && (
        <div style={cardStyle}>
          <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", color: color.ink, marginBottom: 12 }}>{rows.length} row{rows.length !== 1 ? "s" : ""} found</div>
          {preview.length > 0 && (
            <div style={{ overflowX: "auto", border: `1px solid ${color.line}`, borderRadius: radius.md }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead style={{ background: color.white }}>
                  <tr>{previewCols.map((h) => <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontFamily: "var(--font-mono)", fontWeight: 500, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em", color: color.textMuted, whiteSpace: "nowrap", borderBottom: `1px solid ${color.line}` }}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {preview.map((r, i) => (
                    <tr key={i} style={{ borderTop: `1px solid ${color.line}` }}>
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
        <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", color: color.ink, marginBottom: 12 }}>What will happen</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 13, color: color.text }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}><CheckCircle2 size={16} color={color.dotSuccess} /><span>{rows.length} piece{rows.length !== 1 ? "s" : ""} will be created</span></div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: color.textMuted, fontSize: 12 }}><FileText size={14} /><span>Category, status, and location names will be matched to your inventory settings</span></div>
          {dupeSkus.length > 0 && (
            <div style={warningBox}>
              <AlertTriangle size={16} color={color.dotWarning} />
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
        <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", color: color.ink, marginBottom: 12 }}>
          {importing ? "Importing…" : apiError ? "Import failed" : "Import complete"}
        </div>
        <div style={{ height: 8, borderRadius: radius.pill, background: color.fill, overflow: "hidden", marginBottom: 16 }}>
          <div style={{ width: `${progress}%`, height: "100%", background: apiError ? color.danger : result ? color.dotSuccess : color.ink, transition: "width .1s linear" }} />
        </div>
        {apiError && <div style={errorBox}>{apiError}</div>}
        {result && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 13 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}><CheckCircle2 size={16} color={color.dotSuccess} /><span style={{ color: color.text }}>{result.pieces_imported} piece{result.pieces_imported !== 1 ? "s" : ""} imported</span></div>
            {result.failed > 0 && <div style={{ display: "flex", alignItems: "center", gap: 8 }}><AlertTriangle size={16} color={color.danger} /><span style={{ color: color.text }}>{result.failed} row{result.failed !== 1 ? "s" : ""} failed</span></div>}
          </div>
        )}
      </div>

      {result && result.errors.length > 0 && (
        <div style={cardStyle}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", color: color.ink }}>Errors ({result.errors.length})</div>
            <button onClick={onDownloadErrors} style={{ ...btnSecondary, display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Download size={14} /> Download CSV
            </button>
          </div>
          <div style={{ maxHeight: 320, overflowY: "auto", border: `1px solid ${color.line}`, borderRadius: radius.md }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead style={{ background: color.white, position: "sticky", top: 0 }}>
                <tr>{["Row", "Reason"].map((h) => <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontFamily: "var(--font-mono)", fontWeight: 500, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em", color: color.textMuted, borderBottom: `1px solid ${color.line}` }}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {result.errors.map((e, i) => (
                  <tr key={i} style={{ borderTop: `1px solid ${color.line}` }}>
                    <td style={{ padding: "6px 10px" }}>{e.row}</td>
                    <td style={{ padding: "6px 10px", color: color.danger }}>{e.reason}</td>
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

const pageStyle: React.CSSProperties = { background: color.paper, minHeight: "100vh" };
const cardStyle: React.CSSProperties = { background: color.white, border: `1px solid ${color.line}`, borderRadius: radius.lg, boxShadow: shadow.card, padding: 20 };
const btnPrimary: React.CSSProperties = { padding: "10px 18px", background: color.ink, color: color.white, border: "none", borderRadius: radius.pill, fontSize: 14, fontWeight: 500, cursor: "pointer" };
const btnSecondary: React.CSSProperties = { padding: "10px 18px", background: color.white, color: color.ink, border: `1px solid ${color.line}`, borderRadius: radius.pill, fontSize: 14, fontWeight: 500, cursor: "pointer" };
const errorBox: React.CSSProperties = { padding: 12, background: color.dangerBg, color: color.danger, borderRadius: radius.md, fontSize: 13 };
const warningBox: React.CSSProperties = { display: "flex", alignItems: "flex-start", gap: 10, padding: 12, background: color.fill, color: color.text, borderRadius: radius.md, fontSize: 13 };

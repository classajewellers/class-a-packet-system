"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useUser } from "@/context/UserContext";
import { canManage } from "@/lib/userTypes";
import { Upload, FileText, CheckCircle2, AlertTriangle, ArrowRight, ArrowLeft, RefreshCw, SkipForward } from "lucide-react";

// ── CSV parser (identical to product importer) ────────────────────────────────

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

// ── Column detection (mirrors server-side alias map) ─────────────────────────

const FIELD_ALIASES: Record<string, string[]> = {
  name:           ["name", "supplier_name", "supplier", "contactname", "company", "business_name", "organisation"],
  email:          ["email", "emailaddress", "email_address"],
  phone:          ["phone", "phonenumber", "phone_number", "telephone", "tel", "mobile"],
  contact_name:   ["contact_name", "contact", "account_manager", "first name", "firstname"],
  notes:          ["notes", "note"],
  lead_time_days: ["lead_time_days", "lead_time"],
};

const FIELD_LABELS: Record<string, string> = {
  name:           "Supplier Name",
  email:          "Email",
  phone:          "Phone",
  contact_name:   "Contact Name",
  notes:          "Notes",
  lead_time_days: "Lead Time (days)",
};

function detectMappings(rows: Array<Record<string, string>>): Record<string, string | null> {
  // Returns vault-field → csv-header-that-matched (or null if not found)
  const detections: Record<string, string | null> = {};
  if (rows.length === 0) return detections;
  const headers = Object.keys(rows[0]);
  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    detections[field] = null;
    for (const alias of aliases) {
      const match = headers.find((h) => h.trim().toLowerCase() === alias.toLowerCase());
      if (match) { detections[field] = match; break; }
    }
  }
  return detections;
}

function extractMapped(row: Record<string, string>, mappings: Record<string, string | null>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [field, header] of Object.entries(mappings)) {
    if (header) out[field] = row[header] ?? "";
  }
  return out;
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface ImportResult {
  created: number;
  skipped: Array<{ row: number; name: string; reason: string }>;
  errors:  Array<{ row: number; reason: string }>;
  failed:  number;
}

type Step = 1 | 2 | 3;

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ImportSuppliersPage() {
  const { user, hydrated } = useUser();
  const isManager = canManage(user?.role);

  const [step, setStep]           = useState<Step>(1);
  const [fileName, setFileName]   = useState("");
  const [rows, setRows]           = useState<Array<Record<string, string>>>([]);
  const [mappings, setMappings]   = useState<Record<string, string | null>>({});
  const [parseError, setParseError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress]   = useState(0);
  const [result, setResult]       = useState<ImportResult | null>(null);
  const [apiError, setApiError]   = useState<string | null>(null);
  const [dragOver, setDragOver]   = useState(false);
  const fileInputRef              = useRef<HTMLInputElement | null>(null);

  const handleFile = async (file: File) => {
    setParseError(null); setResult(null); setApiError(null);
    setFileName(file.name);
    try {
      const text   = await file.text();
      const parsed = parseCSV(text);
      if (parsed.length === 0) { setParseError("CSV contained no data rows."); setRows([]); return; }
      setRows(parsed);
      setMappings(detectMappings(parsed));
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
      setProgress(Math.min(95, ((Date.now() - startTs) / 1500) * 100));
    }, 50);
    try {
      const res  = await fetch("/api/inventory/suppliers/import", {
        method:  "POST",
        headers: { "Content-Type": "application/json", "x-tenant-id": user?.tenantId ?? "" },
        body:    JSON.stringify({ rows }),
      });
      const json = await res.json();
      if (!res.ok || json.error) setApiError(json.error || `Failed (${res.status})`);
      else setResult(json as ImportResult);
    } catch (err) { setApiError(String(err)); }
    finally { clearInterval(timer); setProgress(100); setImporting(false); }
  };

  const reset = () => {
    setStep(1); setFileName(""); setRows([]); setMappings({});
    setParseError(null); setResult(null); setApiError(null); setProgress(0);
  };

  if (!hydrated) return null;

  if (!isManager) return (
    <div style={pageStyle}>
      <div style={{ maxWidth: 480, margin: "80px auto", padding: 32, background: "#fff", borderRadius: 12, border: "1px solid #E5E7EB", textAlign: "center" }}>
        <AlertTriangle size={36} color="#F59E0B" style={{ marginBottom: 12 }} />
        <h1 style={{ fontSize: 20, fontWeight: 700, color: "#111827", margin: "0 0 8px 0" }}>Access denied</h1>
        <p style={{ color: "#6B7280", fontSize: 14, margin: 0 }}>Importing suppliers requires manager access.</p>
      </div>
    </div>
  );

  return (
    <div style={pageStyle}>
      <div style={{ maxWidth: 860, margin: "0 auto", padding: 24 }}>
        <div style={{ marginBottom: 24 }}>
          <Link href="/inventory/suppliers" style={{ fontSize: 13, color: "#635BFF", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4, marginBottom: 10 }}>
            ← Back to Suppliers
          </Link>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, color: "#111827" }}>Import Suppliers</h1>
          <p style={{ color: "#6B7280", fontSize: 14, margin: "4px 0 0 0" }}>
            Upload a CSV to bulk-create suppliers. Works with Xero contact exports and any CSV with a name/email/phone column.
          </p>
        </div>

        <StepIndicator step={step} />

        <div style={{ marginTop: 24 }}>
          {step === 1 && (
            <Step1Upload
              fileName={fileName} rows={rows} mappings={mappings} parseError={parseError}
              dragOver={dragOver} setDragOver={setDragOver}
              fileInputRef={fileInputRef} onFile={handleFile} onDrop={onDrop}
              onNext={() => setStep(2)}
            />
          )}
          {step === 2 && (
            <Step2Review rows={rows} mappings={mappings} onBack={() => setStep(1)} onConfirm={runImport} />
          )}
          {step === 3 && (
            <Step3Results
              importing={importing} progress={progress} result={result} apiError={apiError}
              onReset={reset}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Step indicator ────────────────────────────────────────────────────────────

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
          <div key={label} style={{ display: "flex", alignItems: "center", flex: i < labels.length - 1 ? "1" : "0" }}>
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

// ── Step 1: Upload ────────────────────────────────────────────────────────────

function Step1Upload({ fileName, rows, mappings, parseError, dragOver, setDragOver, fileInputRef, onFile, onDrop, onNext }: {
  fileName: string;
  rows: Array<Record<string, string>>;
  mappings: Record<string, string | null>;
  parseError: string | null;
  dragOver: boolean;
  setDragOver: (v: boolean) => void;
  fileInputRef: React.MutableRefObject<HTMLInputElement | null>;
  onFile: (f: File) => void;
  onDrop: (e: React.DragEvent) => void;
  onNext: () => void;
}) {
  const detectedFields = Object.entries(mappings).filter(([, h]) => h !== null);
  const preview = rows.slice(0, 6);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Drop zone */}
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
        <div style={{ fontSize: 12, color: "#6B7280" }}>
          Xero: ContactName, EmailAddress, PhoneNumber are recognised automatically. Extra columns are ignored.
        </div>
        <input
          ref={fileInputRef} type="file" accept=".csv,text/csv"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }}
          style={{ display: "none" }}
        />
      </div>

      {parseError && <div style={errorBox}>{parseError}</div>}

      {rows.length > 0 && !parseError && (
        <>
          {/* Detected column mapping */}
          <div style={cardStyle}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#111827", marginBottom: 12 }}>
              {rows.length} row{rows.length !== 1 ? "s" : ""} found · Column mapping detected
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 8 }}>
              {Object.entries(FIELD_LABELS).map(([field, label]) => {
                const header = mappings[field];
                const found  = header !== null && header !== undefined;
                return (
                  <div key={field} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 8, background: found ? "#F0FDF4" : "#F9FAFB", border: `1px solid ${found ? "#A7F3D0" : "#E5E7EB"}` }}>
                    {found
                      ? <CheckCircle2 size={14} color="#10B981" style={{ flexShrink: 0 }} />
                      : <div style={{ width: 14, height: 14, borderRadius: "50%", border: "2px solid #D1D5DB", flexShrink: 0 }} />
                    }
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: found ? "#065F46" : "#9CA3AF" }}>{label}</div>
                      {found && <div style={{ fontSize: 11, color: "#6B7280", fontFamily: "monospace" }}>{header}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
            {detectedFields.length === 0 && (
              <div style={{ marginTop: 12, ...warningBox }}>
                <AlertTriangle size={16} color="#92400E" />
                <span>No recognised columns found. Ensure the file has a column with a supplier name (e.g. ContactName, name, supplier).</span>
              </div>
            )}
          </div>

          {/* Mapped data preview */}
          {detectedFields.length > 0 && (
            <div style={cardStyle}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 10 }}>Preview (first {preview.length} rows — mapped data only)</div>
              <div style={{ overflowX: "auto", border: "1px solid #E5E7EB", borderRadius: 8 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead style={{ background: "#F9FAFB" }}>
                    <tr>
                      {detectedFields.map(([field, header]) => (
                        <th key={field} style={{ padding: "8px 10px", textAlign: "left", fontWeight: 600, color: "#6B7280", whiteSpace: "nowrap" }}>
                          {FIELD_LABELS[field]}
                          <div style={{ fontSize: 10, fontFamily: "monospace", fontWeight: 400, color: "#9CA3AF" }}>{header}</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((row, i) => {
                      const mapped = extractMapped(row, mappings);
                      return (
                        <tr key={i} style={{ borderTop: "1px solid #F3F4F6" }}>
                          {detectedFields.map(([field]) => (
                            <td key={field} style={{ padding: "6px 10px", color: mapped[field] ? "#111827" : "#D1D5DB" }}>
                              {mapped[field] || "—"}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button
          onClick={onNext}
          disabled={rows.length === 0 || !!parseError || detectedFields.length === 0}
          style={{ ...btnPrimary, opacity: rows.length === 0 || !!parseError || detectedFields.length === 0 ? 0.5 : 1, cursor: rows.length === 0 || !!parseError || detectedFields.length === 0 ? "not-allowed" : "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}
        >
          Next: Review <ArrowRight size={14} />
        </button>
      </div>
    </div>
  );
}

// ── Step 2: Review ────────────────────────────────────────────────────────────

function Step2Review({ rows, mappings, onBack, onConfirm }: {
  rows: Array<Record<string, string>>;
  mappings: Record<string, string | null>;
  onBack: () => void;
  onConfirm: () => void;
}) {
  const detectedFields = Object.entries(mappings).filter(([, h]) => h !== null);

  // Count rows with a blank name field (will become errors on import)
  const nameHeader = mappings.name;
  const blankNames = nameHeader
    ? rows.filter((r) => !(r[nameHeader] ?? "").trim()).length
    : rows.length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={cardStyle}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#111827", marginBottom: 12 }}>What will happen</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 13, color: "#374151" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <CheckCircle2 size={16} color="#10B981" />
            <span>{rows.length} row{rows.length !== 1 ? "s" : ""} will be processed</span>
          </div>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 8, color: "#6B7280", fontSize: 12 }}>
            <FileText size={14} style={{ marginTop: 1, flexShrink: 0 }} />
            <span>
              {detectedFields.length} field{detectedFields.length !== 1 ? "s" : ""} mapped:{" "}
              {detectedFields.map(([f]) => FIELD_LABELS[f]).join(", ")}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 8, color: "#6B7280", fontSize: 12 }}>
            <SkipForward size={14} style={{ marginTop: 1, flexShrink: 0 }} />
            <span>Suppliers whose name already exists in Vault will be skipped, not duplicated</span>
          </div>
          {blankNames > 0 && (
            <div style={{ display: "flex", alignItems: "flex-start", gap: 8, ...warningBox, marginTop: 4 }}>
              <AlertTriangle size={16} color="#92400E" style={{ flexShrink: 0 }} />
              <div>
                <div style={{ fontWeight: 600 }}>{blankNames} row{blankNames !== 1 ? "s" : ""} have a blank supplier name and will be skipped</div>
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

// ── Step 3: Results ───────────────────────────────────────────────────────────

function Step3Results({ importing, progress, result, apiError, onReset }: {
  importing: boolean;
  progress: number;
  result: ImportResult | null;
  apiError: string | null;
  onReset: () => void;
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
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <CheckCircle2 size={16} color="#10B981" />
              <span style={{ color: "#374151" }}>{result.created} supplier{result.created !== 1 ? "s" : ""} created</span>
            </div>
            {result.skipped.length > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <SkipForward size={16} color="#6B7280" />
                <span style={{ color: "#374151" }}>{result.skipped.length} skipped (already exist)</span>
              </div>
            )}
            {result.failed > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <AlertTriangle size={16} color="#EF4444" />
                <span style={{ color: "#374151" }}>{result.failed} row{result.failed !== 1 ? "s" : ""} failed</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Skipped rows (duplicates) */}
      {result && result.skipped.length > 0 && (
        <div style={cardStyle}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#111827", marginBottom: 12 }}>
            Skipped — already in Vault ({result.skipped.length})
          </div>
          <div style={{ maxHeight: 280, overflowY: "auto", border: "1px solid #E5E7EB", borderRadius: 8 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead style={{ background: "#F9FAFB", position: "sticky", top: 0 }}>
                <tr>
                  {["Row", "Supplier Name", "Reason"].map((h) => (
                    <th key={h} style={{ padding: "8px 10px", textAlign: "left", fontWeight: 600, color: "#6B7280" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.skipped.map((s, i) => (
                  <tr key={i} style={{ borderTop: "1px solid #F3F4F6" }}>
                    <td style={{ padding: "6px 10px", color: "#9CA3AF" }}>{s.row}</td>
                    <td style={{ padding: "6px 10px", fontWeight: 500, color: "#374151" }}>{s.name}</td>
                    <td style={{ padding: "6px 10px", color: "#6B7280" }}>{s.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Errors (failed rows) */}
      {result && result.errors.length > 0 && (
        <div style={cardStyle}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#111827", marginBottom: 12 }}>
            Errors ({result.errors.length})
          </div>
          <div style={{ maxHeight: 280, overflowY: "auto", border: "1px solid #E5E7EB", borderRadius: 8 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead style={{ background: "#F9FAFB", position: "sticky", top: 0 }}>
                <tr>
                  {["Row", "Reason"].map((h) => (
                    <th key={h} style={{ padding: "8px 10px", textAlign: "left", fontWeight: 600, color: "#6B7280" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.errors.map((e, i) => (
                  <tr key={i} style={{ borderTop: "1px solid #F3F4F6" }}>
                    <td style={{ padding: "6px 10px", color: "#9CA3AF" }}>{e.row}</td>
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
        <Link
          href="/inventory/suppliers"
          style={{ ...btnPrimary, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6 }}
        >
          Go to Suppliers <ArrowRight size={14} />
        </Link>
      </div>
    </div>
  );
}

// ── Shared styles ─────────────────────────────────────────────────────────────

const pageStyle:    React.CSSProperties = { background: "#F9FAFB", minHeight: "100vh" };
const cardStyle:    React.CSSProperties = { background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, padding: 20 };
const btnPrimary:   React.CSSProperties = { padding: "10px 16px", background: "#111827", color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer" };
const btnSecondary: React.CSSProperties = { padding: "10px 14px", background: "#fff", color: "#374151", border: "1px solid #D1D5DB", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer" };
const errorBox:     React.CSSProperties = { padding: 12, background: "#FEE2E2", color: "#991B1B", borderRadius: 8, fontSize: 13 };
const warningBox:   React.CSSProperties = { display: "flex", alignItems: "flex-start", gap: 10, padding: 12, background: "#FEF3C7", color: "#92400E", borderRadius: 8, fontSize: 13 };

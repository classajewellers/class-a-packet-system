"use client";

import { useState, useRef } from "react";
import { useUser } from "@/context/UserContext";
import { canManage } from "@/lib/userTypes";
import { color, radius, shadow, font } from "@/lib/theme";
import StatusBadge from "@/components/StatusBadge";

interface ImportRow {
  row_number:            number;
  name:                  string;
  collection:            string | null;
  category_raw:          string | null;
  category_id:           string | null;
  category_matched_name: string | null;
  design:                string | null;
  style:                 string | null;
  setting_type:          string | null;
  dup_confidence:        "exact" | "fuzzy" | "none";
  dup_existing_name:     string | null;
  flagged:               boolean;
  flag_reasons:          string[];
}

type Step = "upload" | "extracting" | "review" | "confirming" | "done";

interface ConfirmResult {
  created:       number;
  created_names: string[];
  skipped:       { name: string; reason: string }[];
}

export default function ProductsImportPage() {
  const { user } = useUser();

  const [step, setStep]         = useState<Step>("upload");
  const [file, setFile]         = useState<File | null>(null);
  const [isDragging, setDrag]   = useState(false);
  const fileInputRef            = useRef<HTMLInputElement>(null);

  const [error, setError]       = useState<string | null>(null);
  const [rows, setRows]         = useState<ImportRow[]>([]);
  const [checked, setChecked]   = useState<Record<number, boolean>>({});
  const [result, setResult]     = useState<ConfirmResult | null>(null);

  if (!user) return null;
  if (!canManage(user.role)) {
    return (
      <div style={{ maxWidth: 560, margin: "60px auto", padding: "0 20px", color: color.textMuted, fontSize: 15 }}>
        Bulk product import is available to managers only.
      </div>
    );
  }

  function pickFile(f: FileList | null) {
    if (!f || f.length === 0) return;
    const chosen = Array.from(f).find(x => /\.(csv|xlsx|xls)$/i.test(x.name));
    if (chosen) { setFile(chosen); setError(null); }
    else setError("Choose a .csv or .xlsx file");
  }

  async function runExtract() {
    if (!file) { setError("Choose a file first"); return; }
    setError(null);
    setStep("extracting");

    const fd = new FormData();
    fd.append("file", file);

    try {
      const res  = await fetch("/api/inventory/products-import/extract", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Extraction failed"); setStep("upload"); return; }

      const r: ImportRow[] = json.rows ?? [];
      setRows(r);
      // Default: create non-duplicates; leave flagged duplicates unchecked.
      const init: Record<number, boolean> = {};
      r.forEach(row => { init[row.row_number] = row.dup_confidence === "none"; });
      setChecked(init);
      setStep("review");
    } catch {
      setError("Network error during extraction");
      setStep("upload");
    }
  }

  function toCreateCount() { return rows.filter(r => checked[r.row_number]).length; }

  async function runConfirm() {
    setError(null);
    setStep("confirming");

    const payload = rows
      .filter(r => checked[r.row_number])
      .map(r => ({
        name:         r.name,
        collection:   r.collection,
        category_raw: r.category_raw,
        category_id:  r.category_id,
        design:       r.design,
        style:        r.style,
        setting_type: r.setting_type,
        force_create: r.dup_confidence !== "none", // user chose to create a flagged dup
      }));

    try {
      const res  = await fetch("/api/inventory/products-import/confirm", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ rows: payload }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Import failed"); setStep("review"); return; }
      setResult(json);
      setStep("done");
    } catch {
      setError("Network error during import");
      setStep("review");
    }
  }

  // ── Styles ──────────────────────────────────────────────────────────────
  const th: React.CSSProperties = { padding: "8px 12px", fontFamily: font.mono, fontSize: 11, fontWeight: 500, color: color.textMuted, textTransform: "uppercase", letterSpacing: "0.05em", background: color.white, textAlign: "left", borderBottom: `1px solid ${color.line}`, whiteSpace: "nowrap" };
  const td: React.CSSProperties = { padding: "8px 12px", fontSize: 13, color: color.ink, borderBottom: `1px solid ${color.line}`, verticalAlign: "top" };

  const dupBadge = (c: ImportRow["dup_confidence"]) => {
    if (c === "none") return <StatusBadge tone="success" label="New" />;
    return c === "exact"
      ? <StatusBadge tone="danger" label="Duplicate" />
      : <StatusBadge tone="warning" label="Possible dup" />;
  };

  // ── Upload ──────────────────────────────────────────────────────────────
  if (step === "upload") return (
    <div style={{ maxWidth: 640, margin: "40px auto", padding: "0 20px" }}>
      <h1 style={{ fontSize: 32, fontWeight: 700, letterSpacing: "-0.03em", color: color.ink, marginBottom: 8 }}>Bulk Import Products</h1>
      <p style={{ color: color.textMuted, fontSize: 14, marginBottom: 24 }}>
        Create new Designs from a CSV or spreadsheet. Needs a product-name column; collection, category, design, style and setting type are picked up automatically when present. Existing products are never modified.
      </p>

      {error && <div style={{ background: color.dangerBg, border: `1px solid ${color.danger}44`, borderRadius: radius.md, padding: "12px 16px", marginBottom: 20, color: color.danger, fontSize: 14 }}>{error}</div>}

      <div
        onDragEnter={e => { e.preventDefault(); setDrag(true); }}
        onDragOver={e => { e.preventDefault(); }}
        onDragLeave={() => setDrag(false)}
        onDrop={e => { e.preventDefault(); setDrag(false); pickFile(e.dataTransfer.files); }}
        onClick={() => fileInputRef.current?.click()}
        style={{ border: `2px dashed ${isDragging ? color.ink : color.line}`, borderRadius: radius.lg, padding: "32px 20px", textAlign: "center", cursor: "pointer", background: isDragging ? color.fill : color.paper, marginBottom: 20 }}
      >
        <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" style={{ display: "none" }} onChange={e => pickFile(e.target.files)} />
        <div style={{ color: color.textFaint, fontSize: 14 }}>{file ? file.name : "Drop a .csv / .xlsx here, or click to browse"}</div>
      </div>

      <button onClick={runExtract} disabled={!file}
        style={{ background: file ? color.ink : color.fill, color: file ? "#fff" : color.textFaint, border: "none", borderRadius: radius.pill, padding: "11px 28px", fontSize: 14, fontWeight: 500, cursor: file ? "pointer" : "not-allowed" }}>
        Extract &amp; Preview
      </button>
    </div>
  );

  if (step === "extracting") return <div style={{ maxWidth: 640, margin: "80px auto", textAlign: "center", color: color.textMuted, fontSize: 15 }}>Reading file and checking for duplicates…</div>;

  // ── Review ──────────────────────────────────────────────────────────────
  if (step === "review") {
    const dupCount = rows.filter(r => r.dup_confidence !== "none").length;
    return (
      <div style={{ padding: "32px 24px", maxWidth: 1300, margin: "0 auto" }}>
        <h1 style={{ fontSize: 32, fontWeight: 700, letterSpacing: "-0.03em", color: color.ink, margin: "0 0 8px" }}>Review — {rows.length} rows</h1>
        <div style={{ display: "flex", gap: 16, marginBottom: 20, flexWrap: "wrap", fontSize: 13 }}>
          <span style={{ color: color.dotSuccess, fontWeight: 500 }}>{toCreateCount()} selected to create</span>
          {dupCount > 0 && <span style={{ color: color.dotWarning, fontWeight: 500 }}>{dupCount} flagged as possible duplicates (unchecked by default)</span>}
        </div>

        {error && <div style={{ background: color.dangerBg, border: `1px solid ${color.danger}44`, borderRadius: radius.md, padding: "12px 16px", marginBottom: 16, color: color.danger, fontSize: 14 }}>{error}</div>}

        <div style={{ overflowX: "auto", marginBottom: 20 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", background: color.white, border: `1px solid ${color.line}`, borderRadius: radius.lg }}>
            <thead><tr>
              <th style={th}>Create</th><th style={th}>Name</th><th style={th}>Collection</th>
              <th style={th}>Category</th><th style={th}>Design</th><th style={th}>Style</th>
              <th style={th}>Setting</th><th style={th}>Status</th><th style={th}>Notes</th>
            </tr></thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.row_number} style={{ background: row.flagged ? color.fill : color.white }}>
                  <td style={td}>
                    <input type="checkbox" checked={!!checked[row.row_number]}
                      onChange={e => setChecked(prev => ({ ...prev, [row.row_number]: e.target.checked }))} />
                  </td>
                  <td style={{ ...td, fontWeight: 500 }}>{row.name}</td>
                  <td style={td}>{row.collection ?? "—"}</td>
                  <td style={td}>
                    {row.category_raw ?? "—"}
                    {row.category_raw && (
                      row.category_matched_name
                        ? <div style={{ color: color.dotSuccess, fontSize: 11 }}>→ linked</div>
                        : <div style={{ color: color.dotWarning, fontSize: 11 }}>not found — text only</div>
                    )}
                  </td>
                  <td style={td}>{row.design ?? "—"}</td>
                  <td style={td}>{row.style ?? "—"}</td>
                  <td style={td}>{row.setting_type ?? "—"}</td>
                  <td style={td}>{dupBadge(row.dup_confidence)}</td>
                  <td style={td}>{row.flag_reasons.map((f, i) => <div key={i} style={{ fontSize: 11, color: color.dotWarning, marginBottom: 2 }}>{f}</div>)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ display: "flex", gap: 12 }}>
          <button onClick={() => { setStep("upload"); setRows([]); }}
            style={{ background: color.white, color: color.ink, border: `1px solid ${color.line}`, borderRadius: radius.pill, padding: "10px 22px", fontSize: 14, fontWeight: 500, cursor: "pointer" }}>← Back</button>
          <button onClick={runConfirm} disabled={toCreateCount() === 0}
            style={{ background: toCreateCount() > 0 ? color.ink : color.fill, color: toCreateCount() > 0 ? "#fff" : color.textFaint, border: "none", borderRadius: radius.pill, padding: "10px 28px", fontSize: 14, fontWeight: 500, cursor: toCreateCount() > 0 ? "pointer" : "not-allowed" }}>
            Create {toCreateCount()} products
          </button>
        </div>
      </div>
    );
  }

  if (step === "confirming") return <div style={{ maxWidth: 640, margin: "80px auto", textAlign: "center", color: color.textMuted, fontSize: 15 }}>Creating products…</div>;

  // ── Done ────────────────────────────────────────────────────────────────
  if (step === "done" && result) return (
    <div style={{ maxWidth: 560, margin: "60px auto", padding: "0 20px" }}>
      <div style={{ background: color.white, border: `1px solid ${color.line}`, borderRadius: radius.lg, boxShadow: shadow.card, padding: 28, marginBottom: 24 }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", color: color.ink, marginBottom: 8 }}>
          <span style={{ width: 9, height: 9, borderRadius: "50%", background: color.dotSuccess, flexShrink: 0 }} />
          Import complete
        </div>
        <div style={{ fontSize: 14, color: color.text, lineHeight: 1.7 }}>
          <div><strong>{result.created}</strong> products created</div>
          {result.skipped.length > 0 && <div style={{ marginTop: 8, color: color.dotWarning }}><strong>{result.skipped.length}</strong> skipped</div>}
        </div>
      </div>

      {result.skipped.length > 0 && (
        <div style={{ background: color.white, border: `1px solid ${color.line}`, borderRadius: radius.lg, boxShadow: shadow.card, overflow: "hidden", marginBottom: 24 }}>
          <div style={{ padding: "10px 16px", background: color.fill, fontFamily: font.mono, fontSize: 11, fontWeight: 500, letterSpacing: "0.05em", textTransform: "uppercase", color: color.textMuted }}>Skipped</div>
          {result.skipped.map((s, i) => (
            <div key={i} style={{ padding: "8px 16px", borderTop: `1px solid ${color.line}`, fontSize: 13 }}>
              <span style={{ fontWeight: 500, marginRight: 8, color: color.ink }}>{s.name}</span>
              <span style={{ color: color.textMuted }}>{s.reason}</span>
            </div>
          ))}
        </div>
      )}

      <button onClick={() => { setStep("upload"); setFile(null); setRows([]); setResult(null); }}
        style={{ background: color.ink, color: "#fff", border: "none", borderRadius: radius.pill, padding: "10px 24px", fontSize: 14, fontWeight: 500, cursor: "pointer" }}>
        Import another file
      </button>
    </div>
  );

  return null;
}

"use client";

import { useState, useEffect, useRef } from "react";
import { useUser } from "@/context/UserContext";
import { color, radius, shadow } from "@/lib/theme";
import StatusBadge from "@/components/StatusBadge";

interface Supplier { id: string; name: string; }

interface ExtractRow {
  item_code:           string;
  unit_cost:           number;
  base_code:           string;
  metal_karat:         string | null;
  metal_colour:        string | null;
  grade_code:          string | null;
  stone_origin:        string | null;
  class_a_reference:   string | null;
  design_name_raw:     string | null;
  stone_shape:         string | null;
  stone_carat:         number | null;
  stone_quantity:      number | null;
  matched_design_id:   string | null;
  matched_design_name: string | null;
  match_confidence:    "exact" | "fuzzy" | "none";
  flagged:             boolean;
  flag_reasons:        string[];
}

interface Design { id: string; name: string; }

type Step = "upload" | "extracting" | "review" | "confirming" | "done";

interface ConfirmResult {
  supplier_name: string;
  updated: number;
  inserted: number;
  skipped: { item_code: string; reason: string }[];
}

export default function CatalogImportPage() {
  const { user } = useUser();

  const [step, setStep] = useState<Step>("upload");
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierId, setSupplierId] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [extractError, setExtractError] = useState<string | null>(null);
  const [rows, setRows] = useState<ExtractRow[]>([]);
  const [supplierName, setSupplierName] = useState("");

  // Per-row design assignment overrides (for fuzzy/none matches)
  const [designOverrides, setDesignOverrides] = useState<Record<string, string>>({});
  const [designs, setDesigns] = useState<Design[]>([]);

  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [confirmResult, setConfirmResult] = useState<ConfirmResult | null>(null);

  // Load suppliers
  useEffect(() => {
    if (!user?.tenantId) return;
    fetch("/api/inventory/suppliers", { headers: { "x-tenant-id": user.tenantId } })
      .then(r => r.json())
      .then(j => setSuppliers(j.suppliers ?? []))
      .catch(() => {});
  }, [user?.tenantId]);

  // Load designs for manual assignment dropdown
  useEffect(() => {
    if (!user?.tenantId) return;
    fetch("/api/inventory/products?limit=500", { headers: { "x-tenant-id": user.tenantId } })
      .then(r => r.json())
      .then(j => setDesigns(j.products ?? []))
      .catch(() => {});
  }, [user?.tenantId]);

  function handleFiles(incoming: FileList | File[]) {
    const arr = Array.from(incoming).filter(f =>
      f.name.endsWith(".xlsx") || f.name.endsWith(".xls")
    );
    setFiles(prev => {
      const combined = [...prev, ...arr];
      // Deduplicate by name, keep latest
      const map = new Map<string, File>();
      combined.forEach(f => map.set(f.name, f));
      return Array.from(map.values()).slice(0, 2);
    });
  }

  async function runExtract() {
    if (!supplierId) { setExtractError("Select a supplier first"); return; }
    if (files.length < 2) { setExtractError("Upload exactly two .xlsx files"); return; }

    setExtractError(null);
    setStep("extracting");

    const fd = new FormData();
    fd.append("supplier_id", supplierId);
    files.forEach(f => fd.append("file", f));

    try {
      const res = await fetch("/api/inventory/catalog-import/extract", {
        method: "POST",
        headers: { "x-tenant-id": user?.tenantId ?? "" },
        body: fd,
      });
      const json = await res.json();
      if (!res.ok) { setExtractError(json.error ?? "Extraction failed"); setStep("upload"); return; }

      setRows(json.rows ?? []);
      setSupplierName(json.supplier_name ?? "");
      setDesignOverrides({});
      setStep("review");
    } catch {
      setExtractError("Network error during extraction");
      setStep("upload");
    }
  }

  function resolvedDesignId(row: ExtractRow): string | null {
    return designOverrides[row.item_code] ?? row.matched_design_id;
  }

  function confirmableRows(): ExtractRow[] {
    return rows.filter(r => {
      const did = resolvedDesignId(r);
      return did && r.metal_karat && r.metal_colour;
    });
  }

  async function runConfirm() {
    setConfirmError(null);
    setStep("confirming");

    const payload = confirmableRows().map(r => ({
      item_code:      r.item_code,
      design_id:      resolvedDesignId(r)!,
      metal_karat:    r.metal_karat!,
      metal_colour:   r.metal_colour!,
      stone_origin:   r.stone_origin,
      stone_shape:    r.stone_shape,
      stone_carat:    r.stone_carat,
      stone_quantity: r.stone_quantity,
      unit_cost:      r.unit_cost,
      supplier_id:    supplierId,
    }));

    try {
      const res = await fetch("/api/inventory/catalog-import/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-tenant-id": user?.tenantId ?? "" },
        body: JSON.stringify({ supplier_id: supplierId, rows: payload }),
      });
      const json = await res.json();
      if (!res.ok) { setConfirmError(json.error ?? "Import failed"); setStep("review"); return; }
      setConfirmResult(json);
      setStep("done");
    } catch {
      setConfirmError("Network error during import");
      setStep("review");
    }
  }

  // ── Styles ────────────────────────────────────────────────────────────────

  const badge = (conf: ExtractRow["match_confidence"]) => {
    const map = { exact: ["success", "Exact"], fuzzy: ["warning", "Fuzzy"], none: ["danger", "No match"] } as const;
    const [tone, label] = map[conf];
    return <StatusBadge tone={tone} label={label} />;
  };

  const th: React.CSSProperties = { padding: "10px 12px", fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 500, color: color.textMuted, textTransform: "uppercase", letterSpacing: "0.05em", background: color.white, textAlign: "left", borderBottom: `1px solid ${color.line}`, whiteSpace: "nowrap" };
  const td: React.CSSProperties = { padding: "12px", fontSize: 13, color: color.ink, borderBottom: `1px solid ${color.line}`, verticalAlign: "top" };

  if (!user) return null;

  // ── Upload step ──────────────────────────────────────────────────────────

  if (step === "upload") return (
    <div style={{ maxWidth: 640, margin: "40px auto", padding: "0 20px" }}>
      <h1 style={{ fontSize: 32, fontWeight: 700, letterSpacing: "-0.03em", color: color.ink, marginBottom: 4 }}>Supplier Catalog Import</h1>
      <p style={{ color: color.textMuted, fontSize: 14, marginBottom: 28 }}>
        Upload a price file and design list (.xlsx) to import supplier variants and costs.
      </p>

      {extractError && (
        <div style={{ background: color.dangerBg, border: `1px solid ${color.danger}`, borderRadius: radius.md, padding: "12px 16px", marginBottom: 20, color: color.danger, fontSize: 14 }}>
          {extractError}
        </div>
      )}

      <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: color.text, marginBottom: 6 }}>Supplier</label>
      <select
        value={supplierId}
        onChange={e => setSupplierId(e.target.value)}
        style={{ width: "100%", padding: "9px 12px", border: `1px solid ${color.line}`, borderRadius: radius.md, fontSize: 14, marginBottom: 24, color: color.ink, background: color.white }}
      >
        <option value="">Select supplier…</option>
        {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>

      <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: color.text, marginBottom: 6 }}>
        Files <span style={{ color: color.textMuted, fontWeight: 400 }}>— drop both .xlsx files or click to browse</span>
      </label>

      <div
        onDragEnter={e => { e.preventDefault(); setIsDragging(true); }}
        onDragOver={e => { e.preventDefault(); setIsDragging(false); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={e => { e.preventDefault(); setIsDragging(false); handleFiles(e.dataTransfer.files); }}
        onClick={() => fileInputRef.current?.click()}
        style={{
          border: `2px dashed ${isDragging ? color.ink : color.line}`,
          borderRadius: radius.lg,
          padding: "32px 20px",
          textAlign: "center",
          cursor: "pointer",
          background: isDragging ? color.fill : color.paper,
          marginBottom: 16,
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls"
          multiple
          style={{ display: "none" }}
          onChange={e => { if (e.target.files) handleFiles(e.target.files); }}
        />
        <div style={{ color: color.textFaint, fontSize: 14 }}>
          {files.length === 0
            ? "Drop price file + design list here, or click to browse"
            : files.map(f => f.name).join(" · ")}
        </div>
        {files.length > 0 && files.length < 2 && (
          <div style={{ color: color.dotWarning, fontSize: 12, marginTop: 6 }}>Add the second file</div>
        )}
      </div>

      {files.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          {files.map(f => (
            <div key={f.name} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0" }}>
              <span style={{ fontSize: 13, color: color.text }}>{f.name}</span>
              <button
                onClick={() => setFiles(prev => prev.filter(x => x.name !== f.name))}
                style={{ fontSize: 11, color: color.textFaint, background: "none", border: "none", cursor: "pointer" }}
              >✕</button>
            </div>
          ))}
        </div>
      )}

      <button
        onClick={runExtract}
        disabled={!supplierId || files.length < 2}
        style={{ background: supplierId && files.length >= 2 ? color.ink : color.fill, color: supplierId && files.length >= 2 ? color.white : color.textFaint, border: "none", borderRadius: radius.pill, padding: "11px 28px", fontSize: 14, fontWeight: 500, cursor: supplierId && files.length >= 2 ? "pointer" : "not-allowed" }}
      >
        Extract & Preview
      </button>
    </div>
  );

  // ── Extracting ───────────────────────────────────────────────────────────

  if (step === "extracting") return (
    <div style={{ maxWidth: 640, margin: "80px auto", textAlign: "center", color: color.textMuted, fontSize: 15 }}>
      Reading files and matching designs…
    </div>
  );

  // ── Review step ──────────────────────────────────────────────────────────

  if (step === "review") {
    const confirmable = confirmableRows();
    const skippedCount = rows.length - confirmable.length;
    const flaggedCount = rows.filter(r => r.flagged).length;

    return (
      <div style={{ padding: "32px 24px", maxWidth: 1400, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 16, marginBottom: 6 }}>
          <h1 style={{ fontSize: 32, fontWeight: 700, letterSpacing: "-0.03em", color: color.ink, margin: 0 }}>
            Review — {supplierName}
          </h1>
          <span style={{ fontSize: 13, color: color.textMuted }}>{rows.length} rows extracted</span>
        </div>

        <div style={{ display: "flex", gap: 16, marginBottom: 20, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, color: color.dotSuccess, fontWeight: 500 }}>{confirmable.length} ready to import</span>
          {flaggedCount > 0 && <span style={{ fontSize: 13, color: color.dotWarning, fontWeight: 500 }}>{flaggedCount} flagged</span>}
          {skippedCount > 0 && <span style={{ fontSize: 13, color: color.textMuted }}>{skippedCount} will be skipped (no design assigned)</span>}
        </div>

        {confirmError && (
          <div style={{ background: color.dangerBg, border: `1px solid ${color.danger}`, borderRadius: radius.md, padding: "12px 16px", marginBottom: 16, color: color.danger, fontSize: 14 }}>
            {confirmError}
          </div>
        )}

        <div style={{ overflowX: "auto", marginBottom: 20 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", background: color.white, border: `1px solid ${color.line}`, borderRadius: radius.lg }}>
            <thead>
              <tr>
                <th style={th}>SKU</th>
                <th style={th}>Metal</th>
                <th style={th}>Origin</th>
                <th style={th}>Shape</th>
                <th style={th}>Stone</th>
                <th style={th}>Cost</th>
                <th style={th}>Design match</th>
                <th style={th}>Flags</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => {
                const override = designOverrides[row.item_code];
                const resolvedId = override ?? row.matched_design_id;
                const resolvedName = override
                  ? designs.find(d => d.id === override)?.name ?? override
                  : row.matched_design_name;

                return (
                  <tr key={row.item_code} style={{ background: row.flagged ? color.fill : color.white }}>
                    <td style={td}>
                      <div style={{ fontFamily: "monospace", fontSize: 12 }}>{row.item_code}</div>
                      <div style={{ color: color.textFaint, fontSize: 11 }}>{row.base_code}</div>
                    </td>
                    <td style={td}>
                      {row.metal_karat ?? "—"} {row.metal_colour ?? ""}
                      {row.grade_code && <div style={{ color: color.textFaint, fontSize: 11 }}>{row.grade_code}</div>}
                    </td>
                    <td style={td}>
                      {row.stone_origin
                        ? <span style={{ background: color.fill, color: color.ink, borderRadius: radius.pill, padding: "3px 10px", fontSize: 12, fontWeight: 500 }}>{row.stone_origin}</span>
                        : <span style={{ color: color.textFaint, fontSize: 12 }}>—</span>}
                    </td>
                    <td style={td}>{row.stone_shape ?? "—"}</td>
                    <td style={td}>
                      {row.stone_carat != null && row.stone_quantity != null
                        ? `${row.stone_quantity} × ${row.stone_carat.toFixed(4)}ct`
                        : "—"}
                    </td>
                    <td style={{ ...td, fontVariantNumeric: "tabular-nums" }}>
                      ${row.unit_cost.toFixed(2)}
                    </td>
                    <td style={td}>
                      <div style={{ marginBottom: 4 }}>
                        {badge(override ? "exact" : row.match_confidence)}
                      </div>
                      {(row.match_confidence !== "exact" || override) && (
                        <select
                          value={resolvedId ?? ""}
                          onChange={e => setDesignOverrides(prev => ({
                            ...prev,
                            [row.item_code]: e.target.value || "",
                          }))}
                          style={{ fontSize: 12, borderRadius: radius.md, border: `1px solid ${color.line}`, padding: "3px 6px", width: 180 }}
                        >
                          <option value="">{resolvedName ?? "Select design…"}</option>
                          {designs.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                        </select>
                      )}
                      {row.match_confidence === "exact" && !override && (
                        <div style={{ fontSize: 12, color: color.text }}>{resolvedName}</div>
                      )}
                    </td>
                    <td style={td}>
                      {row.flag_reasons.map((r, i) => (
                        <div key={i} style={{ fontSize: 11, color: color.dotWarning, marginBottom: 2 }}>{r}</div>
                      ))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div style={{ display: "flex", gap: 12 }}>
          <button
            onClick={() => { setStep("upload"); setRows([]); }}
            style={{ background: color.white, color: color.ink, border: `1px solid ${color.line}`, borderRadius: radius.pill, padding: "10px 22px", fontSize: 14, fontWeight: 500, cursor: "pointer" }}
          >
            ← Back
          </button>
          <button
            onClick={runConfirm}
            disabled={confirmable.length === 0}
            style={{ background: confirmable.length > 0 ? color.ink : color.fill, color: confirmable.length > 0 ? color.white : color.textFaint, border: "none", borderRadius: radius.pill, padding: "10px 28px", fontSize: 14, fontWeight: 500, cursor: confirmable.length > 0 ? "pointer" : "not-allowed" }}
          >
            Import {confirmable.length} variants
          </button>
        </div>
      </div>
    );
  }

  // ── Confirming ───────────────────────────────────────────────────────────

  if (step === "confirming") return (
    <div style={{ maxWidth: 640, margin: "80px auto", textAlign: "center", color: color.textMuted, fontSize: 15 }}>
      Writing to database…
    </div>
  );

  // ── Done ─────────────────────────────────────────────────────────────────

  if (step === "done" && confirmResult) return (
    <div style={{ maxWidth: 560, margin: "60px auto", padding: "0 20px" }}>
      <div style={{ background: color.white, border: `1px solid ${color.line}`, borderRadius: radius.lg, boxShadow: shadow.card, padding: 28, marginBottom: 24 }}>
        <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", color: color.ink, marginBottom: 8 }}>Import complete</div>
        <div style={{ fontSize: 14, color: color.text, lineHeight: 1.7 }}>
          <div><strong>{confirmResult.updated}</strong> variants updated</div>
          <div><strong>{confirmResult.inserted}</strong> variants created</div>
          {confirmResult.skipped.length > 0 && (
            <div style={{ marginTop: 8, color: color.dotWarning }}><strong>{confirmResult.skipped.length}</strong> rows skipped</div>
          )}
        </div>
      </div>

      {confirmResult.skipped.length > 0 && (
        <div style={{ background: color.white, border: `1px solid ${color.line}`, borderRadius: radius.lg, overflow: "hidden", marginBottom: 24 }}>
          <div style={{ padding: "10px 16px", background: color.fill, fontSize: 13, fontWeight: 600, color: color.text }}>
            Skipped rows
          </div>
          {confirmResult.skipped.map((s, i) => (
            <div key={i} style={{ padding: "8px 16px", borderTop: `1px solid ${color.line}`, fontSize: 13 }}>
              <span style={{ fontFamily: "monospace", marginRight: 8 }}>{s.item_code}</span>
              <span style={{ color: color.textMuted }}>{s.reason}</span>
            </div>
          ))}
        </div>
      )}

      <button
        onClick={() => { setStep("upload"); setFiles([]); setRows([]); setConfirmResult(null); setSupplierId(""); }}
        style={{ background: color.ink, color: color.white, border: "none", borderRadius: radius.pill, padding: "10px 24px", fontSize: 14, fontWeight: 500, cursor: "pointer" }}
      >
        Import another file
      </button>
    </div>
  );

  return null;
}

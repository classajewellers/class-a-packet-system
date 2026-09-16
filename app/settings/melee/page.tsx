"use client";

import { useEffect, useMemo, useState } from "react";
import { useUser } from "@/context/UserContext";
import { canManage } from "@/lib/userTypes";

interface MeleeStone {
  id: string;
  origin: string | null;
  shape: string | null;
  quality: string | null;      // "<Colour> <Clarity>"
  size_from: number | null;    // nominal carat
  mm: string | null;           // "0.90" or "2.50 x 2.50"
  price_per_carat: number | null;
  price_per_stone: number | null;
  updated_at: string | null;
}

interface MeleeImportRow {
  shape: string; size_type: string; size_label: string;
  size_from: number | null; size_to: number | null; mm: string | null;
  quality: string; price_per_carat: number | null; price_per_stone: number | null;
  flagged: boolean;
}
interface MeleeImportGroup { origin: "natural" | "lab"; rows: MeleeImportRow[] }
interface MeleeImportPreview {
  filename: string;
  stats: {
    totalDataRows: number; parcelsRows: number; droppedNonParcels: number;
    skippedIncomplete: number; unrecognizedOrigin: number; unrecognizedOriginValues: string[];
    rowsToStore: number; qualityMapCombos: number;
    conflicts: Array<{ origin: string; key: string; prices: number[] }>;
  };
  skippedSamples: Array<{ row: number; reason: string }>;
  samples: Record<string, MeleeImportRow[]>;
  payload: { groups: MeleeImportGroup[]; quality_map: Array<{ colour_group: string; clarity: string; quality: string }> };
}

const th: React.CSSProperties = { textAlign: "left", padding: "8px 10px", fontSize: 11, fontWeight: 700, color: "#6B7099", textTransform: "uppercase", letterSpacing: 0.4, borderBottom: "1px solid #E8E8F0", position: "sticky", top: 0, background: "#F9FAFB" };
const td: React.CSSProperties = { padding: "7px 10px", fontSize: 13, color: "#1B1F3B", borderBottom: "1px solid #F1F1F6", whiteSpace: "nowrap" };

function Stat({ label, value, warn, strong }: { label: string; value: number; warn?: boolean; strong?: boolean }) {
  return (
    <div style={{ background: "#fff", border: `1px solid ${warn ? "#FDE68A" : "#E8E8F0"}`, borderRadius: 8, padding: "8px 10px" }}>
      <div style={{ color: "#9CA3AF", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.3 }}>{label}</div>
      <div style={{ fontWeight: strong ? 700 : 600, color: warn ? "#B45309" : "#1B1F3B", fontSize: 15 }}>{value}</div>
    </div>
  );
}

export default function MeleePricingPage() {
  const { user, roleLoading } = useUser();
  const isManager = !roleLoading && canManage(user?.role);

  const [rows, setRows] = useState<MeleeStone[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [originFilter, setOriginFilter] = useState<"all" | "natural" | "lab">("all");
  const [edit, setEdit] = useState<{ id: string; field: "price_per_carat" | "price_per_stone"; value: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const [preview, setPreview] = useState<MeleeImportPreview | null>(null);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);

  function loadRows() {
    if (!user?.tenantId) return;
    setLoading(true);
    fetch("/api/pricing", { headers: { "x-tenant-id": user.tenantId } })
      .then((r) => r.json())
      .then((j) => setRows((j.meleeStones ?? []) as MeleeStone[]))
      .catch(() => setToast("Failed to load melee prices"))
      .finally(() => setLoading(false));
  }

  useEffect(loadRows, [user?.tenantId]);

  async function handleFileSelected(file: File) {
    setPreview(null);
    setParsing(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/pricing/melee-import/parse", { method: "POST", body: fd });
      const j = await res.json();
      if (!res.ok) { setToast(j.error || "Failed to parse CSV"); return; }
      setPreview(j as MeleeImportPreview);
    } catch {
      setToast("Failed to parse CSV");
    } finally {
      setParsing(false);
    }
  }

  async function confirmImport() {
    if (!preview || !user?.tenantId) return;
    setImporting(true);
    try {
      const res = await fetch("/api/pricing/melee-import/confirm", {
        method: "POST",
        headers: { "content-type": "application/json", "x-tenant-id": user.tenantId },
        body: JSON.stringify(preview.payload),
      });
      const j = await res.json();
      if (!res.ok) { setToast(j.error || "Import failed"); return; }
      setToast(`Imported ${j.total_imported} melee prices + ${j.quality_map_imported ?? 0} quality-map entries.`);
      setPreview(null);
      loadRows(); // refreshes the table + "Last import" timestamp from real data
    } catch {
      setToast("Import failed");
    } finally {
      setImporting(false);
    }
  }

  const lastImport = useMemo(() => {
    const ts = rows.map((r) => r.updated_at).filter(Boolean).sort();
    return ts.length ? ts[ts.length - 1] : null;
  }, [rows]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows
      .filter((r) => originFilter === "all" || (r.origin ?? "").toLowerCase() === originFilter)
      .filter((r) => !needle || [r.shape, r.quality, r.mm, r.size_from].map((x) => String(x ?? "").toLowerCase()).some((s) => s.includes(needle)))
      .sort((a, b) =>
        (a.origin ?? "").localeCompare(b.origin ?? "") ||
        (a.shape ?? "").localeCompare(b.shape ?? "") ||
        (Number(a.size_from) - Number(b.size_from)) ||
        (a.mm ?? "").localeCompare(b.mm ?? "") ||
        (a.quality ?? "").localeCompare(b.quality ?? ""));
  }, [rows, q, originFilter]);

  const CAP = 1000;
  const shown = filtered.slice(0, CAP);

  async function saveEdit() {
    if (!edit || !user?.tenantId) return;
    const num = parseFloat(edit.value);
    if (!Number.isFinite(num) || num < 0) { setToast("Enter a valid price"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/pricing/pricing_melee_stones", {
        method: "PATCH",
        headers: { "content-type": "application/json", "x-tenant-id": user.tenantId },
        body: JSON.stringify({ id: edit.id, field: edit.field, value: num }),
      });
      if (!res.ok) { const j = await res.json().catch(() => ({})); setToast(j.error || "Save failed (manager only)"); return; }
      setRows((prev) => prev.map((r) => (r.id === edit.id ? { ...r, [edit.field]: num, updated_at: new Date().toISOString() } : r)));
      setEdit(null);
    } catch {
      setToast("Save failed");
    } finally {
      setSaving(false);
    }
  }

  function priceCell(r: MeleeStone, field: "price_per_carat" | "price_per_stone") {
    const val = r[field];
    const editing = edit && edit.id === r.id && edit.field === field;
    if (editing) {
      return (
        <input
          autoFocus type="number" step="0.01" min="0" value={edit!.value}
          onChange={(e) => setEdit({ ...edit!, value: e.target.value })}
          onKeyDown={(e) => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") setEdit(null); }}
          onBlur={saveEdit}
          disabled={saving}
          style={{ width: 90, padding: "4px 6px", border: "1px solid #635BFF", borderRadius: 6, fontSize: 13 }}
        />
      );
    }
    const display = val != null ? `$${Number(val).toFixed(2)}` : "—";
    if (!isManager) return <span>{display}</span>;
    return (
      <button
        onClick={() => setEdit({ id: r.id, field, value: val != null ? String(val) : "" })}
        title="Edit price (manager)"
        style={{ background: "none", border: "none", cursor: "pointer", color: "#1B1F3B", fontSize: 13, padding: 0, borderBottom: "1px dashed #C4BFFE" }}
      >
        {display}
      </button>
    );
  }

  return (
    <div style={{ padding: "28px 32px", maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#1B1F3B", margin: 0 }}>Melee Pricing</h1>
          <p style={{ fontSize: 13, color: "#6B7099", marginTop: 4 }}>
            Live melee price list — priced by origin, shape, carat, mm, colour + clarity.
            {isManager ? " Click a price to edit." : " View only — ask a manager to edit prices."}
          </p>
        </div>
        <div style={{ fontSize: 12, color: "#6B7099", textAlign: "right" }}>
          <div>{loading ? "Loading…" : `${filtered.length} rows`}</div>
          <div>Last import: <strong style={{ color: "#1B1F3B" }}>{lastImport ? new Date(lastImport).toLocaleString() : "—"}</strong></div>
        </div>
      </div>

      {isManager && (
        <div style={{ marginTop: 16, padding: 16, border: "1px solid #E8E8F0", borderRadius: 10, background: "#F9FAFB" }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: "#1B1F3B", marginBottom: 4 }}>Monthly price-list refresh</div>
          <p style={{ fontSize: 12, color: "#6B7099", margin: "0 0 10px" }}>
            Upload the combined CSV (Origin, Category, Price Mode, Shape, Carat / stone, Colour, Clarity,
            Dimensions (mm), Price / stone (AUD), Price / carat (AUD), Listing ID). This REPLACES the entire
            melee price list for this tenant — review the preview below before confirming.
          </p>
          <input
            type="file" accept=".csv"
            disabled={parsing || importing}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelected(f); e.target.value = ""; }}
            style={{ fontSize: 13 }}
          />
          {parsing && <span style={{ marginLeft: 10, fontSize: 13, color: "#6B7099" }}>Parsing…</span>}

          {preview && (
            <div style={{ marginTop: 14, borderTop: "1px solid #E8E8F0", paddingTop: 14 }}>
              <div style={{ fontWeight: 600, fontSize: 13, color: "#1B1F3B", marginBottom: 8 }}>
                Preview — {preview.filename}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 8, fontSize: 12, marginBottom: 10 }}>
                <Stat label="Data rows" value={preview.stats.totalDataRows} />
                <Stat label="Parcels kept" value={preview.stats.parcelsRows} />
                <Stat label="Dropped (Precised etc.)" value={preview.stats.droppedNonParcels} />
                <Stat label="Skipped (incomplete)" value={preview.stats.skippedIncomplete} />
                <Stat label="Unrecognized origin" value={preview.stats.unrecognizedOrigin} warn={preview.stats.unrecognizedOrigin > 0} />
                <Stat label="Rows to store" value={preview.stats.rowsToStore} strong />
                <Stat label="Quality-map combos" value={preview.stats.qualityMapCombos} />
                <Stat label="Price conflicts" value={preview.stats.conflicts.length} warn={preview.stats.conflicts.length > 0} />
              </div>

              {preview.stats.unrecognizedOriginValues.length > 0 && (
                <div style={{ fontSize: 12, color: "#B45309", background: "#FEF3C7", border: "1px solid #FDE68A", borderRadius: 6, padding: "8px 10px", marginBottom: 10 }}>
                  Unrecognized Origin values (rows skipped): {preview.stats.unrecognizedOriginValues.join(", ")}
                </div>
              )}
              {preview.stats.conflicts.length > 0 && (
                <div style={{ fontSize: 12, color: "#B45309", background: "#FEF3C7", border: "1px solid #FDE68A", borderRadius: 6, padding: "8px 10px", marginBottom: 10 }}>
                  {preview.stats.conflicts.length} row(s) had the same shape+carat+mm+quality with different prices — first price kept for each. Review the source file.
                </div>
              )}
              {preview.skippedSamples.length > 0 && (
                <div style={{ fontSize: 12, color: "#6B7099", marginBottom: 10 }}>
                  Sample skipped rows: {preview.skippedSamples.slice(0, 5).map((s) => `row ${s.row} (${s.reason})`).join("; ")}
                </div>
              )}

              {(["natural", "lab"] as const).map((origin) => {
                const sample = preview.samples[origin];
                if (!sample || sample.length === 0) return null;
                return (
                  <div key={origin} style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#374151", textTransform: "capitalize" }}>{origin} sample rows</div>
                    <div style={{ fontSize: 12, color: "#6B7099", fontFamily: "monospace" }}>
                      {sample.map((r, i) => (
                        <div key={i}>
                          {r.shape} · {r.size_from}ct · {r.mm}mm · {r.quality} · ${r.price_per_carat}/ct (${r.price_per_stone}/stone)
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}

              <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
                <button
                  onClick={confirmImport}
                  disabled={importing || preview.stats.rowsToStore === 0}
                  style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "#635BFF", color: "#fff", fontSize: 13, fontWeight: 600, cursor: importing ? "wait" : "pointer" }}
                >
                  {importing ? "Importing…" : `Confirm — replace melee list with ${preview.stats.rowsToStore} rows`}
                </button>
                <button
                  onClick={() => setPreview(null)}
                  disabled={importing}
                  style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #E8E8F0", background: "#fff", color: "#374151", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <div style={{ display: "flex", gap: 10, margin: "16px 0", flexWrap: "wrap" }}>
        <input
          value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="Search shape, quality, mm, carat…"
          style={{ flex: 1, minWidth: 220, padding: "8px 12px", border: "1px solid #E8E8F0", borderRadius: 8, fontSize: 14 }}
        />
        <select value={originFilter} onChange={(e) => setOriginFilter(e.target.value as "all" | "natural" | "lab")}
          style={{ padding: "8px 12px", border: "1px solid #E8E8F0", borderRadius: 8, fontSize: 14 }}>
          <option value="all">All origins</option>
          <option value="natural">Natural</option>
          <option value="lab">Lab</option>
        </select>
      </div>

      <div style={{ overflowX: "auto", border: "1px solid #E8E8F0", borderRadius: 10, maxHeight: "70vh", overflowY: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 720 }}>
          <thead>
            <tr>
              <th style={th}>Origin</th><th style={th}>Shape</th><th style={th}>Quality</th>
              <th style={th}>Carat</th><th style={th}>mm</th><th style={th}>$/carat</th><th style={th}>$/stone</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id}>
                <td style={{ ...td, textTransform: "capitalize" }}>{r.origin ?? "—"}</td>
                <td style={{ ...td, textTransform: "capitalize" }}>{r.shape ?? "—"}</td>
                <td style={td}>{r.quality ?? "—"}</td>
                <td style={td}>{r.size_from != null ? `${r.size_from}ct` : "—"}</td>
                <td style={td}>{r.mm ?? "—"}</td>
                <td style={td}>{priceCell(r, "price_per_carat")}</td>
                <td style={td}>{priceCell(r, "price_per_stone")}</td>
              </tr>
            ))}
            {!loading && shown.length === 0 && (
              <tr><td style={{ ...td, textAlign: "center", color: "#9CA3AF" }} colSpan={7}>No melee prices found.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {filtered.length > CAP && (
        <p style={{ fontSize: 12, color: "#9CA3AF", marginTop: 8 }}>Showing first {CAP} of {filtered.length} — narrow with search.</p>
      )}

      {toast && (
        <div onClick={() => setToast(null)} style={{ position: "fixed", bottom: 20, left: "50%", transform: "translateX(-50%)", background: "#1B1F3B", color: "#fff", padding: "10px 18px", borderRadius: 8, fontSize: 13, cursor: "pointer", zIndex: 100 }}>
          {toast}
        </div>
      )}
    </div>
  );
}

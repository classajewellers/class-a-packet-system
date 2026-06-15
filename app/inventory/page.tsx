"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/context/UserContext";
import { canManage } from "@/lib/userTypes";
import {
  InventoryPiece,
  InventoryReferenceData,
  InventoryStatus,
} from "@/lib/types";
import { Search, Plus, X, Filter, Sparkles, Loader } from "lucide-react";

const PAGE_SIZE = 50;

function StatusBadge({ status }: { status?: InventoryStatus | null }) {
  if (!status) return <span style={{ color: "#9CA3AF", fontSize: 12 }}>—</span>;
  return (
    <span style={{
      display: "inline-block", padding: "2px 10px", borderRadius: 999, fontSize: 12, fontWeight: 500,
      background: status.colour + "22", color: status.colour, border: `1px solid ${status.colour}44`,
    }}>
      {status.name}
    </span>
  );
}

interface AddForm {
  title: string;
  category_id: string;
  status_id: string;
  location_id: string;
  metal_type: string;
  metal_karat: string;
  metal_colour: string;
  finger_size: string;
  notes: string;
}

const BLANK_FORM: AddForm = {
  title: "", category_id: "", status_id: "", location_id: "",
  metal_type: "", metal_karat: "", metal_colour: "", finger_size: "", notes: "",
};

export default function InventoryPage() {
  const router = useRouter();
  const { user, hydrated } = useUser();
  const tenantId: string = user?.tenantId ?? "";
  const isManager = hydrated ? canManage(user?.role) : false;

  const [pieces, setPieces]   = useState<InventoryPiece[]>([]);
  const [total, setTotal]     = useState(0);
  const [page, setPage]       = useState(1);
  const [loading, setLoading] = useState(true);
  const [ref, setRef]         = useState<InventoryReferenceData | null>(null);

  // Filters
  const [search, setSearch]         = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [statusId, setStatusId]     = useState("");
  const [locationId, setLocationId] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  // Add-item modal
  const [showAdd, setShowAdd]   = useState(false);
  const [addForm, setAddForm]   = useState<AddForm>(BLANK_FORM);
  const [saving, setSaving]     = useState(false);
  const [addError, setAddError] = useState("");

  // AI description
  const [aiDesc, setAiDesc]       = useState("");
  const [aiLoading, setAiLoading] = useState(false);

  const headers = { "x-tenant-id": tenantId };

  const fetchRef = useCallback(async () => {
    if (!tenantId) return;
    const res = await fetch("/api/inventory/reference", { headers });
    if (res.ok) setRef(await res.json());
  }, [tenantId]);

  const fetchPieces = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), per_page: String(PAGE_SIZE) });
    if (search)     params.set("search",      search);
    if (categoryId) params.set("category_id", categoryId);
    if (statusId)   params.set("status_id",   statusId);
    if (locationId) params.set("location_id", locationId);

    const res = await fetch(`/api/inventory/pieces?${params}`, { headers });
    if (res.ok) {
      const json = await res.json();
      setPieces(json.pieces ?? []);
      setTotal(json.total  ?? 0);
    }
    setLoading(false);
  }, [tenantId, page, search, categoryId, statusId, locationId]);

  useEffect(() => { fetchRef(); }, [fetchRef]);
  useEffect(() => { fetchPieces(); }, [fetchPieces]);

  async function handleParseWithAI() {
    if (!aiDesc.trim()) return;
    setAiLoading(true);
    const res = await fetch("/api/inventory/ai-parse", {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ description: aiDesc }),
    });
    setAiLoading(false);
    if (!res.ok) return;
    const json = await res.json();
    const f = json.fields ?? {};

    setAddForm(prev => ({
      ...prev,
      title:       f.title        && !prev.title        ? f.title        : prev.title,
      metal_type:  f.metal_type   && !prev.metal_type   ? f.metal_type   : prev.metal_type,
      metal_karat: f.metal_karat  && !prev.metal_karat  ? f.metal_karat  : prev.metal_karat,
      metal_colour: f.metal_colour && !prev.metal_colour ? f.metal_colour : prev.metal_colour,
      finger_size: f.finger_size  && !prev.finger_size  ? f.finger_size  : prev.finger_size,
      notes:       f.notes        && !prev.notes        ? f.notes        : prev.notes,
    }));
  }

  async function handleAdd() {
    setSaving(true);
    setAddError("");
    const res = await fetch("/api/inventory/pieces", {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify(addForm),
    });
    const json = await res.json();
    if (!res.ok) { setAddError(json.error ?? "Failed to create"); setSaving(false); return; }
    setSaving(false);
    setShowAdd(false);
    setAddForm(BLANK_FORM);
    setAiDesc("");
    router.push(`/inventory/${json.piece.id}`);
  }

  function openAdd() { setShowAdd(true); setAddForm(BLANK_FORM); setAiDesc(""); setAddError(""); }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasFilters = search || categoryId || statusId || locationId;

  function clearFilters() {
    setSearch(""); setCategoryId(""); setStatusId(""); setLocationId(""); setPage(1);
  }

  if (!hydrated) return null;

  const LF = { fontSize: 13, fontWeight: 500 as const, color: "#374151", display: "block" as const, marginBottom: 4 };
  const IF = { width: "100%", boxSizing: "border-box" as const, padding: "9px 12px", borderRadius: 8, border: "1px solid #E5E7EB", fontSize: 14 };

  return (
    <div style={{ padding: "32px 32px 64px", maxWidth: 1200, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: "#111827", margin: 0 }}>Stock Register</h1>
          <p style={{ fontSize: 14, color: "#6B7280", margin: "4px 0 0" }}>
            {loading ? "Loading…" : `${total.toLocaleString()} piece${total !== 1 ? "s" : ""}`}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => setShowFilters(f => !f)}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "8px 14px", borderRadius: 8, fontSize: 14, fontWeight: 500,
              background: showFilters ? "#EEF2FF" : "#F9FAFB",
              color: showFilters ? "#4F46E5" : "#374151",
              border: "1px solid " + (showFilters ? "#C7D2FE" : "#E5E7EB"),
              cursor: "pointer",
            }}
          >
            <Filter size={15} /> Filters{hasFilters ? " ●" : ""}
          </button>
          {isManager && (
            <button
              onClick={openAdd}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "8px 16px", borderRadius: 8, fontSize: 14, fontWeight: 500,
                background: "#111827", color: "#fff", border: "none", cursor: "pointer",
              }}
            >
              <Plus size={15} /> Add Item
            </button>
          )}
        </div>
      </div>

      {/* Search + filter bar */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ position: "relative", marginBottom: showFilters ? 12 : 0 }}>
          <Search size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#9CA3AF", pointerEvents: "none" }} />
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search SKU or title…"
            style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px 10px 36px", borderRadius: 8, border: "1px solid #E5E7EB", fontSize: 14, outline: "none", background: "#fff" }}
          />
          {search && (
            <button onClick={() => { setSearch(""); setPage(1); }} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#9CA3AF" }}>
              <X size={14} />
            </button>
          )}
        </div>

        {showFilters && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <select value={categoryId} onChange={e => { setCategoryId(e.target.value); setPage(1); }} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #E5E7EB", fontSize: 13, background: "#fff", color: "#374151" }}>
              <option value="">All Categories</option>
              {ref?.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select value={statusId} onChange={e => { setStatusId(e.target.value); setPage(1); }} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #E5E7EB", fontSize: 13, background: "#fff", color: "#374151" }}>
              <option value="">All Statuses</option>
              {ref?.statuses.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <select value={locationId} onChange={e => { setLocationId(e.target.value); setPage(1); }} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #E5E7EB", fontSize: 13, background: "#fff", color: "#374151" }}>
              <option value="">All Locations</option>
              {ref?.locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            {hasFilters && (
              <button onClick={clearFilters} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #E5E7EB", fontSize: 13, background: "#fff", color: "#EF4444", cursor: "pointer" }}>Clear all</button>
            )}
          </div>
        )}
      </div>

      {/* Table */}
      <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ background: "#F9FAFB", borderBottom: "1px solid #E5E7EB" }}>
              {["SKU", "Title", "Category", "Status", "Location", "Metal", "Retail Price", ""].map(h => (
                <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, color: "#374151", fontSize: 12, whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} style={{ padding: 40, textAlign: "center", color: "#9CA3AF" }}>Loading…</td></tr>
            ) : pieces.length === 0 ? (
              <tr><td colSpan={8} style={{ padding: 40, textAlign: "center", color: "#9CA3AF" }}>No items found</td></tr>
            ) : pieces.map((piece, i) => (
              <tr
                key={piece.id}
                onClick={() => router.push(`/inventory/${piece.id}`)}
                style={{ borderBottom: i < pieces.length - 1 ? "1px solid #F3F4F6" : "none", cursor: "pointer" }}
                onMouseEnter={e => (e.currentTarget.style.background = "#F9FAFB")}
                onMouseLeave={e => (e.currentTarget.style.background = "")}
              >
                <td style={{ padding: "12px 16px", fontFamily: "monospace", fontWeight: 600, color: "#111827" }}>{piece.sku}</td>
                <td style={{ padding: "12px 16px", color: "#374151" }}>{piece.title ?? <span style={{ color: "#9CA3AF" }}>—</span>}</td>
                <td style={{ padding: "12px 16px", color: "#6B7280" }}>{piece.category?.name ?? "—"}</td>
                <td style={{ padding: "12px 16px" }}><StatusBadge status={piece.status} /></td>
                <td style={{ padding: "12px 16px", color: "#6B7280" }}>{piece.location?.name ?? "—"}</td>
                <td style={{ padding: "12px 16px", color: "#6B7280", fontSize: 13 }}>{[piece.metal_karat, piece.metal_colour, piece.metal_type].filter(Boolean).join(" ") || "—"}</td>
                <td style={{ padding: "12px 16px", color: "#111827", fontWeight: 500 }}>
                  {piece.retail_price != null
                    ? `$${piece.retail_price.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                    : <span style={{ color: "#9CA3AF" }}>—</span>}
                </td>
                <td style={{ padding: "12px 16px", color: "#6B7280", fontSize: 12 }}>View →</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 16 }}>
          <span style={{ fontSize: 13, color: "#6B7280" }}>Page {page} of {totalPages}</span>
          <div style={{ display: "flex", gap: 8 }}>
            <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid #E5E7EB", background: "#fff", fontSize: 13, cursor: page <= 1 ? "not-allowed" : "pointer", color: page <= 1 ? "#D1D5DB" : "#374151" }}>Prev</button>
            <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid #E5E7EB", background: "#fff", fontSize: 13, cursor: page >= totalPages ? "not-allowed" : "pointer", color: page >= totalPages ? "#D1D5DB" : "#374151" }}>Next</button>
          </div>
        </div>
      )}

      {/* Add Item Modal */}
      {showAdd && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: "#fff", borderRadius: 16, padding: 32, width: "100%", maxWidth: 500, boxShadow: "0 20px 60px rgba(0,0,0,0.2)", maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#111827" }}>Add New Item</h2>
              <button onClick={() => setShowAdd(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "#6B7280" }}><X size={20} /></button>
            </div>

            {/* AI description */}
            <div style={{ background: "#F5F3FF", border: "1px solid #DDD6FE", borderRadius: 10, padding: 14, marginBottom: 20 }}>
              <label style={{ ...LF, color: "#5B21B6", marginBottom: 6 }}>
                <Sparkles size={13} style={{ display: "inline", marginRight: 4, verticalAlign: "middle" }} />
                Describe the item (optional)
              </label>
              <div style={{ display: "flex", gap: 8 }}>
                <textarea
                  value={aiDesc}
                  onChange={e => setAiDesc(e.target.value)}
                  placeholder="e.g. 18ct yellow gold solitaire engagement ring with 0.5ct round brilliant diamond G VS1…"
                  rows={2}
                  style={{ flex: 1, padding: "8px 10px", borderRadius: 8, border: "1px solid #DDD6FE", fontSize: 13, resize: "vertical", background: "#fff" }}
                />
                <button
                  onClick={handleParseWithAI}
                  disabled={aiLoading || !aiDesc.trim()}
                  style={{
                    display: "flex", alignItems: "center", gap: 5, flexShrink: 0,
                    padding: "8px 14px", borderRadius: 8, fontSize: 13, fontWeight: 500,
                    background: "#635BFF", color: "#fff", border: "none",
                    cursor: aiLoading || !aiDesc.trim() ? "not-allowed" : "pointer",
                    opacity: !aiDesc.trim() ? 0.5 : 1, alignSelf: "flex-start",
                  }}
                >
                  {aiLoading
                    ? <Loader size={13} style={{ animation: "spin 1s linear infinite" }} />
                    : <Sparkles size={13} />}
                  Parse
                </button>
              </div>
              {aiLoading && <div style={{ fontSize: 12, color: "#7C3AED", marginTop: 6 }}>Parsing with AI…</div>}
            </div>

            {addError && (
              <div style={{ padding: "10px 14px", background: "#FEF2F2", color: "#DC2626", borderRadius: 8, fontSize: 13, marginBottom: 16 }}>{addError}</div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <label style={LF}>Title</label>
                <input value={addForm.title} onChange={e => setAddForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Diamond Solitaire Ring" style={IF} />
              </div>
              <div>
                <label style={LF}>Category</label>
                <select value={addForm.category_id} onChange={e => setAddForm(f => ({ ...f, category_id: e.target.value }))} style={{ ...IF, background: "#fff" }}>
                  <option value="">— Select category —</option>
                  {ref?.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 16px" }}>
                <div>
                  <label style={LF}>Metal Type</label>
                  <input value={addForm.metal_type} onChange={e => setAddForm(f => ({ ...f, metal_type: e.target.value }))} placeholder="e.g. Yellow Gold" style={IF} />
                </div>
                <div>
                  <label style={LF}>Karat</label>
                  <input value={addForm.metal_karat} onChange={e => setAddForm(f => ({ ...f, metal_karat: e.target.value }))} placeholder="e.g. 18ct" style={IF} />
                </div>
                <div>
                  <label style={LF}>Metal Colour</label>
                  <input value={addForm.metal_colour} onChange={e => setAddForm(f => ({ ...f, metal_colour: e.target.value }))} placeholder="e.g. Yellow" style={IF} />
                </div>
                <div>
                  <label style={LF}>Finger Size</label>
                  <input value={addForm.finger_size} onChange={e => setAddForm(f => ({ ...f, finger_size: e.target.value }))} placeholder="e.g. N" style={IF} />
                </div>
              </div>
              <div>
                <label style={LF}>Status</label>
                <select value={addForm.status_id} onChange={e => setAddForm(f => ({ ...f, status_id: e.target.value }))} style={{ ...IF, background: "#fff" }}>
                  <option value="">— Select status —</option>
                  {ref?.statuses.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label style={LF}>Location</label>
                <select value={addForm.location_id} onChange={e => setAddForm(f => ({ ...f, location_id: e.target.value }))} style={{ ...IF, background: "#fff" }}>
                  <option value="">— Select location —</option>
                  {ref?.locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
              <div>
                <label style={LF}>Notes</label>
                <textarea value={addForm.notes} onChange={e => setAddForm(f => ({ ...f, notes: e.target.value }))} rows={2} style={{ ...IF, resize: "vertical" }} />
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
              <button onClick={() => setShowAdd(false)} style={{ flex: 1, padding: "10px", borderRadius: 8, border: "1px solid #E5E7EB", background: "#fff", fontSize: 14, cursor: "pointer", color: "#374151" }}>Cancel</button>
              <button
                onClick={handleAdd}
                disabled={saving}
                style={{ flex: 1, padding: "10px", borderRadius: 8, border: "none", background: "#111827", color: "#fff", fontSize: 14, fontWeight: 500, cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1 }}
              >
                {saving ? "Creating…" : "Create Item"}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

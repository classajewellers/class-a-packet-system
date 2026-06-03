"use client";
export const dynamic = "force-dynamic";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/context/UserContext";
import { canManage } from "@/lib/userTypes";

interface Decision {
  id: string;
  title: string;
  context: string | null;
  decision: string | null;
  rationale: string | null;
  rejected_options: string | null;
  created_at: string;
}

const defaultForm = {
  title: "",
  context: "",
  decision: "",
  rationale: "",
  rejected_options: "",
};

const fieldStyle: React.CSSProperties = {
  width: "100%", border: "1px solid #E8E8F0", borderRadius: 8,
  padding: "8px 12px", fontSize: 14, color: "#1A1A2E",
  background: "#fff", outline: "none", fontFamily: "inherit",
};
const textareaStyle: React.CSSProperties = { ...fieldStyle, resize: "vertical", minHeight: 80 };
const labelStyle: React.CSSProperties = {
  display: "block", fontSize: 12, fontWeight: 600, color: "#6B7280",
  textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4,
};
const primaryBtn: React.CSSProperties = {
  background: "#635BFF", color: "#fff", border: "none", borderRadius: 8,
  padding: "8px 16px", fontSize: 14, fontWeight: 600, cursor: "pointer",
};
const outlineBtn: React.CSSProperties = {
  background: "#fff", color: "#635BFF", border: "1px solid #635BFF", borderRadius: 8,
  padding: "8px 16px", fontSize: 14, fontWeight: 600, cursor: "pointer",
};

function formatDate(iso: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" });
}

function truncate(text: string | null, n: number) {
  if (!text) return "—";
  return text.length > n ? text.slice(0, n) + "…" : text;
}

export default function DecisionsPage() {
  const { user } = useUser();
  const router = useRouter();
  useEffect(() => {
    if (user && !canManage(user.role)) router.replace("/orders");
  }, [user, router]);

  const [items, setItems] = useState<Decision[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...defaultForm });
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const fetchItems = useCallback(async () => {
    const res = await fetch("/api/vault/decisions", { cache: "no-store" });
    const json = await res.json();
    setItems(json.items ?? []);
    setLoading(false);
  }, []);
  useEffect(() => { fetchItems(); }, [fetchItems]);

  if (!user || !canManage(user.role)) return null;

  function openNew() {
    setEditingId(null);
    setForm({ ...defaultForm });
    setModalOpen(true);
  }
  function openEdit(item: Decision) {
    setEditingId(item.id);
    setForm({
      title: item.title ?? "",
      context: item.context ?? "",
      decision: item.decision ?? "",
      rationale: item.rationale ?? "",
      rejected_options: item.rejected_options ?? "",
    });
    setModalOpen(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const url = editingId ? `/api/vault/decisions/${editingId}` : "/api/vault/decisions";
    const method = editingId ? "PATCH" : "POST";
    await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setModalOpen(false);
    fetchItems();
  }

  async function handleDelete(id: string) {
    await fetch(`/api/vault/decisions/${id}`, { method: "DELETE" });
    setConfirmId(null);
    fetchItems();
  }

  return (
    <div style={{ padding: 32 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: "#1A1A2E", margin: 0 }}>Decisions</h1>
          <p style={{ fontSize: 14, color: "#6B7280", margin: "4px 0 0" }}>Document architectural and product decisions.</p>
        </div>
        <button onClick={openNew} style={primaryBtn}>+ New Decision</button>
      </div>

      {loading ? (
        <div style={{ background: "#fff", border: "1px solid #E8E8F0", borderRadius: 12, padding: 24, color: "#6B7280", fontSize: 14 }}>Loading…</div>
      ) : items.length === 0 ? (
        <div style={{ background: "#fff", border: "1px solid #E8E8F0", borderRadius: 12, padding: 48, textAlign: "center", color: "#6B7280", fontSize: 14 }}>
          No decisions recorded yet.
        </div>
      ) : (
        <div style={{ background: "#fff", border: "1px solid #E8E8F0", borderRadius: 12, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#F9FAFB", borderBottom: "1px solid #E8E8F0" }}>
                <th style={{ textAlign: "left", padding: "12px 16px", fontSize: 12, fontWeight: 600, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>Title</th>
                <th style={{ textAlign: "left", padding: "12px 16px", fontSize: 12, fontWeight: 600, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>Decision</th>
                <th style={{ textAlign: "left", padding: "12px 16px", fontSize: 12, fontWeight: 600, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>Created</th>
                <th style={{ padding: "12px 16px" }} />
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} style={{ borderBottom: "1px solid #E8E8F0" }}>
                  <td style={{ padding: "12px 16px", color: "#1A1A2E", fontSize: 14, fontWeight: 500 }}>{item.title}</td>
                  <td style={{ padding: "12px 16px", color: "#6B7280", fontSize: 14 }}>{truncate(item.decision, 80)}</td>
                  <td style={{ padding: "12px 16px", color: "#6B7280", fontSize: 14 }}>{formatDate(item.created_at)}</td>
                  <td style={{ padding: "12px 16px", textAlign: "right", whiteSpace: "nowrap" }}>
                    {confirmId === item.id ? (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 13, color: "#6B7280" }}>Delete?</span>
                        <button onClick={() => handleDelete(item.id)} style={{ background: "#EF4444", color: "#fff", border: "none", borderRadius: 6, padding: "4px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Yes</button>
                        <button onClick={() => setConfirmId(null)} style={{ background: "#F3F4F6", color: "#374151", border: "none", borderRadius: 6, padding: "4px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>No</button>
                      </span>
                    ) : (
                      <>
                        <button onClick={() => openEdit(item)} style={{ background: "none", border: "none", cursor: "pointer", color: "#6B7280", padding: "4px 8px", fontSize: 13, borderRadius: 6 }} title="Edit">✏️</button>
                        <button onClick={() => setConfirmId(item.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#EF4444", padding: "4px 8px", fontSize: 13, borderRadius: 6 }} title="Delete">🗑</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 560, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 24px", borderBottom: "1px solid #E8E8F0" }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: "#1A1A2E", margin: 0 }}>{editingId ? "Edit Decision" : "New Decision"}</h2>
              <button onClick={() => setModalOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "#6B7280", lineHeight: 1 }}>×</button>
            </div>
            <form onSubmit={handleSave}>
              <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
                <div>
                  <label style={labelStyle}>Title</label>
                  <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} style={fieldStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Context</label>
                  <textarea value={form.context} onChange={(e) => setForm({ ...form, context: e.target.value })} style={textareaStyle} rows={3} />
                </div>
                <div>
                  <label style={labelStyle}>Decision</label>
                  <textarea value={form.decision} onChange={(e) => setForm({ ...form, decision: e.target.value })} style={textareaStyle} rows={3} />
                </div>
                <div>
                  <label style={labelStyle}>Rationale</label>
                  <textarea value={form.rationale} onChange={(e) => setForm({ ...form, rationale: e.target.value })} style={textareaStyle} rows={3} />
                </div>
                <div>
                  <label style={labelStyle}>Rejected Options / Alternatives</label>
                  <textarea value={form.rejected_options} onChange={(e) => setForm({ ...form, rejected_options: e.target.value })} style={textareaStyle} rows={2} />
                </div>
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "16px 24px", borderTop: "1px solid #E8E8F0" }}>
                <button type="button" onClick={() => setModalOpen(false)} style={outlineBtn}>Cancel</button>
                <button type="submit" style={primaryBtn}>Save</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

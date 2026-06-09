"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/context/UserContext";

interface Tenant {
  id: string;
  name: string;
  slug: string;
  subscription_status: "active" | "inactive" | "suspended";
  created_at: string;
}

export default function TenantsSettingsPage() {
  const { user } = useUser();
  const router = useRouter();

  const [tenants, setTenants]         = useState<Tenant[]>([]);
  const [loading, setLoading]         = useState(true);
  const [showModal, setShowModal]     = useState(false);
  const [newName, setNewName]         = useState("");
  const [newSlug, setNewSlug]         = useState("");
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [editingId, setEditingId]     = useState<string | null>(null);
  const [editName, setEditName]       = useState("");
  const [editStatus, setEditStatus]   = useState<string>("");

  const isManager = user?.role === "manager" || user?.role === "admin";

  // Redirect non-managers
  useEffect(() => {
    if (user && !isManager) router.replace("/orders");
  }, [user, isManager, router]);

  const fetchTenants = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/settings/tenants", {
        headers: { "x-tenant-id": user?.tenantId ?? "" },
      });
      const json = await res.json();
      setTenants(json.tenants ?? []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [user?.tenantId]);

  useEffect(() => {
    if (isManager) fetchTenants();
  }, [isManager, fetchTenants]);

  // Auto-generate slug from name
  const handleNameChange = (v: string) => {
    setNewName(v);
    setNewSlug(v.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""));
  };

  const handleAddStore = async () => {
    setError(null);
    if (!newName.trim() || !newSlug.trim()) { setError("Name and slug are required"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/settings/tenants", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-tenant-id": user?.tenantId ?? "" },
        body: JSON.stringify({ name: newName.trim(), slug: newSlug.trim() }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Failed to create store"); return; }
      setShowModal(false);
      setNewName("");
      setNewSlug("");
      await fetchTenants();
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (t: Tenant) => {
    setEditingId(t.id);
    setEditName(t.name);
    setEditStatus(t.subscription_status);
  };

  const handleSaveEdit = async (id: string) => {
    try {
      const res = await fetch("/api/settings/tenants", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-tenant-id": user?.tenantId ?? "" },
        body: JSON.stringify({ id, name: editName, subscription_status: editStatus }),
      });
      if (!res.ok) { alert("Failed to update store"); return; }
      setEditingId(null);
      await fetchTenants();
    } catch (err) {
      alert(String(err));
    }
  };

  if (!user || !isManager) return null;

  return (
    <div style={{ padding: "32px", maxWidth: 900, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 32 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: "#1A1760", margin: 0 }}>Stores</h1>
          <p style={{ color: "#6b7280", marginTop: 4, fontSize: 14 }}>
            Manage tenants and their subscription status.
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          style={{
            background: "#635BFF",
            color: "#fff",
            border: "none",
            borderRadius: 10,
            padding: "10px 20px",
            fontWeight: 600,
            fontSize: 14,
            cursor: "pointer",
          }}
        >
          + Add Store
        </button>
      </div>

      {/* Table */}
      {loading ? (
        <p style={{ color: "#9ca3af", fontSize: 14 }}>Loading stores…</p>
      ) : tenants.length === 0 ? (
        <p style={{ color: "#9ca3af", fontSize: 14 }}>No stores found.</p>
      ) : (
        <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e5e7eb", overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
                {["Name", "Slug", "Status", "Created", ""].map((h) => (
                  <th
                    key={h}
                    style={{
                      padding: "12px 16px",
                      textAlign: "left",
                      fontSize: 12,
                      fontWeight: 600,
                      color: "#6b7280",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tenants.map((t, i) => (
                <tr
                  key={t.id}
                  style={{
                    borderBottom: i < tenants.length - 1 ? "1px solid #f3f4f6" : "none",
                    background: editingId === t.id ? "#f9fafb" : "#fff",
                  }}
                >
                  <td style={{ padding: "14px 16px", fontSize: 14, fontWeight: 500, color: "#111827" }}>
                    {editingId === t.id ? (
                      <input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        style={{
                          border: "1px solid #d1d5db",
                          borderRadius: 6,
                          padding: "5px 10px",
                          fontSize: 14,
                          width: 180,
                        }}
                      />
                    ) : (
                      t.name
                    )}
                  </td>
                  <td style={{ padding: "14px 16px", fontSize: 13, color: "#6b7280", fontFamily: "monospace" }}>
                    {t.slug}
                  </td>
                  <td style={{ padding: "14px 16px" }}>
                    {editingId === t.id ? (
                      <select
                        value={editStatus}
                        onChange={(e) => setEditStatus(e.target.value)}
                        style={{
                          border: "1px solid #d1d5db",
                          borderRadius: 6,
                          padding: "5px 10px",
                          fontSize: 13,
                        }}
                      >
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                        <option value="suspended">Suspended</option>
                      </select>
                    ) : (
                      <span
                        style={{
                          display: "inline-block",
                          padding: "3px 10px",
                          borderRadius: 20,
                          fontSize: 12,
                          fontWeight: 600,
                          ...(t.subscription_status === "active"
                            ? { background: "#d1fae5", color: "#065f46" }
                            : t.subscription_status === "suspended"
                            ? { background: "#fee2e2", color: "#991b1b" }
                            : { background: "#f3f4f6", color: "#6b7280" }),
                        }}
                      >
                        {t.subscription_status}
                      </span>
                    )}
                  </td>
                  <td style={{ padding: "14px 16px", fontSize: 13, color: "#9ca3af" }}>
                    {new Date(t.created_at).toLocaleDateString("en-AU", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  </td>
                  <td style={{ padding: "14px 16px", textAlign: "right" }}>
                    {editingId === t.id ? (
                      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                        <button
                          onClick={() => handleSaveEdit(t.id)}
                          style={{
                            background: "#635BFF",
                            color: "#fff",
                            border: "none",
                            borderRadius: 7,
                            padding: "6px 14px",
                            fontSize: 13,
                            fontWeight: 600,
                            cursor: "pointer",
                          }}
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          style={{
                            background: "transparent",
                            color: "#6b7280",
                            border: "1px solid #d1d5db",
                            borderRadius: 7,
                            padding: "6px 14px",
                            fontSize: 13,
                            cursor: "pointer",
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleEdit(t)}
                        style={{
                          background: "transparent",
                          color: "#635BFF",
                          border: "1px solid #635BFF",
                          borderRadius: 7,
                          padding: "5px 13px",
                          fontSize: 13,
                          fontWeight: 500,
                          cursor: "pointer",
                        }}
                      >
                        Edit
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Store Modal */}
      {showModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false); }}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 16,
              padding: 32,
              width: 440,
              boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
            }}
          >
            <h2 style={{ fontSize: 20, fontWeight: 700, color: "#1A1760", margin: "0 0 24px" }}>
              Add New Store
            </h2>

            {error && (
              <div
                style={{
                  background: "#fee2e2",
                  color: "#991b1b",
                  borderRadius: 8,
                  padding: "10px 14px",
                  fontSize: 13,
                  marginBottom: 16,
                }}
              >
                {error}
              </div>
            )}

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 6 }}>
                Store Name
              </label>
              <input
                value={newName}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="e.g. Class A Jewellers"
                style={{
                  width: "100%",
                  border: "1px solid #d1d5db",
                  borderRadius: 8,
                  padding: "10px 12px",
                  fontSize: 14,
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 6 }}>
                Slug <span style={{ fontWeight: 400, color: "#9ca3af" }}>(URL-safe identifier)</span>
              </label>
              <input
                value={newSlug}
                onChange={(e) => setNewSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                placeholder="e.g. class-a"
                style={{
                  width: "100%",
                  border: "1px solid #d1d5db",
                  borderRadius: 8,
                  padding: "10px 12px",
                  fontSize: 14,
                  fontFamily: "monospace",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
              <p style={{ fontSize: 12, color: "#9ca3af", marginTop: 4 }}>
                Lowercase letters, numbers and hyphens only. Cannot be changed later.
              </p>
            </div>

            <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
              <button
                onClick={() => { setShowModal(false); setError(null); setNewName(""); setNewSlug(""); }}
                style={{
                  background: "transparent",
                  color: "#6b7280",
                  border: "1px solid #d1d5db",
                  borderRadius: 9,
                  padding: "10px 20px",
                  fontSize: 14,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleAddStore}
                disabled={saving}
                style={{
                  background: saving ? "#a5b4fc" : "#635BFF",
                  color: "#fff",
                  border: "none",
                  borderRadius: 9,
                  padding: "10px 20px",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: saving ? "not-allowed" : "pointer",
                }}
              >
                {saving ? "Creating…" : "Create Store"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

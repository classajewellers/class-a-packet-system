"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/context/UserContext";
import { canManage } from "@/lib/userTypes";

interface UserProfile {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string | null;
  auth_user_id: string | null;
  created_at: string;
}

// ── Invite Modal ──────────────────────────────────────────────────────────────

function InviteModal({
  tenantId,
  onClose,
  onSuccess,
}: {
  tenantId: string;
  onClose: () => void;
  onSuccess: (email: string) => void;
}) {
  const [form, setForm] = useState({ name: "", email: "", role: "staff" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async () => {
    setError("");
    if (!form.name.trim() || !form.email.trim()) {
      setError("Name and email are required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/settings/users/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-tenant-id": tenantId },
        body: JSON.stringify({ name: form.name, email: form.email, role: form.role }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Failed to send invite"); return; }
      onSuccess(form.email);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: "100%", border: "1px solid #e5e7eb", borderRadius: 8,
    padding: "9px 12px", fontSize: 14, outline: "none",
    boxSizing: "border-box", fontFamily: "Inter, sans-serif",
  };

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: "#fff", borderRadius: 16, padding: 32, width: 440, boxShadow: "0 20px 60px rgba(0,0,0,0.18)" }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: "#1A1760", margin: "0 0 20px" }}>Invite User</h2>

        {error && (
          <div style={{ background: "#fee2e2", color: "#991b1b", borderRadius: 8, padding: "10px 14px", fontSize: 13, marginBottom: 16 }}>
            {error}
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#6b7280", marginBottom: 5 }}>Full Name *</label>
            <input style={inputStyle} value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Jane Smith" />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#6b7280", marginBottom: 5 }}>Email *</label>
            <input style={inputStyle} type="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="jane@store.com" />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#6b7280", marginBottom: 5 }}>Role</label>
            <select style={inputStyle} value={form.role} onChange={(e) => set("role", e.target.value)}>
              <option value="staff">Staff</option>
              <option value="manager">Manager</option>
            </select>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 24 }}>
          <button onClick={onClose} style={{ padding: "9px 18px", borderRadius: 8, border: "1px solid #d1d5db", background: "transparent", color: "#6b7280", fontSize: 14, cursor: "pointer" }}>
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            style={{ padding: "9px 18px", borderRadius: 8, border: "none", background: saving ? "#a5b4fc" : "#635BFF", color: "#fff", fontSize: 14, fontWeight: 600, cursor: saving ? "not-allowed" : "pointer" }}
          >
            {saving ? "Sending…" : "Send Invite"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function UsersSettingsPage() {
  const { user } = useUser();
  const router = useRouter();

  const [users, setUsers]         = useState<UserProfile[]>([]);
  const [loading, setLoading]     = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [toast, setToast]         = useState("");
  const [removing, setRemoving]   = useState<string | null>(null);

  const tenantId = user?.tenantId ?? "";

  useEffect(() => {
    if (user && !canManage(user.role)) router.replace("/orders");
  }, [user, router]);

  const fetchUsers = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/settings/users/list`, {
        headers: { "x-tenant-id": tenantId },
      });
      const json = await res.json();
      setUsers(json.users ?? []);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    if (tenantId) fetchUsers();
  }, [tenantId, fetchUsers]);

  const showToastMsg = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 4000);
  };

  const handleRemove = async (id: string) => {
    if (!confirm("Remove this user? They will lose access immediately.")) return;
    setRemoving(id);
    try {
      await fetch(`/api/settings/users/${id}`, {
        method: "DELETE",
        headers: { "x-tenant-id": tenantId },
      });
      setUsers((prev) => prev.filter((u) => u.id !== id));
      showToastMsg("User removed.");
    } finally {
      setRemoving(null);
    }
  };

  if (!user || !canManage(user.role)) return null;

  const thStyle: React.CSSProperties = {
    padding: "11px 16px", textAlign: "left", fontSize: 11, fontWeight: 600,
    color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em",
  };
  const tdStyle: React.CSSProperties = { padding: "13px 16px", fontSize: 14, color: "#374151", verticalAlign: "middle" };

  return (
    <div style={{ padding: "32px", maxWidth: 900, margin: "0 auto", fontFamily: "Inter, sans-serif" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: "#1A1760", margin: 0 }}>Users</h1>
          <p style={{ color: "#9ca3af", fontSize: 13, marginTop: 3 }}>Manage who has access to your store</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          style={{ background: "#635BFF", color: "#fff", border: "none", borderRadius: 10, padding: "10px 18px", fontWeight: 600, fontSize: 14, cursor: "pointer" }}
        >
          + Invite User
        </button>
      </div>

      {/* Table */}
      <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #E8E8F0", overflow: "hidden" }}>
        {loading ? (
          <p style={{ padding: 24, color: "#9ca3af", fontSize: 14 }}>Loading users…</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f9fafb", borderBottom: "1px solid #E8E8F0" }}>
                {["Name", "Email", "Role", "Status", "Actions"].map((h) => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map((u, i) => (
                <tr key={u.id} style={{ borderBottom: i < users.length - 1 ? "1px solid #f3f4f6" : "none" }}>
                  <td style={{ ...tdStyle, fontWeight: 600, color: "#111827" }}>
                    {u.full_name || "—"}
                  </td>
                  <td style={{ ...tdStyle, color: "#6b7280" }}>{u.email || "—"}</td>
                  <td style={tdStyle}>
                    <span style={{
                      display: "inline-block", padding: "2px 10px", borderRadius: 20, fontSize: 12, fontWeight: 600, textTransform: "capitalize",
                      background: u.role === "manager" ? "#ede9fe" : "#f3f4f6",
                      color:      u.role === "manager" ? "#6d28d9" : "#6b7280",
                    }}>
                      {u.role ?? "staff"}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    {u.auth_user_id ? (
                      <span style={{ color: "#10B981", fontSize: 12, fontWeight: 600 }}>✓ Active</span>
                    ) : (
                      <span style={{ color: "#F59E0B", fontSize: 12, fontWeight: 600 }}>Invite pending</span>
                    )}
                  </td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>
                    {u.id !== user.id && (
                      <button
                        onClick={() => handleRemove(u.id)}
                        disabled={removing === u.id}
                        style={{
                          background: "transparent", border: "1px solid #fca5a5", color: "#ef4444",
                          borderRadius: 7, padding: "5px 12px", fontSize: 12, fontWeight: 500,
                          cursor: removing === u.id ? "not-allowed" : "pointer",
                        }}
                      >
                        {removing === u.id ? "Removing…" : "Remove"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ padding: 32, textAlign: "center", color: "#9ca3af", fontSize: 14 }}>
                    No users yet. Invite your first team member.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <InviteModal
          tenantId={tenantId}
          onClose={() => setShowModal(false)}
          onSuccess={(email) => {
            setShowModal(false);
            fetchUsers();
            showToastMsg(`Invite sent to ${email}`);
          }}
        />
      )}

      {toast && (
        <div style={{ position: "fixed", bottom: 24, right: 24, background: "#10B981", color: "#fff", borderRadius: 10, padding: "12px 20px", fontSize: 14, fontWeight: 600, boxShadow: "0 8px 24px rgba(0,0,0,0.15)", zIndex: 200 }}>
          {toast}
        </div>
      )}
    </div>
  );
}

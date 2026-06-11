"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/context/UserContext";
import { canManage, UserPermissions, DEFAULT_STAFF_PERMISSIONS, ALL_MODULES, MODULE_LABELS } from "@/lib/userTypes";

interface UserProfile {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string | null;
  auth_user_id: string | null;
  created_at: string;
  permissions: UserPermissions | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function resolvedPerms(profile: UserProfile): UserPermissions {
  return { ...DEFAULT_STAFF_PERMISSIONS, ...(profile.permissions ?? {}) };
}

function permsSummary(profile: UserProfile): string {
  if (profile.role === "manager" || profile.role === "admin") return "Manager (full access)";
  const p = resolvedPerms(profile);
  const count = ALL_MODULES.filter(m => p[m]).length;
  return `${count}/${ALL_MODULES.length} modules`;
}

// ── Edit Modal ────────────────────────────────────────────────────────────────

function EditModal({
  profile,
  tenantId,
  onClose,
  onSaved,
}: {
  profile: UserProfile;
  tenantId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [fullName, setFullName]   = useState(profile.full_name ?? "");
  const [role, setRole]           = useState<"staff" | "manager">(
    profile.role === "manager" ? "manager" : "staff"
  );
  const [perms, setPerms]         = useState<UserPermissions>(resolvedPerms(profile));
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState("");

  const isStaff = role === "staff";

  const togglePerm = (module: keyof UserPermissions) =>
    setPerms(p => ({ ...p, [module]: !p[module] }));

  const handleSave = async () => {
    setError("");
    setSaving(true);
    try {
      const res = await fetch(`/api/settings/users/${profile.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-tenant-id": tenantId },
        body: JSON.stringify({
          full_name:   fullName.trim(),
          role,
          permissions: isStaff ? perms : null,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(typeof json.error === "string" ? json.error : "Failed to save changes");
        return;
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save changes");
    } finally {
      setSaving(false);
    }
  };

  const inp: React.CSSProperties = {
    width: "100%", border: "1px solid #E8E8F0", borderRadius: 8,
    padding: "9px 12px", fontSize: 14, outline: "none", boxSizing: "border-box",
    fontFamily: "Inter, sans-serif", color: "#1A1A2E",
  };

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 16 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: "#fff", borderRadius: 16, padding: 32, width: "100%", maxWidth: 520, boxShadow: "0 20px 60px rgba(0,0,0,0.18)", maxHeight: "90vh", overflowY: "auto" }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: "#1A1760", margin: "0 0 20px" }}>Edit User</h2>

        {error && (
          <div style={{ background: "#fee2e2", color: "#991b1b", borderRadius: 8, padding: "10px 14px", fontSize: 13, marginBottom: 16 }}>
            {error}
          </div>
        )}

        {/* Basic details */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 24 }}>
          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#6b7280", marginBottom: 5 }}>Full Name</label>
            <input style={inp} value={fullName} onChange={e => setFullName(e.target.value)} />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#6b7280", marginBottom: 5 }}>Email</label>
            <input style={{ ...inp, background: "#F9FAFB", color: "#9CA3AF" }} value={profile.email ?? ""} readOnly />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#6b7280", marginBottom: 6 }}>Role</label>
            <div style={{ display: "flex", borderRadius: 8, overflow: "hidden", border: "1px solid #E8E8F0", width: "fit-content" }}>
              {(["staff", "manager"] as const).map(r => (
                <button key={r} onClick={() => setRole(r)} style={{ padding: "8px 20px", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 500, background: role === r ? "#635BFF" : "#fff", color: role === r ? "#fff" : "#374151", textTransform: "capitalize", transition: "all .15s" }}>{r}</button>
              ))}
            </div>
          </div>
        </div>

        {/* Module permissions — staff only */}
        {isStaff && (
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#1A1760", marginBottom: 12 }}>Module Access</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {ALL_MODULES.map(module => (
                <label key={module} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", borderRadius: 8, border: `1px solid ${perms[module] ? "#C7D2FE" : "#E8E8F0"}`, background: perms[module] ? "#EEF2FF" : "#F9FAFB", cursor: "pointer", gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 500, color: perms[module] ? "#4338CA" : "#6B7280" }}>{MODULE_LABELS[module]}</span>
                  <div
                    onClick={() => togglePerm(module)}
                    style={{ width: 36, height: 20, borderRadius: 10, background: perms[module] ? "#635BFF" : "#D1D5DB", position: "relative", cursor: "pointer", transition: "background .2s", flexShrink: 0 }}
                  >
                    <div style={{ position: "absolute", top: 2, left: perms[module] ? 18 : 2, width: 16, height: 16, borderRadius: "50%", background: "#fff", transition: "left .2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }} />
                  </div>
                </label>
              ))}
            </div>
            <div style={{ marginTop: 10, padding: "8px 12px", borderRadius: 8, background: "#F9FAFB", border: "1px solid #E8E8F0" }}>
              <span style={{ fontSize: 12, color: "#6B7280" }}>Staff role — cost data is never visible regardless of module access.</span>
            </div>
          </div>
        )}

        {!isStaff && (
          <div style={{ marginBottom: 24, padding: "12px 14px", borderRadius: 8, background: "#EEF2FF", border: "1px solid #C7D2FE" }}>
            <span style={{ fontSize: 13, color: "#4338CA", fontWeight: 500 }}>Managers have full access to all modules.</span>
          </div>
        )}

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ padding: "9px 18px", borderRadius: 8, border: "1px solid #d1d5db", background: "transparent", color: "#6b7280", fontSize: 14, cursor: "pointer" }}>Cancel</button>
          <button onClick={handleSave} disabled={saving} style={{ padding: "9px 18px", borderRadius: 8, border: "none", background: saving ? "#a5b4fc" : "#635BFF", color: "#fff", fontSize: 14, fontWeight: 600, cursor: saving ? "not-allowed" : "pointer" }}>
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
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
  const [form, setForm]     = useState({ name: "", email: "", role: "staff" });
  const [perms, setPerms]   = useState<UserPermissions>({ ...DEFAULT_STAFF_PERMISSIONS });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState("");

  const set = (k: keyof typeof form, v: string) => setForm(f => ({ ...f, [k]: v }));
  const togglePerm = (module: keyof UserPermissions) =>
    setPerms(p => ({ ...p, [module]: !p[module] }));

  const isStaff = form.role === "staff";

  const handleSubmit = async () => {
    setError("");
    if (!form.name.trim() || !form.email.trim()) { setError("Name and email are required"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/settings/users/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-tenant-id": tenantId },
        body: JSON.stringify({
          name:        form.name,
          email:       form.email,
          role:        form.role,
          permissions: isStaff ? perms : null,
        }),
      });
      const json = await res.json();
      if (res.ok && json.success) { onSuccess(form.email); return; }
      const msg = typeof json?.error === "string" && json.error.trim()
        ? json.error : "Failed to send invite. Please try again.";
      setError(msg);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send invite. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const inp: React.CSSProperties = {
    width: "100%", border: "1px solid #E8E8F0", borderRadius: 8,
    padding: "9px 12px", fontSize: 14, outline: "none", boxSizing: "border-box",
    fontFamily: "Inter, sans-serif",
  };

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 16 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: "#fff", borderRadius: 16, padding: 32, width: "100%", maxWidth: 520, boxShadow: "0 20px 60px rgba(0,0,0,0.18)", maxHeight: "90vh", overflowY: "auto" }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: "#1A1760", margin: "0 0 20px" }}>Invite User</h2>

        {error && (
          <div style={{ background: "#fee2e2", color: "#991b1b", borderRadius: 8, padding: "10px 14px", fontSize: 13, marginBottom: 16 }}>
            {error}
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 20 }}>
          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#6b7280", marginBottom: 5 }}>Full Name *</label>
            <input style={inp} value={form.name} onChange={e => set("name", e.target.value)} placeholder="Jane Smith" />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#6b7280", marginBottom: 5 }}>Email *</label>
            <input style={inp} type="email" value={form.email} onChange={e => set("email", e.target.value)} placeholder="jane@store.com" />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#6b7280", marginBottom: 6 }}>Role</label>
            <div style={{ display: "flex", borderRadius: 8, overflow: "hidden", border: "1px solid #E8E8F0", width: "fit-content" }}>
              {["staff", "manager"].map(r => (
                <button key={r} onClick={() => set("role", r)} style={{ padding: "8px 20px", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 500, background: form.role === r ? "#635BFF" : "#fff", color: form.role === r ? "#fff" : "#374151", textTransform: "capitalize", transition: "all .15s" }}>{r}</button>
              ))}
            </div>
          </div>
        </div>

        {/* Permissions — staff only */}
        {isStaff && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#1A1760", marginBottom: 10 }}>Module Access</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {ALL_MODULES.map(module => (
                <label key={module} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", borderRadius: 8, border: `1px solid ${perms[module] ? "#C7D2FE" : "#E8E8F0"}`, background: perms[module] ? "#EEF2FF" : "#F9FAFB", cursor: "pointer", gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 500, color: perms[module] ? "#4338CA" : "#6B7280" }}>{MODULE_LABELS[module]}</span>
                  <div
                    onClick={() => togglePerm(module)}
                    style={{ width: 36, height: 20, borderRadius: 10, background: perms[module] ? "#635BFF" : "#D1D5DB", position: "relative", cursor: "pointer", transition: "background .2s", flexShrink: 0 }}
                  >
                    <div style={{ position: "absolute", top: 2, left: perms[module] ? 18 : 2, width: 16, height: 16, borderRadius: "50%", background: "#fff", transition: "left .2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }} />
                  </div>
                </label>
              ))}
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
          <button onClick={onClose} style={{ padding: "9px 18px", borderRadius: 8, border: "1px solid #d1d5db", background: "transparent", color: "#6b7280", fontSize: 14, cursor: "pointer" }}>Cancel</button>
          <button onClick={handleSubmit} disabled={saving} style={{ padding: "9px 18px", borderRadius: 8, border: "none", background: saving ? "#a5b4fc" : "#635BFF", color: "#fff", fontSize: 14, fontWeight: 600, cursor: saving ? "not-allowed" : "pointer" }}>
            {saving ? "Sending…" : "Send Invite"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function UsersSettingsPage() {
  const { user, hydrated } = useUser();
  const router = useRouter();

  const [users, setUsers]           = useState<UserProfile[]>([]);
  const [loading, setLoading]       = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [editing, setEditing]       = useState<UserProfile | null>(null);
  const [toast, setToast]           = useState("");
  const [removing, setRemoving]     = useState<string | null>(null);

  const tenantId = user?.tenantId ?? "";

  useEffect(() => {
    if (hydrated && user && !canManage(user.role)) router.replace("/");
  }, [user, hydrated, router]);

  const fetchUsers = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const res  = await fetch("/api/settings/users/list", { headers: { "x-tenant-id": tenantId } });
      const json = await res.json();
      setUsers(json.users ?? []);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => { if (tenantId) fetchUsers(); }, [tenantId, fetchUsers]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 4000);
  };

  const handleRemove = async (id: string) => {
    if (!confirm("Remove this user? They will lose access immediately.")) return;
    setRemoving(id);
    try {
      await fetch(`/api/settings/users/${id}`, { method: "DELETE", headers: { "x-tenant-id": tenantId } });
      setUsers(prev => prev.filter(u => u.id !== id));
      showToast("User removed.");
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
    <div style={{ padding: "32px", maxWidth: 980, margin: "0 auto", fontFamily: "Inter, sans-serif" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: "#1A1760", margin: 0 }}>Users</h1>
          <p style={{ color: "#9ca3af", fontSize: 13, marginTop: 3 }}>Manage who has access to your store</p>
        </div>
        <button
          onClick={() => setShowInvite(true)}
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
                {["Name", "Email", "Role", "Status", "Permissions", "Actions"].map(h => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map((u, i) => (
                <tr key={u.id} style={{ borderBottom: i < users.length - 1 ? "1px solid #f3f4f6" : "none" }}>
                  <td style={{ ...tdStyle, fontWeight: 600, color: "#111827" }}>{u.full_name || "—"}</td>
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
                    {u.auth_user_id
                      ? <span style={{ color: "#10B981", fontSize: 12, fontWeight: 600 }}>✓ Active</span>
                      : <span style={{ color: "#F59E0B", fontSize: 12, fontWeight: 600 }}>Invite pending</span>
                    }
                  </td>
                  <td style={tdStyle}>
                    <span style={{ fontSize: 12, color: "#6B7280" }}>{permsSummary(u)}</span>
                  </td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>
                    <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                      <button
                        onClick={() => setEditing(u)}
                        style={{ background: "transparent", border: "1px solid #E8E8F0", color: "#635BFF", borderRadius: 7, padding: "5px 12px", fontSize: 12, fontWeight: 500, cursor: "pointer" }}
                      >
                        Edit
                      </button>
                      {u.id !== user.id && (
                        <button
                          onClick={() => handleRemove(u.id)}
                          disabled={removing === u.id}
                          style={{ background: "transparent", border: "1px solid #fca5a5", color: "#ef4444", borderRadius: 7, padding: "5px 12px", fontSize: 12, fontWeight: 500, cursor: removing === u.id ? "not-allowed" : "pointer" }}
                        >
                          {removing === u.id ? "Removing…" : "Remove"}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ padding: 32, textAlign: "center", color: "#9ca3af", fontSize: 14 }}>
                    No users yet. Invite your first team member.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Modals */}
      {showInvite && (
        <InviteModal
          tenantId={tenantId}
          onClose={() => setShowInvite(false)}
          onSuccess={email => {
            setShowInvite(false);
            fetchUsers();
            showToast(`Invite sent to ${email}`);
          }}
        />
      )}

      {editing && (
        <EditModal
          profile={editing}
          tenantId={tenantId}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            fetchUsers();
            showToast("User updated successfully");
          }}
        />
      )}

      {/* Toast */}
      {toast && (
        <div style={{ position: "fixed", bottom: 24, right: 24, background: "#10B981", color: "#fff", borderRadius: 10, padding: "12px 20px", fontSize: 14, fontWeight: 600, boxShadow: "0 8px 24px rgba(0,0,0,0.15)", zIndex: 200 }}>
          {toast}
        </div>
      )}
    </div>
  );
}

"use client";

export const dynamic = "force-dynamic";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useUser } from "@/context/UserContext";
import { canManage } from "@/lib/userTypes";

interface WorkshopRole {
  id: string;
  slug: string;
  name: string;
  active: boolean;
  sort_order: number;
}

interface TeamMember {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string | null;
  auth_user_id: string | null;
  workshop_roles: WorkshopRole[];
}

const ROLE_BADGE: Record<string, { bg: string; text: string }> = {
  admin:   { bg: "#EDE9FE", text: "#5B21B6" },
  manager: { bg: "#DBEAFE", text: "#1E40AF" },
  staff:   { bg: "var(--vault-surface)", text: "var(--vault-text)" },
};

export default function TeamSettingsPage() {
  const { user, hydrated } = useUser();
  const router = useRouter();
  const [tags, setTags] = useState<WorkshopRole[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [passwordFor, setPasswordFor] = useState<TeamMember | null>(null);
  const [savingTags, setSavingTags] = useState<string | null>(null);

  useEffect(() => {
    if (hydrated && user && !canManage(user.role)) router.replace("/");
  }, [user, hydrated, router]);

  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(""), 4000);
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/settings/team", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Failed to load team");
        setMembers([]);
        setTags([]);
        return;
      }
      setTags(json.roles ?? []);
      setMembers(json.members ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load team");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (hydrated && user && canManage(user.role)) load();
  }, [hydrated, user, load]);

  async function toggleTag(member: TeamMember, role: WorkshopRole) {
    const has = member.workshop_roles.some((r) => r.id === role.id);
    const nextIds = has
      ? member.workshop_roles.filter((r) => r.id !== role.id).map((r) => r.id)
      : [...member.workshop_roles.map((r) => r.id), role.id];
    const previous = member.workshop_roles;
    const nextRoles = tags.filter((r) => nextIds.includes(r.id));
    setMembers((list) => list.map((m) => (m.id === member.id ? { ...m, workshop_roles: nextRoles } : m)));
    setSavingTags(member.id);
    try {
      const res = await fetch(`/api/settings/team/${member.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workshop_role_ids: nextIds }),
      });
      const json = await res.json();
      if (!res.ok) {
        setMembers((list) => list.map((m) => (m.id === member.id ? { ...m, workshop_roles: previous } : m)));
        showToast(json.error ?? "Could not update workshop roles");
        return;
      }
    } catch {
      setMembers((list) => list.map((m) => (m.id === member.id ? { ...m, workshop_roles: previous } : m)));
      showToast("Could not update workshop roles");
    } finally {
      setSavingTags(null);
    }
  }

  if (!hydrated || !user || !canManage(user.role)) {
    return (
      <div style={{ padding: 32, color: "var(--vault-text-muted)", fontSize: 14 }}>Loading…</div>
    );
  }

  const th: React.CSSProperties = {
    padding: "11px 16px", textAlign: "left", fontSize: 11, fontWeight: 600,
    color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em",
  };
  const td: React.CSSProperties = { padding: "13px 16px", fontSize: 14, color: "var(--vault-text)", verticalAlign: "middle" };

  return (
    <div style={{ padding: 32, maxWidth: 980, margin: "0 auto", fontFamily: "Inter, sans-serif" }}>
      <div style={{ marginBottom: 8 }}>
        <Link href="/settings" style={{ fontSize: 13, color: "var(--vault-text-muted)", textDecoration: "none" }}>← Settings</Link>
      </div>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: "var(--vault-text-page-title)", fontWeight: 600, color: "var(--vault-text)", margin: 0 }}>Team</h1>
          <p style={{ color: "#6b7280", fontSize: 13, marginTop: 6, maxWidth: 640, lineHeight: 1.5 }}>
            Add a staff login directly. System role (staff or manager) is separate from workshop tags.
            Anyone tagged Jeweller or CAD Designer shows up in the workshop Assign To list, in place of the old team-member names.
            No invite email is sent — they sign in at the login page with the temporary password you set.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          style={{ background: "var(--vault-text)", color: "var(--vault-canvas)", border: "none", borderRadius: 10, padding: "10px 18px", fontWeight: 600, fontSize: 14, cursor: "pointer", flexShrink: 0 }}
        >
          + Add staff
        </button>
      </div>

      {error && (
        <div style={{ marginBottom: 16, padding: "12px 16px", background: "#FEF2F2", border: "1px solid #FCA5A5", borderRadius: 10, fontSize: 13, color: "#991B1B" }}>
          {error}
        </div>
      )}

      <div style={{ background: "var(--vault-canvas)", borderRadius: 12, border: "1px solid var(--vault-border)", overflow: "hidden" }}>
        {loading ? (
          <p style={{ padding: 24, color: "#9ca3af", fontSize: 14 }}>Loading team…</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f9fafb", borderBottom: "1px solid var(--vault-border)" }}>
                {["Name", "Email", "System role", "Workshop tags", ""].map((h) => (
                  <th key={h || "actions"} style={th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {members.map((m, i) => {
                const badge = ROLE_BADGE[m.role ?? "staff"] ?? ROLE_BADGE.staff;
                return (
                  <tr key={m.id} style={{ borderBottom: i < members.length - 1 ? "1px solid #f3f4f6" : "none" }}>
                    <td style={{ ...td, fontWeight: 600 }}>{m.full_name || "—"}</td>
                    <td style={{ ...td, color: "#6b7280" }}>{m.email || "—"}</td>
                    <td style={td}>
                      <span style={{ display: "inline-block", padding: "2px 10px", borderRadius: 20, fontSize: 12, fontWeight: 600, textTransform: "capitalize", background: badge.bg, color: badge.text }}>
                        {m.role ?? "staff"}
                      </span>
                    </td>
                    <td style={td}>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {tags.map((role) => {
                          const on = m.workshop_roles.some((r) => r.id === role.id);
                          return (
                            <button
                              key={role.id}
                              type="button"
                              disabled={savingTags === m.id}
                              aria-pressed={on}
                              onClick={() => toggleTag(m, role)}
                              style={{
                                borderRadius: 999,
                                border: on ? "1px solid #4338CA" : "1px solid var(--vault-border)",
                                background: on ? "var(--vault-surface-selected)" : "transparent",
                                color: on ? "#4338CA" : "#6b7280",
                                fontSize: 12,
                                fontWeight: 600,
                                padding: "4px 10px",
                                cursor: savingTags === m.id ? "wait" : "pointer",
                              }}
                            >
                              {role.name}
                            </button>
                          );
                        })}
                        {tags.length === 0 && <span style={{ color: "#9ca3af", fontSize: 12 }}>No workshop roles yet</span>}
                      </div>
                    </td>
                    <td style={{ ...td, textAlign: "right" }}>
                      <button
                        type="button"
                        onClick={() => setPasswordFor(m)}
                        style={{ background: "transparent", border: "1px solid var(--vault-border)", color: "var(--vault-text)", borderRadius: 7, padding: "5px 12px", fontSize: 12, fontWeight: 500, cursor: "pointer" }}
                      >
                        Set password
                      </button>
                    </td>
                  </tr>
                );
              })}
              {members.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ padding: 32, textAlign: "center", color: "#9ca3af", fontSize: 14 }}>
                    No staff yet. Add the first person above.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {showCreate && (
        <CreateModal
          roles={tags}
          onClose={() => setShowCreate(false)}
          onCreated={(name) => {
            setShowCreate(false);
            load();
            showToast(`${name} can sign in with the password you set.`);
          }}
        />
      )}

      {passwordFor && (
        <PasswordModal
          member={passwordFor}
          onClose={() => setPasswordFor(null)}
          onSaved={() => {
            setPasswordFor(null);
            showToast("Temporary password updated.");
          }}
        />
      )}

      {toast && (
        <div style={{ position: "fixed", bottom: 24, right: 24, background: "#10B981", color: "var(--vault-canvas)", borderRadius: 10, padding: "12px 20px", fontSize: 14, fontWeight: 600, boxShadow: "0 8px 24px rgba(0,0,0,0.15)", zIndex: 200 }}>
          {toast}
        </div>
      )}
    </div>
  );
}

function CreateModal({
  roles,
  onClose,
  onCreated,
}: {
  roles: WorkshopRole[];
  onClose: () => void;
  onCreated: (name: string) => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"staff" | "manager">("staff");
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const inp: React.CSSProperties = {
    width: "100%", border: "1px solid var(--vault-border)", borderRadius: 8,
    padding: "9px 12px", fontSize: 14, outline: "none", boxSizing: "border-box",
    fontFamily: "Inter, sans-serif", color: "var(--vault-text)",
  };

  async function submit() {
    setError("");
    if (!name.trim() || !email.trim() || !password) {
      setError("Name, email, and a temporary password are required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/settings/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          password,
          role,
          workshop_role_ids: tagIds,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(typeof json.error === "string" ? json.error : "Failed to create staff member");
        return;
      }
      onCreated(name.trim());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create staff member");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Add staff" onClose={onClose}>
      {error && <ErrorBanner message={error} />}
      <Field label="Name">
        <input style={inp} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ben" autoFocus />
      </Field>
      <Field label="Email">
        <input style={inp} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ben@store.com" />
      </Field>
      <Field label="Temporary password" hint="They use this on the login page. Nothing is emailed.">
        <input style={inp} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
      </Field>
      <Field label="System role" hint="Store access. Separate from workshop tags.">
        <div style={{ display: "flex", borderRadius: 8, overflow: "hidden", border: "1px solid var(--vault-border)", width: "fit-content" }}>
          {(["staff", "manager"] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRole(r)}
              style={{ padding: "8px 20px", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 500, background: role === r ? "var(--vault-text)" : "var(--vault-canvas)", color: role === r ? "var(--vault-canvas)" : "var(--vault-text)", textTransform: "capitalize" }}
            >
              {r}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Workshop tags" hint="Optional. Tagged people appear in workshop Assign To. More than one is fine.">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {roles.map((r) => {
            const on = tagIds.includes(r.id);
            return (
              <label key={r.id} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => setTagIds((ids) => on ? ids.filter((id) => id !== r.id) : [...ids, r.id])}
                />
                {r.name}
              </label>
            );
          })}
        </div>
      </Field>
      <ModalActions onClose={onClose} onSave={submit} saving={saving} saveLabel="Create account" />
    </Modal>
  );
}

function PasswordModal({
  member,
  onClose,
  onSaved,
}: {
  member: TeamMember;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    setError("");
    if (password.length < 8) {
      setError("Temporary password must be at least 8 characters");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/settings/team/${member.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(typeof json.error === "string" ? json.error : "Failed to set password");
        return;
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to set password");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={`Set password for ${member.full_name || member.email || "staff"}`} onClose={onClose}>
      {error && <ErrorBanner message={error} />}
      <p style={{ fontSize: 13, color: "#6b7280", marginTop: 0 }}>
        Replaces the current password. They sign in at the login page with {member.email || "their email"} and this password. No email is sent.
      </p>
      <Field label="New temporary password">
        <input
          type="password"
          autoFocus
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{ width: "100%", border: "1px solid var(--vault-border)", borderRadius: 8, padding: "9px 12px", fontSize: 14, boxSizing: "border-box" }}
        />
      </Field>
      <ModalActions onClose={onClose} onSave={submit} saving={saving} saveLabel="Save password" />
    </Modal>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 16 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: "var(--vault-canvas)", borderRadius: 16, padding: 32, width: "100%", maxWidth: 520, boxShadow: "0 20px 60px rgba(0,0,0,0.18)", maxHeight: "90vh", overflowY: "auto" }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: "var(--vault-text)", margin: "0 0 16px" }}>{title}</h2>
        {children}
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#6b7280", marginBottom: 5 }}>{label}</label>
      {children}
      {hint && <p style={{ fontSize: 12, color: "#9ca3af", margin: "6px 0 0" }}>{hint}</p>}
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div style={{ background: "#fee2e2", color: "#991b1b", borderRadius: 8, padding: "10px 14px", fontSize: 13, marginBottom: 16 }}>
      {message}
    </div>
  );
}

function ModalActions({ onClose, onSave, saving, saveLabel }: { onClose: () => void; onSave: () => void; saving: boolean; saveLabel: string }) {
  return (
    <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
      <button type="button" onClick={onClose} style={{ padding: "9px 18px", borderRadius: 8, border: "1px solid #d1d5db", background: "transparent", color: "#6b7280", fontSize: 14, cursor: "pointer" }}>Cancel</button>
      <button type="button" onClick={onSave} disabled={saving} style={{ padding: "9px 18px", borderRadius: 8, border: "none", background: saving ? "#a5b4fc" : "var(--vault-text)", color: "var(--vault-canvas)", fontSize: 14, fontWeight: 600, cursor: saving ? "not-allowed" : "pointer" }}>
        {saving ? "Saving…" : saveLabel}
      </button>
    </div>
  );
}

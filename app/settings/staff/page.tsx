"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useUser } from "@/context/UserContext";

interface StaffProfile {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string | null;
  speciality: string | null;
}

interface EditState {
  full_name: string;
  speciality: string;
}

const SPECIALITIES = [
  "",
  "Repairs",
  "Custom Work",
  "Valuations",
  "General",
  "Sales",
  "Management",
];

const CARD: React.CSSProperties = { background: "#fff", border: "1px solid #E8E8F0", borderRadius: 12, padding: 24 };
const INPUT: React.CSSProperties = { border: "1px solid #E8E8F0", borderRadius: 8, padding: "7px 10px", fontSize: 13, color: "#1A1A2E", outline: "none", background: "#fff", width: "100%" };
const BTN: React.CSSProperties = { background: "#635BFF", color: "#fff", border: "none", borderRadius: 8, padding: "7px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" };
const SEC: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.06em" };

const ROLE_BADGE: Record<string, { bg: string; text: string }> = {
  admin:   { bg: "#EDE9FE", text: "#5B21B6" },
  manager: { bg: "#DBEAFE", text: "#1E40AF" },
  staff:   { bg: "#F3F4F6", text: "#374151" },
};

export default function StaffSettingsPage() {
  const { user } = useUser();
  const [profiles, setProfiles] = useState<StaffProfile[]>([]);
  const [edits, setEdits] = useState<Record<string, EditState>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  const headers = { "x-tenant-id": user?.tenantId ?? "" };

  useEffect(() => {
    fetch("/api/profiles", { headers })
      .then(r => r.json())
      .then(json => {
        const loaded: StaffProfile[] = json.profiles ?? [];
        setProfiles(loaded);
        const initEdits: Record<string, EditState> = {};
        for (const p of loaded) {
          initEdits[p.id] = {
            full_name: p.full_name ?? "",
            speciality: p.speciality ?? "",
          };
        }
        setEdits(initEdits);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function setField(id: string, field: keyof EditState, value: string) {
    setEdits(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  }

  async function saveProfile(id: string) {
    const e = edits[id];
    if (!e) return;
    setSaving(prev => ({ ...prev, [id]: true }));
    try {
      const res = await fetch("/api/profiles", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ id, full_name: e.full_name, speciality: e.speciality }),
      });
      const json = await res.json();
      if (json.profile) {
        setProfiles(prev => prev.map(p => p.id === id ? { ...p, ...json.profile } : p));
      }
    } catch { /* noop */ } finally {
      setSaving(prev => ({ ...prev, [id]: false }));
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      {/* Header */}
      <div>
        <div style={{ marginBottom: 4 }}>
          <Link href="/settings" style={{ fontSize: 13, color: "#9CA3AF", textDecoration: "none" }}>← Settings</Link>
        </div>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: "#1A1A2E", margin: 0 }}>Staff</h1>
        <p style={{ fontSize: 13, color: "#6B7280", marginTop: 4 }}>
          Manage staff display names and specialities. These appear in workshop assignment dropdowns.
        </p>
      </div>

      {/* Table */}
      <div style={CARD}>
        {loading ? (
          <div style={{ padding: "40px 0", textAlign: "center", color: "#9CA3AF", fontSize: 14 }}>Loading…</div>
        ) : profiles.length === 0 ? (
          <div style={{ padding: "40px 0", textAlign: "center", color: "#9CA3AF", fontSize: 14 }}>No staff found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #E8E8F0" }}>
                  {["Display Name", "Email", "Role", "Speciality", ""].map(h => (
                    <th key={h} style={{ ...SEC, padding: "0 12px 10px", textAlign: "left", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {profiles.map(p => {
                  const e = edits[p.id];
                  if (!e) return null;
                  const isSaving = saving[p.id];
                  const roleStyle = ROLE_BADGE[p.role ?? ""] ?? ROLE_BADGE.staff;
                  return (
                    <tr key={p.id} style={{ borderBottom: "1px solid #F0F0F5" }}>
                      {/* Display name */}
                      <td style={{ padding: "10px 12px", minWidth: 140 }}>
                        <input
                          type="text"
                          value={e.full_name}
                          onChange={ev => setField(p.id, "full_name", ev.target.value)}
                          style={INPUT}
                          placeholder="Full name"
                        />
                      </td>
                      {/* Email (read-only) */}
                      <td style={{ padding: "10px 12px", minWidth: 160 }}>
                        <span style={{ fontSize: 13, color: "#6B7280" }}>{p.email ?? "—"}</span>
                      </td>
                      {/* Role badge */}
                      <td style={{ padding: "10px 12px", width: 100 }}>
                        <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 600, background: roleStyle.bg, color: roleStyle.text, textTransform: "capitalize" }}>
                          {p.role ?? "staff"}
                        </span>
                      </td>
                      {/* Speciality */}
                      <td style={{ padding: "10px 12px", minWidth: 140 }}>
                        <select
                          value={e.speciality}
                          onChange={ev => setField(p.id, "speciality", ev.target.value)}
                          style={{ ...INPUT }}
                        >
                          {SPECIALITIES.map(s => (
                            <option key={s} value={s}>{s || "— None —"}</option>
                          ))}
                        </select>
                      </td>
                      {/* Save */}
                      <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                        <button
                          onClick={() => saveProfile(p.id)}
                          disabled={isSaving}
                          style={{ ...BTN, padding: "6px 14px", fontSize: 12, opacity: isSaving ? 0.6 : 1 }}
                        >
                          {isSaving ? "Saving…" : "Save"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Help */}
      <div style={{ ...CARD, background: "#F9FAFB", padding: "14px 20px" }}>
        <p style={{ fontSize: 12, color: "#6B7280", lineHeight: 1.7, margin: 0 }}>
          <strong style={{ color: "#1A1A2E" }}>Speciality</strong> tags help identify which staff member to assign for different job types in the workshop. Staff appear in the &quot;Assigned To&quot; dropdown when creating or editing workshop jobs.
        </p>
      </div>
    </div>
  );
}

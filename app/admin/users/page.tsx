"use client";

import { useState, useEffect, FormEvent } from "react";
import { useUser } from "@/context/UserContext";
import { useRouter } from "next/navigation";

interface StaffUser {
  id: string;
  email: string;
  full_name: string;
  role: string;
  created_at: string;
}

export default function AdminUsersPage() {
  const { user } = useUser();
  const router = useRouter();
  const [users, setUsers] = useState<StaffUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState<"manager" | "staff" | "admin">("staff");
  const [inviting, setInviting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Guard: admin only
  useEffect(() => {
    if (user && user.role !== "admin") {
      router.replace("/");
    }
  }, [user, router]);

  async function fetchUsers() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/users");
      const json = await res.json();
      if (json.users) setUsers(json.users);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchUsers();
  }, []);

  async function handleInvite(e: FormEvent) {
    e.preventDefault();
    setInviting(true);
    setMessage(null);

    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: inviteEmail.trim().toLowerCase(),
          full_name: inviteName.trim(),
          role: inviteRole,
        }),
      });
      const json = await res.json();

      if (json.success) {
        setMessage({ type: "success", text: `Invite sent to ${inviteEmail}` });
        setInviteEmail("");
        setInviteName("");
        setInviteRole("staff");
        fetchUsers();
      } else {
        setMessage({ type: "error", text: json.error ?? "Failed to send invite" });
      }
    } catch (err) {
      setMessage({ type: "error", text: String(err) });
    } finally {
      setInviting(false);
    }
  }

  const ROLE_COLORS: Record<string, { bg: string; color: string }> = {
    admin:   { bg: "#635BFF", color: "#fff" },
    manager: { bg: "#E0E7FF", color: "#4338CA" },
    staff:   { bg: "#F3F4F6", color: "#374151" },
  };

  if (user?.role !== "admin") return null;

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "36px 24px" }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#1A1A2E", margin: 0, marginBottom: 6 }}>
          Staff Accounts
        </h1>
        <p style={{ fontSize: 14, color: "#6B7280", margin: 0 }}>
          Invite team members by email. They&apos;ll receive a link to set their password.
        </p>
      </div>

      {/* Invite form */}
      <div
        style={{
          background: "#FFFFFF",
          border: "1px solid #E5E7EB",
          borderRadius: 14,
          padding: "24px",
          marginBottom: 28,
        }}
      >
        <h2 style={{ fontSize: 15, fontWeight: 600, color: "#1A1A2E", marginBottom: 18 }}>
          Invite a team member
        </h2>
        <form onSubmit={handleInvite} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: "#374151", letterSpacing: "0.05em" }}>
                FULL NAME
              </label>
              <input
                type="text"
                required
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
                placeholder="Sarah Smith"
                style={{
                  padding: "9px 12px", borderRadius: 8, border: "1.5px solid #E5E7EB",
                  fontSize: 14, color: "#1A1A2E", outline: "none", fontFamily: "inherit",
                }}
                onFocus={(e) => (e.target.style.borderColor = "#635BFF")}
                onBlur={(e) => (e.target.style.borderColor = "#E5E7EB")}
              />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: "#374151", letterSpacing: "0.05em" }}>
                EMAIL
              </label>
              <input
                type="email"
                required
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="sarah@classa.com.au"
                style={{
                  padding: "9px 12px", borderRadius: 8, border: "1.5px solid #E5E7EB",
                  fontSize: 14, color: "#1A1A2E", outline: "none", fontFamily: "inherit",
                }}
                onFocus={(e) => (e.target.style.borderColor = "#635BFF")}
                onBlur={(e) => (e.target.style.borderColor = "#E5E7EB")}
              />
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: "#374151", letterSpacing: "0.05em" }}>
              ROLE
            </label>
            <div style={{ display: "flex", gap: 10 }}>
              {(["staff", "manager", "admin"] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setInviteRole(r)}
                  style={{
                    padding: "8px 18px",
                    borderRadius: 8,
                    border: `1.5px solid ${inviteRole === r ? "#635BFF" : "#E5E7EB"}`,
                    background: inviteRole === r ? "#EEF2FF" : "#FFFFFF",
                    color: inviteRole === r ? "#635BFF" : "#6B7280",
                    fontSize: 13,
                    fontWeight: inviteRole === r ? 600 : 400,
                    cursor: "pointer",
                    textTransform: "capitalize",
                    fontFamily: "inherit",
                    transition: "all 0.15s",
                  }}
                >
                  {r}
                </button>
              ))}
            </div>
            <p style={{ fontSize: 12, color: "#9CA3AF", margin: 0 }}>
              {inviteRole === "admin" && "Full access including user management."}
              {inviteRole === "manager" && "Full store access: workshop, reporting, settings."}
              {inviteRole === "staff" && "Customer-facing only: orders, quotes, customers."}
            </p>
          </div>

          {message && (
            <div
              style={{
                padding: "10px 14px",
                borderRadius: 8,
                background: message.type === "success" ? "#F0FDF4" : "#FEF2F2",
                border: `1px solid ${message.type === "success" ? "#BBF7D0" : "#FECACA"}`,
                fontSize: 13,
                color: message.type === "success" ? "#16A34A" : "#DC2626",
              }}
            >
              {message.text}
            </div>
          )}

          <button
            type="submit"
            disabled={inviting}
            style={{
              padding: "10px 24px",
              borderRadius: 8,
              background: inviting ? "#A5B4FC" : "#635BFF",
              border: "none",
              color: "#fff",
              fontSize: 14,
              fontWeight: 600,
              cursor: inviting ? "not-allowed" : "pointer",
              fontFamily: "inherit",
              alignSelf: "flex-start",
              transition: "background 0.15s",
            }}
          >
            {inviting ? "Sending invite…" : "Send invite"}
          </button>
        </form>
      </div>

      {/* Staff list */}
      <div
        style={{
          background: "#FFFFFF",
          border: "1px solid #E5E7EB",
          borderRadius: 14,
          overflow: "hidden",
        }}
      >
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #E5E7EB" }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: "#1A1A2E", margin: 0 }}>
            Team members ({users.length})
          </h2>
        </div>

        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: "#9CA3AF", fontSize: 14 }}>
            Loading…
          </div>
        ) : users.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: "#9CA3AF", fontSize: 14 }}>
            No users yet. Invite your first team member above.
          </div>
        ) : (
          <div>
            {users.map((u, i) => {
              const colors = ROLE_COLORS[u.role] ?? ROLE_COLORS.staff;
              return (
                <div
                  key={u.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    padding: "14px 20px",
                    borderBottom: i < users.length - 1 ? "1px solid #F3F4F6" : "none",
                    gap: 14,
                  }}
                >
                  <div
                    style={{
                      width: 38, height: 38, borderRadius: "50%",
                      background: "#635BFF",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 13, fontWeight: 700, color: "#fff", flexShrink: 0,
                    }}
                  >
                    {u.full_name
                      ? u.full_name.split(" ").map((w: string) => w[0]).join("").toUpperCase().slice(0, 2)
                      : u.email[0].toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, color: "#1A1A2E" }}>
                      {u.full_name || "—"}
                    </div>
                    <div style={{ fontSize: 12, color: "#6B7280" }}>{u.email}</div>
                  </div>
                  <span
                    style={{
                      padding: "3px 10px", borderRadius: 999, fontSize: 11, fontWeight: 600,
                      background: colors.bg, color: colors.color, textTransform: "capitalize",
                    }}
                  >
                    {u.role}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

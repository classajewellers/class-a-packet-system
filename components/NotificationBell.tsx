"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/context/UserContext";

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string | null;
  link_type: string | null;
  link_id: string | null;
  is_read: boolean;
  created_at: string;
}

// Where each link_type takes the user when a notification is clicked.
// Extend this as more notification types/link_types are added (Phase 2:
// quote_follow_up_due -> link_type "quote").
const LINK_ROUTES: Record<string, (id: string) => string> = {
  packet: (id) => `/orders/${id}`,
  quote:  (id) => `/quotes/${id}`,
};

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function NotificationBell() {
  const { user } = useUser();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/notifications?limit=30", { headers: { "x-tenant-id": user?.tenantId ?? "" } });
      const json = await res.json();
      setNotifications(json.notifications ?? []);
      setUnreadCount(json.unread_count ?? 0);
    } catch {
      // Silent — the bell just shows stale/no data until the next poll.
    } finally {
      setLoading(false);
    }
  }, [user?.tenantId]);

  useEffect(() => {
    fetchNotifications();
    // Poll for new notifications — no realtime infra for this yet.
    const interval = setInterval(fetchNotifications, 60000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  async function markRead(id: string) {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
    setUnreadCount((c) => Math.max(0, c - 1));
    try {
      await fetch(`/api/notifications/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json", "x-tenant-id": user?.tenantId ?? "" },
        body: JSON.stringify({ read: true }),
      });
    } catch {
      // Optimistic update already applied — a failed mark-as-read isn't
      // worth surfacing an error for; it'll just show as unread again
      // next poll.
    }
  }

  async function markAllRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setUnreadCount(0);
    try {
      await fetch("/api/notifications/mark-all-read", {
        method: "PATCH",
        headers: { "x-tenant-id": user?.tenantId ?? "" },
      });
    } catch {
      // Same reasoning as markRead — optimistic, non-fatal.
    }
  }

  function handleNotificationClick(n: Notification) {
    if (!n.is_read) markRead(n.id);
    setOpen(false);
    if (n.link_type && n.link_id && LINK_ROUTES[n.link_type]) {
      router.push(LINK_ROUTES[n.link_type](n.link_id));
    }
  }

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Notifications"
        style={{
          position: "relative",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 32,
          height: 32,
          borderRadius: 8,
          border: "none",
          background: open ? "var(--vault-surface-selected)" : "transparent",
          cursor: "pointer",
          color: "var(--vault-text)",
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 && (
          <span
            style={{
              position: "absolute",
              top: 2,
              right: 2,
              minWidth: 15,
              height: 15,
              padding: "0 3px",
              borderRadius: 999,
              background: "#EF4444",
              color: "#fff",
              fontSize: 10,
              fontWeight: 700,
              lineHeight: "15px",
              textAlign: "center",
            }}
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: 40,
            right: 0,
            width: 360,
            maxHeight: 420,
            overflowY: "auto",
            background: "var(--vault-canvas)",
            border: "1px solid var(--vault-border)",
            borderRadius: 10,
            boxShadow: "0 8px 28px rgba(0,0,0,0.14)",
            zIndex: 100,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px", borderBottom: "1px solid var(--vault-border)" }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--vault-text)" }}>Notifications</span>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                style={{ border: "none", background: "none", cursor: "pointer", fontSize: 12, color: "var(--vault-accent, #635BFF)" }}
              >
                Mark all read
              </button>
            )}
          </div>

          {loading && notifications.length === 0 ? (
            <div style={{ padding: 24, textAlign: "center", fontSize: 13, color: "var(--vault-text-muted)" }}>Loading…</div>
          ) : notifications.length === 0 ? (
            <div style={{ padding: 24, textAlign: "center", fontSize: 13, color: "var(--vault-text-muted)" }}>No notifications</div>
          ) : (
            notifications.map((n) => (
              <div
                key={n.id}
                onClick={() => handleNotificationClick(n)}
                style={{
                  padding: "12px 14px",
                  borderBottom: "1px solid var(--vault-border)",
                  cursor: "pointer",
                  background: n.is_read ? "transparent" : "var(--vault-surface-selected)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: n.is_read ? 500 : 700, color: "var(--vault-text)" }}>{n.title}</span>
                  <span style={{ fontSize: 11, color: "var(--vault-text-muted)", flexShrink: 0, whiteSpace: "nowrap" }}>{relativeTime(n.created_at)}</span>
                </div>
                {n.message && (
                  <div style={{ fontSize: 12, color: "var(--vault-text-secondary, var(--vault-text-muted))", marginTop: 4, lineHeight: 1.4 }}>
                    {n.message}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

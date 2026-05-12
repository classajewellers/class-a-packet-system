"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useUser } from "@/context/UserContext";

const NAV_ITEMS = [
  { href: "/",          label: "Dashboard",  icon: "⬡", minRole: null },
  { href: "/orders",    label: "Orders",     icon: "≡", minRole: null },
  { href: "/online",    label: "Online",     icon: "◈", minRole: null },
  { href: "/quotes",    label: "Quotes",     icon: "◻", minRole: null },
  { href: "/customers", label: "Customers",  icon: "⊙", minRole: null },
  { href: "/workshop",  label: "Workshop",   icon: "⚒", minRole: "manager" },
  { href: "/revenue",   label: "Revenue",    icon: "↗", minRole: "manager" },
  { href: "/settings",  label: "Settings",   icon: "⊕", minRole: "manager" },
] as const;

interface Props {
  onOpenAI: () => void;
}

export default function Sidebar({ onOpenAI }: Props) {
  const pathname = usePathname();
  const { user, logout } = useUser();
  const router = useRouter();
  const [newDropdownOpen, setNewDropdownOpen] = useState(false);

  const visibleItems = NAV_ITEMS.filter((item) => {
    if (!item.minRole) return true;
    if (!user) return false;
    if (item.minRole === "manager") return user.role === "manager";
    return true;
  });

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  const initials = (name: string) =>
    name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);

  return (
    <aside className="ds-sidebar">
      {/* Brand */}
      <div className="ds-sidebar-brand">
        <span className="ds-sidebar-logo">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--violet)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
          </svg>
        </span>
        <div className="ds-sidebar-name">
          CLASS A
          <span className="ds-sub">JEWELLERS · OS</span>
        </div>
      </div>

      {/* New Order button */}
      <button className="ds-sidebar-newbtn" onClick={() => setNewDropdownOpen((v) => !v)}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
        New Order
      </button>

      {newDropdownOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setNewDropdownOpen(false)} />
          <div className="absolute z-20 rounded-xl shadow-xl overflow-hidden" style={{
            top: 110, left: 14, right: 14,
            background: "var(--bg-elevated)",
            border: "1px solid var(--border)",
            boxShadow: "var(--shadow-lg)",
          }}>
            <button
              onClick={() => { router.push("/orders/new"); setNewDropdownOpen(false); }}
              className="flex items-center gap-2 w-full px-4 py-3 text-sm font-medium transition-colors"
              style={{ color: "var(--text-2)", background: "transparent" }}
              onMouseEnter={e => (e.currentTarget.style.background = "rgba(124,106,254,0.08)")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >
              <span style={{ color: "var(--violet)" }}>◻</span>
              <span>New Order</span>
            </button>
            <div style={{ height: 1, background: "var(--border-subtle)" }} />
            <button
              onClick={() => { router.push("/quote"); setNewDropdownOpen(false); }}
              className="flex items-center gap-2 w-full px-4 py-3 text-sm font-medium transition-colors"
              style={{ color: "var(--text-2)", background: "transparent" }}
              onMouseEnter={e => (e.currentTarget.style.background = "rgba(124,106,254,0.08)")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >
              <span style={{ color: "var(--sage)" }}>◈</span>
              <span>New Quote</span>
            </button>
          </div>
        </>
      )}

      {/* Workspace nav */}
      <div className="ds-sidebar-section">Workspace</div>
      <nav className="ds-sidebar-nav">
        {visibleItems.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`ds-sidebar-item${active ? " active" : ""}`}
            >
              <span style={{ fontSize: 15, lineHeight: 1, color: active ? "var(--violet)" : "currentColor" }}>
                {item.icon}
              </span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* AI Assistant */}
      <div className="ds-sidebar-section">Tools</div>
      <nav className="ds-sidebar-nav">
        <button
          onClick={onOpenAI}
          className="ds-sidebar-item w-full text-left"
          style={{ border: "none", background: "transparent", cursor: "pointer" }}
        >
          <span style={{ fontSize: 15, lineHeight: 1 }}>✦</span>
          <span>AI Assistant</span>
        </button>
      </nav>

      {/* Footer */}
      <div className="ds-sidebar-footer">
        {user && (
          <div className="ds-sidebar-user">
            <span className="ds-avatar">{initials(user.name)}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="ds-user-name">{user.name}</div>
              <div className="ds-user-role">{user.role}</div>
            </div>
            <button
              onClick={() => { logout(); router.push("/login"); }}
              title="Switch user"
              style={{
                background: "transparent",
                border: "none",
                color: "var(--text-dim)",
                cursor: "pointer",
                padding: "4px",
                borderRadius: "4px",
                fontSize: 16,
                lineHeight: 1,
                minHeight: "unset",
              }}
              onMouseEnter={e => (e.currentTarget.style.color = "var(--text-muted)")}
              onMouseLeave={e => (e.currentTarget.style.color = "var(--text-dim)")}
            >
              ⇄
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}

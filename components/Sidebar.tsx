"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useUser } from "@/context/UserContext";

interface Props {
  onOpenAI: () => void;
}

export default function Sidebar({ onOpenAI }: Props) {
  const pathname = usePathname();
  const { user, logout } = useUser();
  const router = useRouter();
  const [newDropdownOpen, setNewDropdownOpen] = useState(false);
  const quotesExpanded = pathname.startsWith("/quotes");

  const isManager = user?.role === "manager";

  const initials = (name: string) =>
    name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname === href;
  };

  const navLink = (href: string, icon: React.ReactNode, label: string) => {
    const active = isActive(href);
    return (
      <Link
        key={href}
        href={href}
        style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "0 12px", height: 40, borderRadius: 8,
          color: active ? "#FFFFFF" : "rgba(255,255,255,0.75)",
          fontSize: 13, fontWeight: 500, textDecoration: "none",
          background: active ? "#635BFF" : "transparent",
          transition: "background .15s, color .15s",
        }}
        onMouseEnter={e => { if (!active) { (e.currentTarget as HTMLAnchorElement).style.background = "rgba(255,255,255,0.1)"; (e.currentTarget as HTMLAnchorElement).style.color = "#FFFFFF"; } }}
        onMouseLeave={e => { if (!active) { (e.currentTarget as HTMLAnchorElement).style.background = "transparent"; (e.currentTarget as HTMLAnchorElement).style.color = "rgba(255,255,255,0.75)"; } }}
      >
        <span style={{ fontSize: 15, lineHeight: 1 }}>{icon}</span>
        <span>{label}</span>
      </Link>
    );
  };

  const subLink = (href: string, label: string) => {
    const active = pathname === href;
    return (
      <Link
        key={href}
        href={href}
        style={{
          display: "flex", alignItems: "center",
          padding: "0 12px 0 28px", height: 34, borderRadius: 8,
          color: active ? "#FFFFFF" : "rgba(255,255,255,0.65)",
          fontSize: 13, fontWeight: active ? 600 : 400, textDecoration: "none",
          background: active ? "#635BFF" : "transparent",
          transition: "background .15s, color .15s",
        }}
        onMouseEnter={e => { if (!active) { (e.currentTarget as HTMLAnchorElement).style.background = "rgba(255,255,255,0.08)"; (e.currentTarget as HTMLAnchorElement).style.color = "#FFFFFF"; } }}
        onMouseLeave={e => { if (!active) { (e.currentTarget as HTMLAnchorElement).style.background = "transparent"; (e.currentTarget as HTMLAnchorElement).style.color = "rgba(255,255,255,0.65)"; } }}
      >
        {label}
      </Link>
    );
  };

  return (
    <aside style={{ background: "#1A1760", width: 240, minWidth: 240, height: "100vh", display: "flex", flexDirection: "column" }}>
      {/* Brand */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "18px 18px 14px" }}>
        <span style={{ width: 28, height: 28, display: "inline-flex", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,0.1)", borderRadius: 8 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
          </svg>
        </span>
        <div style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: "0.14em", color: "#FFFFFF" }}>
          CLASS A JEWELLERS
        </div>
      </div>

      {/* New Order button */}
      <button
        style={{ margin: "0 14px 12px", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, height: 40, border: 0, borderRadius: 8, color: "#fff", fontWeight: 500, fontSize: 14, background: "#635BFF", cursor: "pointer", width: "calc(100% - 28px)" }}
        onClick={() => setNewDropdownOpen((v) => !v)}
        onMouseEnter={e => (e.currentTarget.style.background = "#4F46E5")}
        onMouseLeave={e => (e.currentTarget.style.background = "#635BFF")}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
        New Order
      </button>

      {newDropdownOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setNewDropdownOpen(false)} />
          <div className="absolute z-20 rounded-xl overflow-hidden" style={{
            top: 110, left: 14, right: 14,
            background: "#FFFFFF", border: "1px solid #E8E8F0",
            boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
          }}>
            <button
              onClick={() => { router.push("/orders/new"); setNewDropdownOpen(false); }}
              className="flex items-center gap-2 w-full px-4 py-3 text-sm font-medium"
              style={{ color: "#1A1A2E", background: "transparent" }}
              onMouseEnter={e => (e.currentTarget.style.background = "#EEF2FF")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >
              <span style={{ color: "#635BFF" }}>◻</span>
              <span>New Order</span>
            </button>
            <div style={{ height: 1, background: "#E8E8F0" }} />
            <button
              onClick={() => { router.push("/quote"); setNewDropdownOpen(false); }}
              className="flex items-center gap-2 w-full px-4 py-3 text-sm font-medium"
              style={{ color: "#1A1A2E", background: "transparent" }}
              onMouseEnter={e => (e.currentTarget.style.background = "#EEF2FF")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >
              <span style={{ color: "#635BFF" }}>◈</span>
              <span>New Quote</span>
            </button>
          </div>
        </>
      )}

      {/* Workspace nav */}
      <div style={{ padding: "14px 14px 4px", fontSize: 10.5, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(255,255,255,0.4)", fontWeight: 600 }}>Workspace</div>
      <nav style={{ display: "flex", flexDirection: "column", gap: 2, padding: "4px 10px" }}>
        {navLink("/", "⬡", "Dashboard")}
        {navLink("/orders", "≡", "Orders")}
        {navLink("/online", "◈", "Online")}

        {/* Quotes expandable */}
        <div>
          <div
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "0 12px", height: 40, borderRadius: 8, cursor: "pointer",
              color: quotesExpanded ? "#FFFFFF" : "rgba(255,255,255,0.75)",
              fontSize: 13, fontWeight: 500,
              background: "transparent",
            }}
            onClick={() => router.push("/quotes")}
            onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.1)"; (e.currentTarget as HTMLDivElement).style.color = "#FFFFFF"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = "transparent"; (e.currentTarget as HTMLDivElement).style.color = quotesExpanded ? "#FFFFFF" : "rgba(255,255,255,0.75)"; }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 15, lineHeight: 1 }}>◻</span>
              <span>Quotes</span>
            </div>
            <svg
              width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
              style={{ transform: quotesExpanded ? "rotate(180deg)" : "rotate(0deg)", transition: "transform .2s", opacity: 0.7 }}
            >
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </div>
          {quotesExpanded && (
            <div style={{ display: "flex", flexDirection: "column", gap: 1, marginTop: 2 }}>
              {subLink("/quotes", "Quotes Pipeline")}
              {subLink("/quotes/builder", "Build Quote")}
            </div>
          )}
        </div>

        {navLink("/customers", "⊙", "Customers")}
        {isManager && navLink("/workshop", "⚒", "Workshop")}
        {isManager && navLink("/revenue", "↗", "Revenue")}
        {isManager && navLink("/pricing", (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>
          </svg>
        ), "Pricing")}
        {isManager && navLink("/settings", "⊕", "Settings")}
      </nav>

      {/* AI Assistant */}
      <div style={{ padding: "14px 14px 4px", fontSize: 10.5, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(255,255,255,0.4)", fontWeight: 600 }}>Tools</div>
      <nav style={{ display: "flex", flexDirection: "column", gap: 2, padding: "4px 10px" }}>
        <button
          onClick={onOpenAI}
          style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 12px", height: 40, borderRadius: 8, color: "rgba(255,255,255,0.75)", fontSize: 13, fontWeight: 500, background: "transparent", border: "none", cursor: "pointer", textAlign: "left", width: "100%" }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.1)"; (e.currentTarget as HTMLButtonElement).style.color = "#FFFFFF"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.75)"; }}
        >
          <span style={{ fontSize: 15, lineHeight: 1 }}>✦</span>
          <span>AI Assistant</span>
        </button>
      </nav>

      {/* Footer */}
      <div style={{ padding: "10px 14px 14px", borderTop: "1px solid rgba(255,255,255,0.1)", marginTop: "auto" }}>
        {user && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: 6, borderRadius: 8 }}>
            <span style={{ width: 32, height: 32, borderRadius: "50%", background: "#635BFF", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 600, flexShrink: 0 }}>{initials(user.name)}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 500, color: "#FFFFFF" }}>{user.name}</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)" }}>{user.role}</div>
            </div>
            <button
              onClick={() => { logout(); router.push("/login"); }}
              title="Switch user"
              style={{ background: "#EEF2FF", border: "none", color: "#635BFF", cursor: "pointer", padding: "4px 8px", borderRadius: 6, fontSize: 12, lineHeight: 1, minHeight: "unset", fontWeight: 500 }}
            >
              Switch
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}

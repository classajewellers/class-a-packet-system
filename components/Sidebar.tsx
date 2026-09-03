"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useUser } from "@/context/UserContext";
import {
  LayoutDashboard,
  ShoppingBag,
  Wrench,
  FileText,
  Users,
  BarChart2,
  Settings,
  Sparkles,
  ChevronDown,
  Brain,
  Package,
  X,
} from "lucide-react";
import { canManage, hasPermission } from "@/lib/userTypes";
import { color, font } from "@/lib/theme";

interface Props {
  onOpenAI: () => void;
  mobileOpen: boolean;
  onClose: () => void;
}

// Light rail: black is used ONLY on the active pill; hover is a soft grey fill.
const ACTIVE_BG      = color.railActiveBg; // #0A0A0A — active pill
const ACTIVE_COLOR   = color.railActive;   // white text on the active pill
const DEFAULT_COLOR  = color.railText;     // grey nav text
const HOVER_BG       = color.railHover;    // soft grey fill on hover
const HOVER_COLOR    = color.ink;          // near-black text on hover

export default function Sidebar({ onOpenAI, mobileOpen, onClose }: Props) {
  const pathname = usePathname();
  const { user, roleLoading, logout } = useUser();
  const router = useRouter();

  const isManager = roleLoading ? true : canManage(user?.role);
  const isAdmin   = roleLoading ? false : user?.role === "admin";

  // Permission helpers — managers always get true via hasPermission
  const can = (module: Parameters<typeof hasPermission>[1]) =>
    roleLoading ? true : hasPermission(user ?? null, module);

  // Settings group is visible if user has pricing OR settings permission
  const showSettings = can("pricing") || can("settings") || isManager;

  const [quotesOpen, setQuotesOpen]       = useState(pathname.startsWith("/quotes"));
  const [inventoryOpen, setInventoryOpen] = useState(pathname.startsWith("/inventory"));
  const [settingsOpen, setSettingsOpen]   = useState(
    pathname.startsWith("/settings") || pathname.startsWith("/pricing") || pathname.startsWith("/admin/users") || pathname.startsWith("/workshop/settings") || pathname.startsWith("/quotes/settings") || pathname.startsWith("/inventory/settings")
  );

  // Auto-expand the relevant section when navigating directly to a sub-route
  useEffect(() => {
    if (pathname.startsWith("/quotes"))    setQuotesOpen(true);
    if (pathname.startsWith("/inventory")) setInventoryOpen(true);
    if (pathname.startsWith("/settings") || pathname.startsWith("/pricing") || pathname.startsWith("/admin/users") || pathname.startsWith("/workshop/settings") || pathname.startsWith("/quotes/settings") || pathname.startsWith("/inventory/settings")) setSettingsOpen(true);
  }, [pathname]);

  const initials = (name: string) =>
    name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    if (href === "/quotes") return pathname === "/quotes";
    return pathname === href || pathname.startsWith(href + "/");
  };

  // ── Sub-components ──────────────────────────────────────────────────────────

  function NavLink({ href, icon: Icon, label }: { href: string; icon: React.ElementType; label: string }) {
    const active = isActive(href);
    return (
      <Link
        href={href}
        onClick={onClose}
        style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "10px 16px", borderRadius: 8, textDecoration: "none",
          background: active ? ACTIVE_BG : "transparent",
          color: active ? ACTIVE_COLOR : DEFAULT_COLOR,
          fontWeight: active ? 500 : 400, fontSize: 14,
          transition: "background .15s, color .15s",
        }}
        onMouseEnter={e => { if (!active) { (e.currentTarget as HTMLAnchorElement).style.background = HOVER_BG; (e.currentTarget as HTMLAnchorElement).style.color = HOVER_COLOR; } }}
        onMouseLeave={e => { if (!active) { (e.currentTarget as HTMLAnchorElement).style.background = "transparent"; (e.currentTarget as HTMLAnchorElement).style.color = DEFAULT_COLOR; } }}
      >
        <Icon size={20} strokeWidth={1.75} />
        <span>{label}</span>
      </Link>
    );
  }

  function SubLink({ href, label }: { href: string; label: string }) {
    const active = pathname === href || pathname.startsWith(href + "/");
    return (
      <Link
        href={href}
        onClick={onClose}
        style={{
          display: "flex", alignItems: "center",
          padding: "8px 16px 8px 46px", borderRadius: 8, textDecoration: "none",
          background: active ? ACTIVE_BG : "transparent",
          color: active ? ACTIVE_COLOR : DEFAULT_COLOR,
          fontWeight: active ? 500 : 400, fontSize: 13,
          transition: "background .15s, color .15s",
        }}
        onMouseEnter={e => { if (!active) { (e.currentTarget as HTMLAnchorElement).style.background = HOVER_BG; (e.currentTarget as HTMLAnchorElement).style.color = HOVER_COLOR; } }}
        onMouseLeave={e => { if (!active) { (e.currentTarget as HTMLAnchorElement).style.background = "transparent"; (e.currentTarget as HTMLAnchorElement).style.color = DEFAULT_COLOR; } }}
      >
        {label}
      </Link>
    );
  }

  function ExpandLink({
    icon: Icon, label, expanded, onClick,
  }: { icon: React.ElementType; label: string; expanded: boolean; onClick: () => void }) {
    return (
      <div
        role="button" tabIndex={0}
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "10px 16px", borderRadius: 8, cursor: "pointer",
          background: expanded ? ACTIVE_BG : "transparent",
          color: expanded ? ACTIVE_COLOR : DEFAULT_COLOR,
          fontWeight: expanded ? 500 : 400, fontSize: 14,
          transition: "background .15s, color .15s",
        }}
        onClick={onClick}
        onMouseEnter={e => { if (!expanded) { (e.currentTarget as HTMLDivElement).style.background = HOVER_BG; (e.currentTarget as HTMLDivElement).style.color = HOVER_COLOR; } }}
        onMouseLeave={e => { if (!expanded) { (e.currentTarget as HTMLDivElement).style.background = "transparent"; (e.currentTarget as HTMLDivElement).style.color = DEFAULT_COLOR; } }}
        onKeyDown={e => { if (e.key === "Enter") onClick(); }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Icon size={20} strokeWidth={1.75} />
          <span>{label}</span>
        </div>
        <ChevronDown size={14} strokeWidth={2} style={{ transform: expanded ? "rotate(180deg)" : "rotate(0deg)", transition: "transform .2s", opacity: 0.6 }} />
      </div>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <>
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={[
          "fixed inset-y-0 left-0 z-50 transition-transform duration-300",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
          "md:static md:translate-x-0 md:transition-none",
        ].join(" ")}
        style={{
          background: color.railBg,
          borderRight: `1px solid ${color.railLine}`,
          width: 220, minWidth: 220,
          height: "100vh",
          display: "flex", flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Brand + mobile close */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "24px 20px 20px" }}>
          <span style={{ width: 40, height: 40, borderRadius: 10, background: color.ink, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color.white} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 3h12l4 6-10 12L2 9z" />
              <path d="M2 9h20" />
              <path d="M6 3l4 6m4 0l4-6" />
            </svg>
          </span>
          <div style={{ fontFamily: font.mono, flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: "0.14em", color: color.ink, lineHeight: 1 }}>VAULT</div>
            <div style={{ fontSize: 10, fontWeight: 500, letterSpacing: "0.08em", color: color.textFaint, marginTop: 3, textTransform: "uppercase" as const }}>Jewellery Management</div>
          </div>
          <button
            onClick={onClose}
            className="md:hidden flex items-center justify-center rounded-lg"
            style={{ background: color.fill, border: "none", cursor: "pointer", color: color.textMuted, width: 32, height: 32, flexShrink: 0 }}
            aria-label="Close menu"
          >
            <X size={16} strokeWidth={2} />
          </button>
        </div>

        {/* Nav */}
        <nav style={{ display: "flex", flexDirection: "column", gap: 2, padding: "4px 10px", flex: 1, overflowY: "auto" }}>

          <NavLink href="/" icon={LayoutDashboard} label="Dashboard" />

          {can("orders")    && <NavLink href="/orders"    icon={ShoppingBag} label="Orders" />}

          {can("quotes") && (
            <div>
              <ExpandLink
                icon={FileText} label="Quotes" expanded={quotesOpen}
                onClick={() => {
                  if (quotesOpen) { setQuotesOpen(false); }
                  else { setQuotesOpen(true); router.push("/quotes"); onClose(); }
                }}
              />
              {quotesOpen && (
                <div style={{ display: "flex", flexDirection: "column", gap: 1, marginTop: 2 }}>
                  <SubLink href="/quotes"               label="Quotes Pipeline" />
                  <SubLink href="/quotes/builder"       label="Build Quote" />
                  <SubLink href="/quotes/charm-builder" label="Charm Builder" />
                </div>
              )}
            </div>
          )}

          {can("customers")  && <NavLink href="/customers"  icon={Users}    label="Customers" />}
          {can("workshop") && <NavLink href="/workshop" icon={Wrench} label="Workshop" />}

          {can("inventory") && (
            <div>
              <ExpandLink
                icon={Package} label="Inventory" expanded={inventoryOpen}
                onClick={() => {
                  if (inventoryOpen) { setInventoryOpen(false); }
                  else { setInventoryOpen(true); router.push("/inventory"); onClose(); }
                }}
              />
              {inventoryOpen && (
                <div style={{ display: "flex", flexDirection: "column", gap: 1, marginTop: 2 }}>
                  <SubLink href="/inventory"                         label="Stock" />
                  <SubLink href="/inventory/products"                label="Products" />
                  {isManager && <SubLink href="/inventory/purchase-orders" label="Purchasing" />}
                  {isManager && <SubLink href="/inventory/locations"       label="Locations" />}
                  {isManager && <SubLink href="/inventory/suppliers"       label="Suppliers" />}
                </div>
              )}
            </div>
          )}

          {can("vault_brain") && <NavLink href="/vault/brain" icon={Brain}    label="Vault Brain" />}
          {can("reporting")  && <NavLink href="/reporting"  icon={BarChart2} label="Reporting" />}

          {showSettings && (
            <div>
              <ExpandLink
                icon={Settings} label="Settings" expanded={settingsOpen}
                onClick={() => {
                  if (settingsOpen) { setSettingsOpen(false); }
                  else { setSettingsOpen(true); router.push(can("settings") ? "/settings/users" : "/pricing"); onClose(); }
                }}
              />
              {settingsOpen && (
                <div style={{ display: "flex", flexDirection: "column", gap: 1, marginTop: 2 }}>
                  {can("settings") && isManager && <SubLink href="/settings"           label="Integrations" />}
                  {can("pricing")  && <SubLink href="/pricing"                      label="Pricing" />}
                  {can("pricing")  && <SubLink href="/settings/pricing"           label="Pricing Margins" />}
                  {can("pricing")  && <SubLink href="/pricing/charm-builder"      label="Charm Builder" />}
                  {can("settings") && <SubLink href="/settings/users"     label="Users" />}
                  {can("settings") && <SubLink href="/settings/staff"     label="Staff" />}
                  {can("settings") && <SubLink href="/settings/vip-tiers" label="VIP Tiers" />}
                  {can("settings") && isManager && <SubLink href="/settings/tenants" label="Stores" />}
                  {can("workshop") && isManager && <SubLink href="/workshop/settings" label="Workshop" />}
                  {isManager       && <SubLink href="/inventory/settings"  label="Inventory" />}
                  {isManager       && <SubLink href="/quotes/settings"     label="Repair Quoting" />}
                  {isAdmin         && <SubLink href="/admin/users"         label="Admin Users" />}
                </div>
              )}
            </div>
          )}

          <button
            onClick={() => { onOpenAI(); onClose(); }}
            style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "10px 16px", borderRadius: 8,
              background: "transparent", border: "none", cursor: "pointer",
              color: DEFAULT_COLOR, fontWeight: 400, fontSize: 14,
              textAlign: "left", width: "100%",
              transition: "background .15s, color .15s",
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = HOVER_BG; (e.currentTarget as HTMLButtonElement).style.color = HOVER_COLOR; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; (e.currentTarget as HTMLButtonElement).style.color = DEFAULT_COLOR; }}
          >
            <Sparkles size={20} strokeWidth={1.75} />
            <span>AI Assistant</span>
          </button>
        </nav>

        {/* Footer */}
        <div style={{ borderTop: `1px solid ${color.railLine}`, padding: "12px 16px 16px" }}>
          {user && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <span style={{ width: 34, height: 34, borderRadius: "50%", background: color.ink, color: color.white, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 600, flexShrink: 0 }}>
                {initials(user.name)}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: color.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{user.name}</div>
                <div style={{ fontSize: 11, color: DEFAULT_COLOR, textTransform: "capitalize" }}>{user.role ?? "…"}</div>
              </div>
              <button
                onClick={logout}
                title="Sign out"
                style={{ background: color.fill, border: "none", color: color.textMuted, cursor: "pointer", padding: "5px 12px", borderRadius: 9999, fontSize: 11, fontWeight: 500, flexShrink: 0, transition: "background .15s" }}
                onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.background = color.line)}
                onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.background = color.fill)}
              >
                Sign out
              </button>
            </div>
          )}
          <div style={{ fontSize: 11, color: color.textFaint, textAlign: "center", paddingTop: 4 }}>© 2026 Vault</div>
        </div>
      </aside>
    </>
  );
}

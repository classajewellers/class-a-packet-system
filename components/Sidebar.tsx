"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useUser } from "@/context/UserContext";
import {
  LayoutGrid,
  Briefcase,
  Wrench,
  TrendingUp,
  Users,
  BarChart2,
  Settings,
  Sparkles,
  ChevronDown,
  Package,
  ShoppingBag,
  X,
  Eye,
} from "lucide-react";
import { canManage, hasPermission, UserRole } from "@/lib/userTypes";
import { VIEW_AS_ALLOWED_PROFILE_ID } from "@/lib/effective-role";

interface Props {
  onOpenAI: () => void;
  mobileOpen: boolean;
  onClose: () => void;
}

// ── Vault design system v1 ────────────────────────────────────────────────
// Dark graphite, not navy/purple. Selection is a subtle lighter-graphite
// background + a thin violet indicator bar, never a large violet block.
const SIDEBAR_BG      = "var(--vault-graphite)";
const HOVER_BG        = "var(--vault-graphite-hover)";
const DEFAULT_COLOR   = "var(--vault-graphite-text)";
const ACTIVE_COLOR    = "var(--vault-graphite-text-active)";

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

  const [salesOpen, setSalesOpen]         = useState(pathname.startsWith("/quotes") || pathname.startsWith("/leads"));
  const [inventoryOpen, setInventoryOpen] = useState(pathname.startsWith("/inventory"));
  const [pricingGroupOpen, setPricingGroupOpen] = useState(
    pathname.startsWith("/pricing") || pathname.startsWith("/settings/pricing") || pathname.startsWith("/settings/melee")
  );
  const [settingsOpen, setSettingsOpen]   = useState(
    pathname.startsWith("/settings") || pathname.startsWith("/pricing") || pathname.startsWith("/admin/users") || pathname.startsWith("/workshop/settings") || pathname.startsWith("/quotes/settings") || pathname.startsWith("/inventory/settings")
  );

  // Auto-expand the relevant section when navigating directly to a sub-route
  useEffect(() => {
    if (pathname.startsWith("/quotes") || pathname.startsWith("/leads")) setSalesOpen(true);
    if (pathname.startsWith("/inventory")) setInventoryOpen(true);
    if (pathname.startsWith("/settings") || pathname.startsWith("/pricing") || pathname.startsWith("/admin/users") || pathname.startsWith("/workshop/settings") || pathname.startsWith("/quotes/settings") || pathname.startsWith("/inventory/settings")) setSettingsOpen(true);
  }, [pathname]);

  const initials = (name: string) =>
    name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);

  // ── View-as ("Switch View") — Josh's account only ──────────────────────────
  const canSwitchView = !!user && user.id === VIEW_AS_ALLOWED_PROFILE_ID;
  const isViewingAs   = !!user && user.role !== user.realRole;
  const [switchMenuOpen, setSwitchMenuOpen] = useState(false);
  const [switching, setSwitching]           = useState(false);

  const RANK: Record<Exclude<UserRole, null>, number> = { staff: 1, manager: 2, admin: 3 };
  // Offer the real role (= exit) plus every lower role. Escalation is impossible
  // server-side regardless, but we don't even present higher options.
  const roleOptions = (["admin", "manager", "staff"] as const).filter(
    (r) => user?.realRole != null && RANK[r] <= RANK[user.realRole as Exclude<UserRole, null>]
  );

  async function switchView(role: UserRole) {
    if (switching) return;
    setSwitching(true);
    try {
      // role === realRole clears the override; otherwise sets the downgrade.
      const body = role && role !== user?.realRole ? { role } : { role: null };
      await fetch("/api/dev/switch-view", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      // Full reload so server (require-auth) and client (UserContext) re-read
      // the cookie together — no half-switched state.
      window.location.reload();
    } catch {
      setSwitching(false);
      setSwitchMenuOpen(false);
    }
  }

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    if (href === "/quotes") return pathname === "/quotes";
    return pathname === href || pathname.startsWith(href + "/");
  };

  // ── Sub-components ──────────────────────────────────────────────────────────
  // A thin violet indicator bar (not a violet background block) marks the
  // active item - Vault Violet stays a rare, small accent per the design
  // system, never the default navigation fill colour.

  function NavLink({ href, icon: Icon, label }: { href: string; icon: React.ElementType; label: string }) {
    const active = isActive(href);
    return (
      <Link
        href={href}
        onClick={onClose}
        style={{
          position: "relative",
          display: "flex", alignItems: "center", gap: 10,
          padding: "9px 16px 9px 19px", borderRadius: 6, textDecoration: "none",
          background: active ? HOVER_BG : "transparent",
          color: active ? ACTIVE_COLOR : DEFAULT_COLOR,
          fontWeight: active ? 600 : 400, fontSize: 14,
          transition: "background var(--vault-motion-fast), color var(--vault-motion-fast)",
        }}
        onMouseEnter={e => { if (!active) { (e.currentTarget as HTMLAnchorElement).style.background = HOVER_BG; (e.currentTarget as HTMLAnchorElement).style.color = ACTIVE_COLOR; } }}
        onMouseLeave={e => { if (!active) { (e.currentTarget as HTMLAnchorElement).style.background = "transparent"; (e.currentTarget as HTMLAnchorElement).style.color = DEFAULT_COLOR; } }}
      >
        {active && <span style={{ position: "absolute", left: 0, top: "50%", transform: "translateY(-50%)", width: 3, height: 16, borderRadius: 2, background: "var(--vault-violet)" }} />}
        <Icon size={17} strokeWidth={1.75} />
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
          padding: "7px 16px 7px 45px", borderRadius: 6, textDecoration: "none",
          background: active ? HOVER_BG : "transparent",
          color: active ? ACTIVE_COLOR : DEFAULT_COLOR,
          fontWeight: active ? 500 : 400, fontSize: 13,
          transition: "background var(--vault-motion-fast), color var(--vault-motion-fast)",
        }}
        onMouseEnter={e => { if (!active) { (e.currentTarget as HTMLAnchorElement).style.background = HOVER_BG; (e.currentTarget as HTMLAnchorElement).style.color = ACTIVE_COLOR; } }}
        onMouseLeave={e => { if (!active) { (e.currentTarget as HTMLAnchorElement).style.background = "transparent"; (e.currentTarget as HTMLAnchorElement).style.color = DEFAULT_COLOR; } }}
      >
        {label}
      </Link>
    );
  }

  function SubExpandLink({ label, expanded, onClick }: { label: string; expanded: boolean; onClick: () => void }) {
    return (
      <div
        role="button" tabIndex={0}
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "7px 16px 7px 45px", borderRadius: 6, cursor: "pointer",
          background: expanded ? HOVER_BG : "transparent",
          color: expanded ? ACTIVE_COLOR : DEFAULT_COLOR,
          fontWeight: expanded ? 500 : 400, fontSize: 13,
          transition: "background var(--vault-motion-fast), color var(--vault-motion-fast)",
        }}
        onClick={onClick}
        onKeyDown={e => { if (e.key === "Enter") onClick(); }}
      >
        <span>{label}</span>
        <ChevronDown size={12} strokeWidth={2} style={{ transform: expanded ? "rotate(180deg)" : "rotate(0deg)", transition: "transform .2s", opacity: 0.6 }} />
      </div>
    );
  }

  function SubSubLink({ href, label }: { href: string; label: string }) {
    const active = pathname === href || pathname.startsWith(href + "/");
    return (
      <Link
        href={href}
        onClick={onClose}
        style={{
          display: "flex", alignItems: "center",
          padding: "6px 16px 6px 62px", borderRadius: 6, textDecoration: "none",
          background: active ? HOVER_BG : "transparent",
          color: active ? ACTIVE_COLOR : DEFAULT_COLOR,
          fontWeight: active ? 500 : 400, fontSize: 12.5,
          transition: "background var(--vault-motion-fast), color var(--vault-motion-fast)",
        }}
        onMouseEnter={e => { if (!active) { (e.currentTarget as HTMLAnchorElement).style.background = HOVER_BG; (e.currentTarget as HTMLAnchorElement).style.color = ACTIVE_COLOR; } }}
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
          padding: "9px 16px 9px 19px", borderRadius: 6, cursor: "pointer",
          background: expanded ? HOVER_BG : "transparent",
          color: expanded ? ACTIVE_COLOR : DEFAULT_COLOR,
          fontWeight: expanded ? 600 : 400, fontSize: 14,
          transition: "background var(--vault-motion-fast), color var(--vault-motion-fast)",
        }}
        onClick={onClick}
        onMouseEnter={e => { if (!expanded) { (e.currentTarget as HTMLDivElement).style.background = HOVER_BG; (e.currentTarget as HTMLDivElement).style.color = ACTIVE_COLOR; } }}
        onMouseLeave={e => { if (!expanded) { (e.currentTarget as HTMLDivElement).style.background = "transparent"; (e.currentTarget as HTMLDivElement).style.color = DEFAULT_COLOR; } }}
        onKeyDown={e => { if (e.key === "Enter") onClick(); }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Icon size={17} strokeWidth={1.75} />
          <span>{label}</span>
        </div>
        <ChevronDown size={13} strokeWidth={2} style={{ transform: expanded ? "rotate(180deg)" : "rotate(0deg)", transition: "transform .2s", opacity: 0.6 }} />
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
          background: SIDEBAR_BG,
          width: 224, minWidth: 224,
          height: "100vh",
          display: "flex", flexDirection: "column",
          overflow: "hidden",
          // Loud, persistent indicator that a downgraded view is active.
          borderLeft: isViewingAs ? "4px solid var(--vault-status-warning)" : undefined,
        }}
      >
        {isViewingAs && (
          <div
            style={{
              background: "var(--vault-status-warning)", color: "#FFFFFF",
              fontSize: 11, fontWeight: 600,
              display: "flex", alignItems: "center", justifyContent: "space-between",
              gap: 8, padding: "6px 12px",
            }}
          >
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
              <Eye size={13} strokeWidth={2.25} />
              Viewing as {String(user?.role).toLowerCase()}
            </span>
            <button
              type="button"
              disabled={switching}
              onClick={() => switchView(user?.realRole ?? null)}
              style={{
                background: "rgba(255,255,255,0.18)", border: "1px solid rgba(255,255,255,0.3)",
                color: "#FFFFFF", cursor: switching ? "wait" : "pointer",
                borderRadius: 5, padding: "2px 8px", fontSize: 10, fontWeight: 600,
              }}
            >
              Exit view
            </button>
          </div>
        )}

        {/* Brand + mobile close — normal controlled spacing, no decorative
            imagery, no tagline. */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "20px 20px 18px" }}>
          <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: "0.01em", color: "#FFFFFF", flex: 1 }}>
            Vault
          </div>
          <button
            onClick={onClose}
            className="md:hidden flex items-center justify-center rounded-lg"
            style={{ background: "rgba(255,255,255,0.06)", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.6)", width: 30, height: 30, flexShrink: 0 }}
            aria-label="Close menu"
          >
            <X size={15} strokeWidth={2} />
          </button>
        </div>

        {/* Nav — Home / Jobs / Sales / Workshop / Customers / Inventory is the
            core hierarchy; Vault AI / Reports / Settings are secondary
            utilities near the bottom. Existing routes/permissions are
            unchanged - only labels and grouping moved. */}
        <nav style={{ display: "flex", flexDirection: "column", gap: 1, padding: "6px 10px", flex: 1, overflowY: "auto" }}>

          <NavLink href="/" icon={LayoutGrid} label="Home" />

          {can("orders") && <NavLink href="/orders" icon={Briefcase} label="Jobs" />}

          {can("quotes") && (
            <div>
              <ExpandLink
                icon={TrendingUp} label="Sales" expanded={salesOpen}
                onClick={() => {
                  if (salesOpen) { setSalesOpen(false); }
                  else { setSalesOpen(true); router.push("/quotes"); onClose(); }
                }}
              />
              {salesOpen && (
                <div style={{ display: "flex", flexDirection: "column", gap: 1, marginTop: 1 }}>
                  <SubLink href="/quotes"               label="Pipeline" />
                  <SubLink href="/leads"                label="Leads" />
                  <SubLink href="/quotes/builder"       label="New Quote" />
                  <SubLink href="/quotes/charm-builder" label="Charm Builder" />
                </div>
              )}
            </div>
          )}

          {(can("quotes") || can("inventory")) && (
            <NavLink href="/pos" icon={ShoppingBag} label="POS" />
          )}

          {can("workshop")  && <NavLink href="/workshop"  icon={Wrench} label="Workshop" />}
          {can("customers") && <NavLink href="/customers" icon={Users}  label="Customers" />}

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
                <div style={{ display: "flex", flexDirection: "column", gap: 1, marginTop: 1 }}>
                  <SubLink href="/inventory"                         label="Stock" />
                  <SubLink href="/inventory/products"                label="Products" />
                  {isManager && <SubLink href="/inventory/purchase-orders" label="Purchasing" />}
                  {isManager && <SubLink href="/inventory/locations"       label="Locations" />}
                  {isManager && <SubLink href="/inventory/suppliers"       label="Suppliers" />}
                </div>
              )}
            </div>
          )}

          {/* ── Secondary utilities ─────────────────────────────────────── */}
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", margin: "10px 6px 6px" }} />

          <button
            onClick={() => { onOpenAI(); onClose(); }}
            style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "9px 16px 9px 19px", borderRadius: 6,
              background: "transparent", border: "none", cursor: "pointer",
              color: DEFAULT_COLOR, fontWeight: 400, fontSize: 14,
              textAlign: "left", width: "100%",
              transition: "background var(--vault-motion-fast), color var(--vault-motion-fast)",
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = HOVER_BG; (e.currentTarget as HTMLButtonElement).style.color = ACTIVE_COLOR; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; (e.currentTarget as HTMLButtonElement).style.color = DEFAULT_COLOR; }}
          >
            <Sparkles size={17} strokeWidth={1.75} style={{ color: "var(--vault-violet)" }} />
            <span>Vault AI</span>
          </button>

          {can("vault_brain") && <NavLink href="/vault/brain" icon={Sparkles} label="Vault Brain" />}
          {can("reporting")   && <NavLink href="/reporting"  icon={BarChart2} label="Reports" />}

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
                <div style={{ display: "flex", flexDirection: "column", gap: 1, marginTop: 1 }}>
                  {can("settings") && isManager && <SubLink href="/settings"           label="Integrations" />}
                  {can("pricing") && (
                    <div>
                      <SubExpandLink
                        label="Pricing" expanded={pricingGroupOpen}
                        onClick={() => setPricingGroupOpen(v => !v)}
                      />
                      {pricingGroupOpen && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                          <SubSubLink href="/pricing"                 label="Rates & Lookups" />
                          <SubSubLink href="/settings/pricing"        label="Pricing Margins" />
                          <SubSubLink href="/settings/melee"          label="Melee Pricing" />
                          <SubSubLink href="/pricing/charm-builder"   label="Charm Builder" />
                        </div>
                      )}
                    </div>
                  )}
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
        </nav>

        {/* Footer — user identity, no decorative avatar colour block. */}
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", padding: "12px 16px 16px" }}>
          {user && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <span style={{ width: 30, height: 30, borderRadius: "50%", background: "var(--vault-graphite-hover)", color: "#FFFFFF", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 600, flexShrink: 0, border: "1px solid rgba(255,255,255,0.1)" }}>
                {initials(user.name)}
              </span>
              <div style={{ flex: 1, minWidth: 0, position: "relative" }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: "#FFFFFF", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{user.name}</div>

                {canSwitchView ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setSwitchMenuOpen(o => !o)}
                      title="Switch view"
                      style={{
                        display: "inline-flex", alignItems: "center", gap: 4, marginTop: 1,
                        border: "none", cursor: "pointer", borderRadius: 5, padding: "1px 6px 1px 0",
                        fontSize: 11, fontWeight: 500, lineHeight: 1.4,
                        background: "transparent",
                        color: isViewingAs ? "var(--vault-status-warning)" : DEFAULT_COLOR,
                      }}
                    >
                      {isViewingAs && <Eye size={11} strokeWidth={2.25} />}
                      <span style={{ textTransform: isViewingAs ? "none" : "capitalize" }}>
                        {isViewingAs ? `Viewing as ${String(user.role).toLowerCase()}` : (user.role ?? "…")}
                      </span>
                      <ChevronDown size={11} strokeWidth={2.25} />
                    </button>

                    {switchMenuOpen && (
                      <div
                        style={{
                          position: "absolute", bottom: "calc(100% + 6px)", left: 0, zIndex: 50,
                          minWidth: 150, background: "var(--vault-graphite-hover)", border: "1px solid rgba(255,255,255,0.12)",
                          borderRadius: "var(--vault-radius-sm)", padding: 4, boxShadow: "var(--vault-shadow-elevated)",
                        }}
                      >
                        <div style={{ fontSize: 10, color: DEFAULT_COLOR, padding: "4px 8px 6px", textTransform: "uppercase", letterSpacing: 0.4 }}>
                          View Vault as
                        </div>
                        {roleOptions.map((r) => {
                          const isReal = r === user.realRole;
                          const active = r === user.role;
                          return (
                            <button
                              key={r}
                              type="button"
                              disabled={switching}
                              onClick={() => switchView(r)}
                              style={{
                                display: "flex", alignItems: "center", justifyContent: "space-between",
                                width: "100%", border: "none", cursor: switching ? "wait" : "pointer",
                                background: active ? "rgba(255,255,255,0.08)" : "transparent",
                                color: active ? "#FFFFFF" : DEFAULT_COLOR,
                                borderRadius: 5, padding: "6px 8px", fontSize: 12, fontWeight: 500,
                                textAlign: "left", textTransform: "capitalize",
                              }}
                            >
                              <span>{r}{isReal ? " (your role)" : ""}</span>
                              {active && <span style={{ fontSize: 9, color: "var(--vault-violet)" }}>●</span>}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </>
                ) : (
                  <div style={{ fontSize: 11, color: DEFAULT_COLOR, textTransform: "capitalize" }}>{user.role ?? "…"}</div>
                )}
              </div>
              <button
                onClick={logout}
                title="Sign out"
                style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.12)", color: DEFAULT_COLOR, cursor: "pointer", padding: "4px 10px", borderRadius: "var(--vault-radius-sm)", fontSize: 11, fontWeight: 500, flexShrink: 0, transition: "background var(--vault-motion-fast)" }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.06)"; (e.currentTarget as HTMLButtonElement).style.color = "#FFFFFF"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; (e.currentTarget as HTMLButtonElement).style.color = DEFAULT_COLOR; }}
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

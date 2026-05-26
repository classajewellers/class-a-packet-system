"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useUser } from "@/context/UserContext";
import {
  LayoutDashboard,
  ShoppingBag,
  Globe,
  Wrench,
  FileText,
  Users,
  BarChart2,
  Settings,
  Sparkles,
  ChevronDown,
  Package,
} from "lucide-react";
import { canManage } from "@/lib/userTypes";

interface Props {
  onOpenAI: () => void;
}

const ACTIVE_BG = "rgba(99, 91, 255, 0.15)";
const DEFAULT_COLOR = "#8B8FC8";
const ACTIVE_COLOR = "#FFFFFF";

export default function Sidebar({ onOpenAI }: Props) {
  const pathname = usePathname();
  const { user, roleLoading, logout } = useUser();
  const router = useRouter();

  const isManager = canManage(user?.role);
  const isAdmin = user?.role === "admin";

  const quotesExpanded    = pathname.startsWith("/quotes");
  const inventoryExpanded = pathname.startsWith("/inventory");
  const settingsExpanded  = pathname.startsWith("/settings") ||
                            pathname.startsWith("/pricing") ||
                            pathname.startsWith("/admin/users");

  const initials = (name: string) =>
    name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);

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
        style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "10px 16px", borderRadius: 8, textDecoration: "none",
          background: active ? ACTIVE_BG : "transparent",
          color: active ? ACTIVE_COLOR : DEFAULT_COLOR,
          fontWeight: active ? 500 : 400, fontSize: 14,
          transition: "background .15s, color .15s",
        }}
        onMouseEnter={(e) => { if (!active) { (e.currentTarget as HTMLAnchorElement).style.background = ACTIVE_BG; (e.currentTarget as HTMLAnchorElement).style.color = ACTIVE_COLOR; } }}
        onMouseLeave={(e) => { if (!active) { (e.currentTarget as HTMLAnchorElement).style.background = "transparent"; (e.currentTarget as HTMLAnchorElement).style.color = DEFAULT_COLOR; } }}
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
        style={{
          display: "flex", alignItems: "center",
          padding: "8px 16px 8px 46px", borderRadius: 8, textDecoration: "none",
          background: active ? ACTIVE_BG : "transparent",
          color: active ? ACTIVE_COLOR : DEFAULT_COLOR,
          fontWeight: active ? 500 : 400, fontSize: 13,
          transition: "background .15s, color .15s",
        }}
        onMouseEnter={(e) => { if (!active) { (e.currentTarget as HTMLAnchorElement).style.background = ACTIVE_BG; (e.currentTarget as HTMLAnchorElement).style.color = ACTIVE_COLOR; } }}
        onMouseLeave={(e) => { if (!active) { (e.currentTarget as HTMLAnchorElement).style.background = "transparent"; (e.currentTarget as HTMLAnchorElement).style.color = DEFAULT_COLOR; } }}
      >
        {label}
      </Link>
    );
  }

  /** Expandable section header (like Quotes, Inventory, Settings) */
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
        onMouseEnter={(e) => { if (!expanded) { (e.currentTarget as HTMLDivElement).style.background = ACTIVE_BG; (e.currentTarget as HTMLDivElement).style.color = ACTIVE_COLOR; } }}
        onMouseLeave={(e) => { if (!expanded) { (e.currentTarget as HTMLDivElement).style.background = "transparent"; (e.currentTarget as HTMLDivElement).style.color = DEFAULT_COLOR; } }}
        onKeyDown={(e) => { if (e.key === "Enter") onClick(); }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Icon size={20} strokeWidth={1.75} />
          <span>{label}</span>
        </div>
        <ChevronDown size={14} strokeWidth={2} style={{ transform: expanded ? "rotate(180deg)" : "rotate(0deg)", transition: "transform .2s", opacity: 0.6 }} />
      </div>
    );
  }

  /** Skeleton bar shown while role is loading */
  function SkeletonItem() {
    return (
      <div style={{ padding: "10px 16px", display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 20, height: 20, borderRadius: 4, background: "rgba(255,255,255,0.08)" }} />
        <div style={{ height: 12, width: 80, borderRadius: 4, background: "rgba(255,255,255,0.08)" }} />
      </div>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <aside style={{ background: "#1A1760", width: 220, minWidth: 220, height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>

      {/* Brand */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "24px 20px 20px" }}>
        <span style={{ width: 40, height: 40, borderRadius: 10, background: "#635BFF", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
        </span>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", color: "#FFFFFF", lineHeight: 1.3 }}>
          CLASS A<br />JEWELLERS
        </div>
      </div>

      {/* Nav */}
      <nav style={{ display: "flex", flexDirection: "column", gap: 2, padding: "4px 10px", flex: 1, overflowY: "auto" }}>

        {/* Always-visible items */}
        <NavLink href="/"          icon={LayoutDashboard} label="Dashboard" />
        <NavLink href="/orders"    icon={ShoppingBag}     label="Orders" />
        <NavLink href="/online"    icon={Globe}           label="Online" />

        {/* Quotes — expandable */}
        <div>
          <ExpandLink
            icon={FileText} label="Quotes" expanded={quotesExpanded}
            onClick={() => router.push("/quotes")}
          />
          {quotesExpanded && (
            <div style={{ display: "flex", flexDirection: "column", gap: 1, marginTop: 2 }}>
              <SubLink href="/quotes"         label="Quotes Pipeline" />
              <SubLink href="/quotes/builder" label="Build Quote" />
            </div>
          )}
        </div>

        <NavLink href="/customers" icon={Users} label="Customers" />

        {/* Manager-only top-level items — show skeleton while role loads */}
        {roleLoading ? (
          <>
            <SkeletonItem />
            <SkeletonItem />
            <SkeletonItem />
          </>
        ) : isManager ? (
          <>
            <NavLink href="/workshop" icon={Wrench} label="Workshop" />

            {/* Inventory — expandable */}
            <div>
              <ExpandLink
                icon={Package} label="Inventory" expanded={inventoryExpanded}
                onClick={() => router.push("/inventory/stock")}
              />
              {inventoryExpanded && (
                <div style={{ display: "flex", flexDirection: "column", gap: 1, marginTop: 2 }}>
                  <SubLink href="/inventory/stock"     label="Stock" />
                  <SubLink href="/inventory/locations" label="Locations" />
                  <SubLink href="/inventory/suppliers" label="Suppliers" />
                </div>
              )}
            </div>

            <NavLink href="/reporting" icon={BarChart2} label="Reporting" />

            {/* Settings — expandable, admin/manager */}
            <div>
              <ExpandLink
                icon={Settings} label="Settings" expanded={settingsExpanded}
                onClick={() => router.push("/settings")}
              />
              {settingsExpanded && (
                <div style={{ display: "flex", flexDirection: "column", gap: 1, marginTop: 2 }}>
                  <SubLink href="/settings"     label="Preferences" />
                  <SubLink href="/pricing"      label="Pricing" />
                  {isAdmin && <SubLink href="/admin/users" label="Users" />}
                </div>
              )}
            </div>
          </>
        ) : null}

        {/* AI Assistant */}
        <button
          onClick={onOpenAI}
          style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "10px 16px", borderRadius: 8,
            background: "transparent", border: "none", cursor: "pointer",
            color: DEFAULT_COLOR, fontWeight: 400, fontSize: 14,
            textAlign: "left", width: "100%",
            transition: "background .15s, color .15s",
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = ACTIVE_BG; (e.currentTarget as HTMLButtonElement).style.color = ACTIVE_COLOR; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; (e.currentTarget as HTMLButtonElement).style.color = DEFAULT_COLOR; }}
        >
          <Sparkles size={20} strokeWidth={1.75} />
          <span>AI Assistant</span>
        </button>
      </nav>

      {/* Footer */}
      <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", padding: "12px 16px 16px" }}>
        {user && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <span style={{ width: 34, height: 34, borderRadius: "50%", background: "#635BFF", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 600, flexShrink: 0 }}>
              {initials(user.name)}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: "#FFFFFF", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {user.name}
              </div>
              <div style={{ fontSize: 11, color: DEFAULT_COLOR, textTransform: "capitalize" }}>
                {roleLoading ? (
                  <span style={{ display: "inline-block", width: 40, height: 10, borderRadius: 3, background: "rgba(255,255,255,0.12)" }} />
                ) : (
                  user.role ?? "…"
                )}
              </div>
            </div>
            <button
              onClick={async () => { await logout(); router.push("/login"); }}
              title="Sign out"
              style={{ background: "rgba(99,91,255,0.2)", border: "none", color: "#A5B4FC", cursor: "pointer", padding: "4px 10px", borderRadius: 6, fontSize: 11, fontWeight: 500, flexShrink: 0, transition: "background .15s" }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.background = "rgba(99,91,255,0.35)")}
              onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.background = "rgba(99,91,255,0.2)")}
            >
              Sign out
            </button>
          </div>
        )}
        <div style={{ fontSize: 11, color: "#4A4A8A", textAlign: "center", paddingTop: 4 }}>
          © 2026 Class A Jewellers
        </div>
      </div>
    </aside>
  );
}

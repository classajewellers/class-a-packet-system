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
  Brain,
  X,
} from "lucide-react";
import { canManage } from "@/lib/userTypes";

interface Props {
  onOpenAI: () => void;
  mobileOpen: boolean;
  onClose: () => void;
}

const ACTIVE_BG = "rgba(99, 91, 255, 0.15)";
const DEFAULT_COLOR = "#8B8FC8";
const ACTIVE_COLOR = "#FFFFFF";

export default function Sidebar({ onOpenAI, mobileOpen, onClose }: Props) {
  const pathname = usePathname();
  const { user, roleLoading, logout } = useUser();
  const router = useRouter();

  const isManager = roleLoading ? true : canManage(user?.role);
  const isAdmin   = roleLoading ? false : user?.role === "admin";

  const quotesExpanded    = pathname.startsWith("/quotes");
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
        onClick={onClose}
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
        onClick={onClose}
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

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Mobile backdrop — tapping it closes the drawer */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={[
          // Mobile: fixed drawer that slides in/out
          "fixed inset-y-0 left-0 z-50 transition-transform duration-300",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
          // Desktop: static, always visible, no transform
          "md:static md:translate-x-0 md:transition-none",
        ].join(" ")}
        style={{
          background: "#1A1760",
          width: 220, minWidth: 220,
          height: "100vh",
          display: "flex", flexDirection: "column",
          overflow: "hidden",
        }}
      >

        {/* Brand + mobile close button */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "24px 20px 20px" }}>
          <span style={{ width: 40, height: 40, borderRadius: 10, background: "#635BFF", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 3h12l4 6-10 12L2 9z" />
              <path d="M2 9h20" />
              <path d="M6 3l4 6m4 0l4-6" />
            </svg>
          </span>
          <div style={{ fontFamily: "Inter, sans-serif", flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: "0.1em", color: "#FFFFFF", lineHeight: 1 }}>
              VAULT
            </div>
            <div style={{ fontSize: 10, fontWeight: 500, letterSpacing: "0.08em", color: "rgba(255,255,255,0.5)", marginTop: 3, textTransform: "uppercase" as const }}>
              Jewellery Management
            </div>
          </div>
          {/* Close button — only shown on mobile */}
          <button
            onClick={onClose}
            className="md:hidden flex items-center justify-center rounded-lg"
            style={{ background: "rgba(255,255,255,0.08)", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.6)", width: 32, height: 32, flexShrink: 0 }}
            aria-label="Close menu"
          >
            <X size={16} strokeWidth={2} />
          </button>
        </div>

        {/* Nav */}
        <nav style={{ display: "flex", flexDirection: "column", gap: 2, padding: "4px 10px", flex: 1, overflowY: "auto" }}>

          <NavLink href="/"          icon={LayoutDashboard} label="Dashboard" />
          <NavLink href="/orders"    icon={ShoppingBag}     label="Orders" />
          <NavLink href="/online"    icon={Globe}           label="Online" />

          <div>
            <ExpandLink
              icon={FileText} label="Quotes" expanded={quotesExpanded}
              onClick={() => { router.push("/quotes"); onClose(); }}
            />
            {quotesExpanded && (
              <div style={{ display: "flex", flexDirection: "column", gap: 1, marginTop: 2 }}>
                <SubLink href="/quotes"         label="Quotes Pipeline" />
                <SubLink href="/quotes/builder" label="Build Quote" />
              </div>
            )}
          </div>

          <NavLink href="/customers" icon={Users} label="Customers" />

          {isManager ? (
            <>
              <NavLink href="/workshop" icon={Wrench} label="Workshop" />
              <NavLink href="/vault/brain" icon={Brain} label="Vault Brain" />
              <NavLink href="/reporting" icon={BarChart2} label="Reporting" />

              <div>
                <ExpandLink
                  icon={Settings} label="Settings" expanded={settingsExpanded}
                  onClick={() => { router.push("/settings"); onClose(); }}
                />
                {settingsExpanded && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 1, marginTop: 2 }}>
                    <SubLink href="/pricing"             label="Pricing" />
                    {isManager && <SubLink href="/settings/users"   label="Users" />}
                    {isManager && <SubLink href="/settings/tenants" label="Stores" />}
                    {isAdmin   && <SubLink href="/admin/users"      label="Admin Users" />}
                  </div>
                )}
              </div>
            </>
          ) : null}

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
                  {user.role ?? "…"}
                </div>
              </div>
              <button
                onClick={logout}
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
            © 2026 Vault
          </div>
        </div>
      </aside>
    </>
  );
}

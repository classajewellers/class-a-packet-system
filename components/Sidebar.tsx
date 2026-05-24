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
  Tag,
  Settings,
  Sparkles,
  ChevronDown,
} from "lucide-react";

interface Props {
  onOpenAI: () => void;
}

const ACTIVE_BG = "rgba(99, 91, 255, 0.15)";
const DEFAULT_COLOR = "#8B8FC8";
const ACTIVE_COLOR = "#FFFFFF";

export default function Sidebar({ onOpenAI }: Props) {
  const pathname = usePathname();
  const { user, logout } = useUser();
  const router = useRouter();

  const isManager = user?.role === "manager";
  const quotesExpanded = pathname.startsWith("/quotes");

  const initials = (name: string) =>
    name
      .split(" ")
      .map((w) => w[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    if (href === "/quotes") return pathname === "/quotes";
    return pathname === href || pathname.startsWith(href + "/");
  };

  function NavLink({
    href,
    icon: Icon,
    label,
  }: {
    href: string;
    icon: React.ElementType;
    label: string;
  }) {
    const active = isActive(href);
    return (
      <Link
        href={href}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 16px",
          borderRadius: 8,
          textDecoration: "none",
          background: active ? ACTIVE_BG : "transparent",
          color: active ? ACTIVE_COLOR : DEFAULT_COLOR,
          fontWeight: active ? 500 : 400,
          fontSize: 14,
          transition: "background .15s, color .15s",
        }}
        onMouseEnter={(e) => {
          if (!active) {
            (e.currentTarget as HTMLAnchorElement).style.background = ACTIVE_BG;
            (e.currentTarget as HTMLAnchorElement).style.color = ACTIVE_COLOR;
          }
        }}
        onMouseLeave={(e) => {
          if (!active) {
            (e.currentTarget as HTMLAnchorElement).style.background =
              "transparent";
            (e.currentTarget as HTMLAnchorElement).style.color = DEFAULT_COLOR;
          }
        }}
      >
        <Icon size={20} strokeWidth={1.75} />
        <span>{label}</span>
      </Link>
    );
  }

  function SubLink({ href, label }: { href: string; label: string }) {
    const active = pathname === href;
    return (
      <Link
        href={href}
        style={{
          display: "flex",
          alignItems: "center",
          padding: "8px 16px 8px 46px",
          borderRadius: 8,
          textDecoration: "none",
          background: active ? ACTIVE_BG : "transparent",
          color: active ? ACTIVE_COLOR : DEFAULT_COLOR,
          fontWeight: active ? 500 : 400,
          fontSize: 13,
          transition: "background .15s, color .15s",
        }}
        onMouseEnter={(e) => {
          if (!active) {
            (e.currentTarget as HTMLAnchorElement).style.background = ACTIVE_BG;
            (e.currentTarget as HTMLAnchorElement).style.color = ACTIVE_COLOR;
          }
        }}
        onMouseLeave={(e) => {
          if (!active) {
            (e.currentTarget as HTMLAnchorElement).style.background =
              "transparent";
            (e.currentTarget as HTMLAnchorElement).style.color = DEFAULT_COLOR;
          }
        }}
      >
        {label}
      </Link>
    );
  }

  return (
    <aside
      style={{
        background: "#1A1760",
        width: 220,
        minWidth: 220,
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Brand */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "24px 20px 20px",
        }}
      >
        <span
          style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            background: "#635BFF",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          {/* Shield icon */}
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#FFFFFF"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
        </span>
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.12em",
            color: "#FFFFFF",
            lineHeight: 1.3,
          }}
        >
          CLASS A<br />JEWELLERS
        </div>
      </div>

      {/* Nav */}
      <nav
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 2,
          padding: "4px 10px",
          flex: 1,
          overflowY: "auto",
        }}
      >
        <NavLink href="/" icon={LayoutDashboard} label="Dashboard" />
        <NavLink href="/orders" icon={ShoppingBag} label="Orders" />
        <NavLink href="/online" icon={Globe} label="Online" />

        {/* Quotes — expandable */}
        <div>
          <div
            role="button"
            tabIndex={0}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "10px 16px",
              borderRadius: 8,
              cursor: "pointer",
              background: quotesExpanded ? ACTIVE_BG : "transparent",
              color: quotesExpanded ? ACTIVE_COLOR : DEFAULT_COLOR,
              fontWeight: quotesExpanded ? 500 : 400,
              fontSize: 14,
              transition: "background .15s, color .15s",
            }}
            onClick={() => router.push("/quotes")}
            onMouseEnter={(e) => {
              if (!quotesExpanded) {
                (e.currentTarget as HTMLDivElement).style.background = ACTIVE_BG;
                (e.currentTarget as HTMLDivElement).style.color = ACTIVE_COLOR;
              }
            }}
            onMouseLeave={(e) => {
              if (!quotesExpanded) {
                (e.currentTarget as HTMLDivElement).style.background =
                  "transparent";
                (e.currentTarget as HTMLDivElement).style.color = DEFAULT_COLOR;
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") router.push("/quotes");
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <FileText size={20} strokeWidth={1.75} />
              <span>Quotes</span>
            </div>
            <ChevronDown
              size={14}
              strokeWidth={2}
              style={{
                transform: quotesExpanded ? "rotate(180deg)" : "rotate(0deg)",
                transition: "transform .2s",
                opacity: 0.6,
              }}
            />
          </div>
          {quotesExpanded && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 1,
                marginTop: 2,
              }}
            >
              <SubLink href="/quotes" label="Quotes Pipeline" />
              <SubLink href="/quotes/builder" label="Build Quote" />
            </div>
          )}
        </div>

        <NavLink href="/customers" icon={Users} label="Customers" />
        {isManager && (
          <NavLink href="/workshop" icon={Wrench} label="Workshop" />
        )}
        {isManager && (
          <NavLink href="/revenue" icon={BarChart2} label="Revenue" />
        )}
        {isManager && <NavLink href="/pricing" icon={Tag} label="Pricing" />}
        {isManager && (
          <NavLink href="/settings" icon={Settings} label="Settings" />
        )}

        {/* AI Assistant */}
        <button
          onClick={onOpenAI}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 16px",
            borderRadius: 8,
            background: "transparent",
            border: "none",
            cursor: "pointer",
            color: DEFAULT_COLOR,
            fontWeight: 400,
            fontSize: 14,
            textAlign: "left",
            width: "100%",
            transition: "background .15s, color .15s",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = ACTIVE_BG;
            (e.currentTarget as HTMLButtonElement).style.color = ACTIVE_COLOR;
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background =
              "transparent";
            (e.currentTarget as HTMLButtonElement).style.color = DEFAULT_COLOR;
          }}
        >
          <Sparkles size={20} strokeWidth={1.75} />
          <span>AI Assistant</span>
        </button>
      </nav>

      {/* Footer */}
      <div
        style={{
          borderTop: "1px solid rgba(255,255,255,0.08)",
          padding: "12px 16px 16px",
        }}
      >
        {user && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              marginBottom: 10,
            }}
          >
            <span
              style={{
                width: 34,
                height: 34,
                borderRadius: "50%",
                background: "#635BFF",
                color: "#fff",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 12,
                fontWeight: 600,
                flexShrink: 0,
              }}
            >
              {initials(user.name)}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: "#FFFFFF",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {user.name}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: DEFAULT_COLOR,
                  textTransform: "capitalize",
                }}
              >
                {user.role}
              </div>
            </div>
            <button
              onClick={() => {
                logout();
                router.push("/login");
              }}
              title="Switch user"
              style={{
                background: "rgba(99,91,255,0.2)",
                border: "none",
                color: "#A5B4FC",
                cursor: "pointer",
                padding: "4px 10px",
                borderRadius: 6,
                fontSize: 11,
                fontWeight: 500,
                flexShrink: 0,
                transition: "background .15s",
              }}
              onMouseEnter={(e) =>
                ((e.currentTarget as HTMLButtonElement).style.background =
                  "rgba(99,91,255,0.35)")
              }
              onMouseLeave={(e) =>
                ((e.currentTarget as HTMLButtonElement).style.background =
                  "rgba(99,91,255,0.2)")
              }
            >
              Switch
            </button>
          </div>
        )}
        <div
          style={{
            fontSize: 11,
            color: "#4A4A8A",
            textAlign: "center",
            paddingTop: 4,
          }}
        >
          © 2026 Class A Jewellers
        </div>
      </div>
    </aside>
  );
}

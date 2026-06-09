"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRouter } from "next/navigation";

const NAV = [
  { label: "Dashboard", href: "/vault-admin" },
  { label: "Stores",    href: "/vault-admin/stores" },
];

export default function VaultAdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = () => {
    document.cookie = "vault_operator_auth=; max-age=0; path=/vault-admin";
    router.push("/vault-admin/login");
  };

  // Login page renders without sidebar
  if (pathname === "/vault-admin/login") {
    return <>{children}</>;
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh", fontFamily: "Inter, sans-serif" }}>
      {/* Sidebar */}
      <aside style={{
        width: 220,
        background: "#1A1760",
        display: "flex",
        flexDirection: "column",
        flexShrink: 0,
        position: "fixed",
        top: 0,
        left: 0,
        bottom: 0,
        zIndex: 10,
      }}>
        {/* Logo */}
        <div style={{ padding: "28px 20px 20px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 22, fontWeight: 800, color: "#fff", letterSpacing: "-0.5px" }}>
              vault
            </span>
            <span style={{
              fontSize: 9,
              fontWeight: 700,
              color: "#635BFF",
              background: "rgba(99,91,255,0.2)",
              borderRadius: 4,
              padding: "2px 5px",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}>
              operator
            </span>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: "8px 12px", display: "flex", flexDirection: "column", gap: 2 }}>
          {NAV.map(({ label, href }) => {
            const active = href === "/vault-admin"
              ? pathname === "/vault-admin"
              : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                style={{
                  display: "block",
                  padding: "9px 12px",
                  borderRadius: 8,
                  color: active ? "#fff" : "rgba(255,255,255,0.55)",
                  background: active ? "rgba(99,91,255,0.25)" : "transparent",
                  fontWeight: active ? 600 : 400,
                  fontSize: 14,
                  textDecoration: "none",
                  transition: "all 0.15s",
                }}
              >
                {label}
              </Link>
            );
          })}
        </nav>

        {/* Logout */}
        <div style={{ padding: "16px 12px" }}>
          <button
            onClick={handleLogout}
            style={{
              width: "100%",
              padding: "8px 12px",
              borderRadius: 8,
              background: "transparent",
              border: "1px solid rgba(255,255,255,0.15)",
              color: "rgba(255,255,255,0.45)",
              fontSize: 13,
              cursor: "pointer",
              textAlign: "left",
            }}
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main style={{ marginLeft: 220, flex: 1, background: "#F9FAFB", minHeight: "100vh" }}>
        {children}
      </main>
    </div>
  );
}

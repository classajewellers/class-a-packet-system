"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useUser } from "@/context/UserContext";

const NAV_ITEMS = [
  { href: "/",          label: "Dashboard",  icon: "🏠", minRole: null },
  { href: "/orders",    label: "Orders",     icon: "📦", minRole: null },
  { href: "/online",    label: "Online",     icon: "🌐", minRole: null },
  { href: "/quotes",    label: "Quotes",     icon: "💬", minRole: null },
  { href: "/customers", label: "Customers",  icon: "👥", minRole: null },
  { href: "/workshop",  label: "Workshop",   icon: "🔨", minRole: "manager" },
  { href: "/revenue",   label: "Revenue",    icon: "📈", minRole: "manager" },
  { href: "/settings",  label: "Settings",   icon: "⚙️", minRole: "manager" },
] as const;

export default function Sidebar() {
  const pathname = usePathname();
  const { user } = useUser();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [newDropdownOpen, setNewDropdownOpen] = useState(false);

  // Persist collapse state to localStorage
  useEffect(() => {
    const stored = localStorage.getItem("sidebar_collapsed");
    if (stored !== null) {
      setCollapsed(stored === "true");
    } else {
      // Collapse by default on small screens
      if (window.innerWidth < 768) setCollapsed(true);
    }
  }, []);

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem("sidebar_collapsed", String(next));
  }

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

  return (
    <aside
      className="flex-shrink-0 h-screen flex flex-col bg-[#1B1F2E] text-white transition-all duration-200 relative"
      style={{ width: collapsed ? 64 : 220 }}
    >
      {/* Logo */}
      <div className="flex items-center justify-between px-3 py-4 border-b border-white/10">
        {!collapsed && (
          <Link href="/" className="flex items-center">
            <Image
              src="/class-a-logo.png"
              alt="Class A Jewellers"
              width={120}
              height={30}
              className="h-8 w-auto object-contain brightness-0 invert"
            />
          </Link>
        )}
        <button
          onClick={toggleCollapsed}
          className="p-1.5 rounded-lg hover:bg-white/10 transition-colors flex-shrink-0"
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <svg className="w-4 h-4 text-white/70" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            {collapsed ? (
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
            )}
          </svg>
        </button>
      </div>

      {/* Nav items */}
      <nav className="flex-1 py-4 overflow-y-auto">
        <ul className="space-y-0.5 px-2">
          {visibleItems.map((item) => {
            const active = isActive(item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`flex items-center gap-3 px-2 py-2.5 rounded-lg text-sm font-medium transition-colors group ${
                    active
                      ? "border-l-4 border-[#A3B2A4] bg-white/10 text-white pl-1.5"
                      : "text-white/70 hover:bg-white/5 hover:text-white"
                  }`}
                  title={collapsed ? item.label : undefined}
                >
                  <span className="text-base flex-shrink-0">{item.icon}</span>
                  {!collapsed && <span>{item.label}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* + New button */}
      <div className="p-3 border-t border-white/10 relative">
        <button
          onClick={() => setNewDropdownOpen((v) => !v)}
          className={`flex items-center gap-2 bg-[#A3B2A4] hover:bg-[#8fa090] text-white font-semibold rounded-lg transition-colors py-2 ${
            collapsed ? "w-full justify-center px-2" : "w-full px-3"
          }`}
          title={collapsed ? "New" : undefined}
        >
          <span className="text-lg leading-none">+</span>
          {!collapsed && <span className="text-sm">New</span>}
        </button>

        {newDropdownOpen && (
          <>
            <div
              className="fixed inset-0 z-10"
              onClick={() => setNewDropdownOpen(false)}
            />
            <div
              className="absolute z-20 bg-white rounded-xl shadow-xl border border-gray-200 overflow-hidden"
              style={{
                bottom: "calc(100% + 8px)",
                left: collapsed ? "72px" : "12px",
                width: 180,
              }}
            >
              <button
                onClick={() => { router.push("/orders/new"); setNewDropdownOpen(false); }}
                className="flex items-center gap-2 w-full px-4 py-3 text-sm font-medium text-gray-800 hover:bg-gray-50 transition-colors"
              >
                <span>📦</span>
                <span>New Order</span>
              </button>
              <div className="border-t border-gray-100" />
              <button
                onClick={() => { router.push("/quote"); setNewDropdownOpen(false); }}
                className="flex items-center gap-2 w-full px-4 py-3 text-sm font-medium text-gray-800 hover:bg-gray-50 transition-colors"
              >
                <span>💬</span>
                <span>New Quote</span>
              </button>
            </div>
          </>
        )}
      </div>
    </aside>
  );
}

"use client";

import { usePathname } from "next/navigation";
import { useUser } from "@/context/UserContext";

interface Props {
  onOpenSidebar: () => void;
}

const PAGE_TITLES: Record<string, string> = {
  "/":          "Dashboard",
  "/orders":    "Orders",
  "/online":    "Online Orders",
  "/quotes":    "Quotes",
  "/customers": "Customers",
  "/workshop":  "Workshop",
  "/revenue":   "Revenue",
  "/settings":  "Settings",
  "/quote":     "New Quote",
};

function getPageTitle(pathname: string): string {
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname];
  for (const [prefix, title] of Object.entries(PAGE_TITLES)) {
    if (prefix !== "/" && pathname.startsWith(prefix)) return title;
  }
  return "Vault";
}

export default function TopBar({ onOpenSidebar }: Props) {
  const pathname = usePathname();
  const { user } = useUser();
  const title = getPageTitle(pathname);

  return (
    <header style={{ height: 64, borderBottom: '1px solid #E8E8F0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', background: '#FFFFFF', flexShrink: 0 }}>
      <div className="flex items-center gap-3">
        {/* Hamburger — mobile only */}
        <button
          onClick={onOpenSidebar}
          className="md:hidden flex items-center justify-center w-9 h-9 rounded-lg hover:bg-gray-100 transition-colors text-gray-600"
          aria-label="Open menu"
          style={{ border: "none", background: "transparent", cursor: "pointer", flexShrink: 0 }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>

        <div style={{ fontSize: 18, fontWeight: 600, color: '#1A1A2E' }}>
          {title}
        </div>
      </div>

      <div className="flex items-center gap-3">
        {user && (
          <div className="flex items-center gap-2">
            <span style={{ width: 32, height: 32, borderRadius: '50%', background: '#635BFF', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600 }} title={user.name}>{user.initials}</span>
            <span style={{ fontSize: 13, color: '#1A1A2E', fontWeight: 500 }} className="hidden sm:block">
              {user.name}
            </span>
          </div>
        )}
      </div>
    </header>
  );
}

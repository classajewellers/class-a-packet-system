"use client";

import { usePathname } from "next/navigation";
import { useUser } from "@/context/UserContext";

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
  return "Class A Order System";
}

export default function TopBar() {
  const pathname = usePathname();
  const { user } = useUser();
  const title = getPageTitle(pathname);

  return (
    <header className="ds-topbar">
      <div className="ds-topbar-crumb">
        <span>Workspace</span>
        <span className="sep">/</span>
        <b>{title}</b>
      </div>
      <div className="flex items-center gap-3">
        {user && (
          <div className="flex items-center gap-2">
            <span className="ds-avatar" title={user.name}>{user.initials}</span>
            <span style={{ fontSize: 13, color: "var(--text-2)", fontWeight: 500 }} className="hidden sm:block">
              {user.name}
            </span>
          </div>
        )}
      </div>
    </header>
  );
}

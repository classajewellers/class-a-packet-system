"use client";

import { usePathname, useRouter } from "next/navigation";
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
  // Exact match first
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname];
  // Prefix match for nested routes
  for (const [prefix, title] of Object.entries(PAGE_TITLES)) {
    if (prefix !== "/" && pathname.startsWith(prefix)) return title;
  }
  return "Class A Order System";
}

export default function TopBar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useUser();

  const title = getPageTitle(pathname);

  function handleSwitchUser() {
    logout();
    router.push("/login");
  }

  return (
    <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-6 flex-shrink-0">
      <h1 className="text-base font-semibold text-gray-900">{title}</h1>
      <div className="flex items-center gap-3">
        {user && (
          <>
            <div className="flex items-center gap-2">
              <div
                className="w-8 h-8 rounded-full bg-[#A3B2A4] flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                title={user.name}
              >
                {user.initials}
              </div>
              <span className="text-sm text-gray-700 font-medium hidden sm:block">{user.name}</span>
            </div>
            <button
              onClick={handleSwitchUser}
              className="text-xs font-semibold text-gray-500 hover:text-gray-800 border border-gray-300 rounded-lg px-3 py-1.5 transition-colors hover:border-gray-400"
            >
              Switch User
            </button>
          </>
        )}
      </div>
    </header>
  );
}

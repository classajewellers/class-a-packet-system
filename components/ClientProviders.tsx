"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import { UserProvider, useUser } from "@/context/UserContext";
import Sidebar from "@/components/Sidebar";
import TopBar from "@/components/TopBar";
import AIAssistant from "@/components/AIAssistant";
import VaultReportButton from "@/components/VaultReportButton";

// ── Auth guard ────────────────────────────────────────────────────────────────

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, hydrated } = useUser();
  const router = useRouter();
  const pathname = usePathname();
  const isLoginPage = pathname === "/login";
  const isPublicPage = pathname.startsWith("/claim/");
  const [aiOpen, setAiOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Close sidebar whenever the route changes (user tapped a nav link)
  useEffect(() => { setSidebarOpen(false); }, [pathname]);

  const openSidebar  = useCallback(() => setSidebarOpen(true),  []);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  // Safety net: if the Supabase session check hangs for more than 10 s,
  // stop blocking the UI. The middleware will redirect unauthenticated users
  // to /login server-side anyway, so this is just a client-side fallback.
  const [forceShow, setForceShow] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setForceShow(true), 5_000);
    return () => clearTimeout(id);
  }, []);

  useEffect(() => {
    if (!hydrated && !forceShow) return;
    if (isPublicPage) return;
    if (!user && !isLoginPage) {
      router.replace("/login");
    } else if (user && isLoginPage) {
      router.replace("/");
    }
  }, [user, hydrated, forceShow, isLoginPage, isPublicPage, router]);

  // Public pages: render immediately, no auth check, no shell
  if (isPublicPage) return <>{children}</>;

  // Show nothing until session is resolved (or safety timeout fires)
  if (!hydrated && !forceShow) return null;

  // Suppress content while redirect is in flight
  if (!user && !isLoginPage) return null;
  if (user && isLoginPage) return null;

  // Login page: no sidebar/topbar
  if (isLoginPage) return <>{children}</>;

  // Authenticated pages: full app shell
  return (
    <div className="app-shell">
      <Sidebar onOpenAI={() => setAiOpen(true)} mobileOpen={sidebarOpen} onClose={closeSidebar} />
      <div className="app-main">
        <TopBar onOpenSidebar={openSidebar} />
        <main className="app-content">
          {children}
        </main>
      </div>
      <AIAssistant open={aiOpen} onClose={() => setAiOpen(false)} />
      <VaultReportButton />
    </div>
  );
}

// ── Public export ─────────────────────────────────────────────────────────────

export function ClientProviders({ children }: { children: React.ReactNode }) {
  return (
    <UserProvider>
      <AuthGuard>{children}</AuthGuard>
    </UserProvider>
  );
}

"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import { UserProvider, useUser } from "@/context/UserContext";
import Sidebar from "@/components/Sidebar";
import TopBar from "@/components/TopBar";
import AIAssistant from "@/components/AIAssistant";
import VaultReportButton from "@/components/VaultReportButton";

const NO_SHELL_PAGES = new Set(["/login", "/onboarding"]);

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, hydrated } = useUser();
  const router = useRouter();
  const pathname = usePathname();
  const isLoginPage   = pathname === "/login";
  const isOnboarding  = pathname === "/onboarding";
  const isPublicPage  = pathname.startsWith("/claim/");
  const isNoShellPage = NO_SHELL_PAGES.has(pathname);
  const [aiOpen, setAiOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => { setSidebarOpen(false); }, [pathname]);

  const openSidebar  = useCallback(() => setSidebarOpen(true),  []);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  const [forceShow, setForceShow] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setForceShow(true), 5_000);
    return () => clearTimeout(id);
  }, []);

  useEffect(() => {
    if (!hydrated && !forceShow) return;
    if (isPublicPage) return;
    if (!user && !isLoginPage && !isOnboarding) {
      router.replace("/login");
    } else if (user && isLoginPage) {
      router.replace("/");
    }
  }, [user, hydrated, forceShow, isLoginPage, isOnboarding, isPublicPage, router]);

  const onboardingCheckedRef = useRef(false);
  useEffect(() => {
    if (!hydrated && !forceShow) return;
    if (!user || isLoginPage || isOnboarding || isPublicPage) return;
    if (onboardingCheckedRef.current) return;
    onboardingCheckedRef.current = true;

    fetch("/api/onboarding/status", { headers: { "x-tenant-id": user.tenantId ?? "" } })
      .then(r => r.json())
      .then(({ onboarding_complete }) => {
        if (!onboarding_complete) router.replace("/onboarding");
      })
      .catch(() => {});
  }, [user, hydrated, forceShow, isLoginPage, isOnboarding, isPublicPage, router]);

  if (isPublicPage) return <>{children}</>;
  if (!hydrated && !forceShow) return null;
  if (!user && !isLoginPage && !isOnboarding) return null;
  if (user && isLoginPage) return null;
  if (isNoShellPage) return <>{children}</>;

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

export function ClientProviders({ children }: { children: React.ReactNode }) {
  return (
    <UserProvider>
      <AuthGuard>{children}</AuthGuard>
    </UserProvider>
  );
}

"use client";

import { createContext, useContext, useRef, useState, useEffect, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import { UserProvider, useUser } from "@/context/UserContext";
import Sidebar from "@/components/Sidebar";
import TopBar from "@/components/TopBar";
import AIAssistant from "@/components/AIAssistant";
import VaultReportButton from "@/components/VaultReportButton";

interface BillingState { subscriptionStatus: string | null }
const BillingContext = createContext<BillingState>({ subscriptionStatus: null });
export function useBillingStatus() { return useContext(BillingContext); }

const NO_SHELL_PAGES = new Set(["/login", "/onboarding", "/billing", "/set-password"]);

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, hydrated } = useUser();
  const router = useRouter();
  const pathname = usePathname();
  const isLoginPage   = pathname === "/login";
  const isOnboarding  = pathname === "/onboarding";
  const isBillingPage = pathname === "/billing";
  const isSetPassword = pathname === "/set-password";
  const isPublicPage  = pathname.startsWith("/claim/");
  const isNoShellPage = NO_SHELL_PAGES.has(pathname);
  const [aiOpen, setAiOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [subscriptionStatus, setSubscriptionStatus] = useState<string | null>(null);

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
    if (!user && !isLoginPage && !isOnboarding && !isBillingPage && !isSetPassword) {
      router.replace("/login");
    } else if (user && isLoginPage) {
      router.replace("/");
    }
  }, [user, hydrated, forceShow, isLoginPage, isOnboarding, isBillingPage, isSetPassword, isPublicPage, router]);

  const checkedRef = useRef(false);
  useEffect(() => {
    if (!hydrated && !forceShow) return;
    if (!user || isLoginPage || isOnboarding || isBillingPage || isSetPassword || isPublicPage) return;
    if (checkedRef.current) return;
    checkedRef.current = true;

    void (async () => {
      try {
        const headers = { "x-tenant-id": user.tenantId ?? "" };
        const ob = await fetch("/api/onboarding/status", { headers }).then(r => r.json()) as { onboarding_complete?: boolean };
        if (!ob.onboarding_complete) { router.replace("/onboarding"); return; }
        const bil = await fetch("/api/billing/status", { headers }).then(r => r.json()) as { subscription_status?: string };
        const status = bil.subscription_status ?? null;
        setSubscriptionStatus(status);
        if (status === "canceled") router.replace("/billing");
      } catch { /* fail open */ }
    })();
  }, [user, hydrated, forceShow, isLoginPage, isOnboarding, isBillingPage, isSetPassword, isPublicPage, router]);

  if (isPublicPage) return <>{children}</>;
  if (!hydrated && !forceShow) return null;
  if (!user && !isLoginPage && !isOnboarding && !isBillingPage && !isSetPassword) return null;
  if (user && isLoginPage) return null;

  if (isNoShellPage) {
    return (
      <BillingContext.Provider value={{ subscriptionStatus }}>
        {children}
      </BillingContext.Provider>
    );
  }

  return (
    <BillingContext.Provider value={{ subscriptionStatus }}>
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
    </BillingContext.Provider>
  );
}

export function ClientProviders({ children }: { children: React.ReactNode }) {
  return (
    <UserProvider>
      <AuthGuard>{children}</AuthGuard>
    </UserProvider>
  );
}

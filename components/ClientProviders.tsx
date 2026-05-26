"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { UserProvider, useUser } from "@/context/UserContext";
import Sidebar from "@/components/Sidebar";
import TopBar from "@/components/TopBar";
import AIAssistant from "@/components/AIAssistant";

// ── Auth guard ────────────────────────────────────────────────────────────────
// Redirects unauthenticated users to /login, and logged-in users away from it.

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, hydrated } = useUser();
  const router = useRouter();
  const pathname = usePathname();
  const isLoginPage = pathname === "/login";
  // Public routes — no auth required, no app shell
  const isPublicPage = pathname.startsWith("/claim/");
  const [aiOpen, setAiOpen] = useState(false);

  useEffect(() => {
    if (!hydrated) return;
    if (isPublicPage) return; // never redirect public pages
    if (!user && !isLoginPage) {
      router.replace("/login");
    } else if (user && isLoginPage) {
      router.replace("/");
    }
  }, [user, hydrated, isLoginPage, isPublicPage, router]);

  // Public pages: render immediately, no auth check, no shell
  if (isPublicPage) return <>{children}</>;

  // Show nothing until localStorage is read
  if (!hydrated) return null;
  // Suppress content while redirect is in flight
  if (!user && !isLoginPage) return null;
  if (user && isLoginPage) return null;

  // Login page: no sidebar/topbar
  if (isLoginPage) return <>{children}</>;

  // Authenticated pages: sidebar + topbar layout
  return (
    <div className="app-shell">
      <Sidebar onOpenAI={() => setAiOpen(true)} />
      <div className="app-main">
        <TopBar />
        <main className="app-content">
          {children}
        </main>
      </div>
      <AIAssistant open={aiOpen} onClose={() => setAiOpen(false)} />
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

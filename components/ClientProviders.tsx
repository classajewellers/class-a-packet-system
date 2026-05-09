"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { UserProvider, useUser } from "@/context/UserContext";

// ── Auth guard ────────────────────────────────────────────────────────────────
// Redirects unauthenticated users to /login, and logged-in users away from it.

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, hydrated } = useUser();
  const router = useRouter();
  const pathname = usePathname();
  const isLoginPage = pathname === "/login";

  useEffect(() => {
    if (!hydrated) return;
    if (!user && !isLoginPage) {
      router.replace("/login");
    } else if (user && isLoginPage) {
      router.replace("/");
    }
  }, [user, hydrated, isLoginPage, router]);

  // Show nothing until localStorage is read
  if (!hydrated) return null;
  // Suppress content while redirect is in flight
  if (!user && !isLoginPage) return null;
  if (user && isLoginPage) return null;

  return <>{children}</>;
}

// ── Public export ─────────────────────────────────────────────────────────────

export function ClientProviders({ children }: { children: React.ReactNode }) {
  return (
    <UserProvider>
      <AuthGuard>{children}</AuthGuard>
    </UserProvider>
  );
}

"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { LoggedInUser, UserRole, UserPermissions, DEFAULT_STAFF_PERMISSIONS } from "@/lib/userTypes";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { createBrowserSupabaseClient } from "@/lib/supabase-browser";

interface UserContextType {
  user: LoggedInUser | null;
  hydrated: boolean;
  roleLoading: boolean;
  logout: () => Promise<void>;
}

const UserContext = createContext<UserContextType>({
  user: null,
  hydrated: false,
  roleLoading: true,
  logout: async () => {},
});

function deriveInitials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser]               = useState<LoggedInUser | null>(null);
  const [hydrated, setHydrated]       = useState(false);
  const [roleLoading, setRoleLoading] = useState(true);

  const router       = useRouter();
  const supabaseRef  = useRef(createBrowserSupabaseClient());
  const fetchingRef  = useRef(false);

  const fallbackUser = (userId: string, userEmail: string): LoggedInUser => ({
    id:          userId,
    name:        userEmail.split("@")[0],
    role:        "manager" as UserRole,
    email:       userEmail,
    tenantId:    "00000000-0000-0000-0000-000000000001",
    tenantSlug:  "classa",
    initials:    userEmail.substring(0, 2).toUpperCase(),
    loggedInAt:  new Date().toISOString(),
    permissions: null,
  });

  const loadProfile = async (userId: string, userEmail: string) => {
    // Prevent concurrent fetches — SIGNED_IN can fire twice on login
    if (fetchingRef.current) {
      console.log("[UserContext] fetch already in progress, skipping");
      return;
    }
    fetchingRef.current = true;

    try {
      console.log("[UserContext] fetching profile for:", userId);

      // Raw REST fetch with 5s AbortController timeout —
      // bypasses the Supabase JS client which can hang indefinitely
      const controller = new AbortController();
      const timeoutId  = setTimeout(() => controller.abort(), 5000);

      let data: Record<string, unknown> | null = null;

      try {
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/profiles?auth_user_id=eq.${encodeURIComponent(userId)}&select=*&limit=1`,
          {
            signal: controller.signal,
            headers: {
              "apikey":        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
              "Authorization": `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!}`,
              "Content-Type":  "application/json",
            },
          }
        );
        clearTimeout(timeoutId);
        const rows = await response.json();
        console.log("[UserContext] profile raw fetch result:", rows);
        data = Array.isArray(rows) ? (rows[0] ?? null) : null;
      } catch (fetchErr) {
        clearTimeout(timeoutId);
        console.warn("[UserContext] raw fetch failed (timeout or network):", fetchErr);
        // data stays null → fallback below
      }

      if (!data) {
        console.log("[UserContext] no profile data — using auth fallback");
        setUser(fallbackUser(userId, userEmail));
        setRoleLoading(false);
        return;
      }

      const rawPerms = data.permissions as Record<string, boolean> | null | undefined;
      const permissions: UserPermissions = {
        ...DEFAULT_STAFF_PERMISSIONS,
        ...(rawPerms ?? {}),
      };

      setUser({
        id:          String(data.id ?? userId),
        name:        String(data.full_name ?? userEmail),
        role:        (data.role as UserRole) ?? "manager",
        email:       String(data.email ?? userEmail),
        tenantId:    data.tenant_id ? String(data.tenant_id) : "00000000-0000-0000-0000-000000000001",
        tenantSlug:  "classa",
        initials:    String(data.full_name ?? userEmail).substring(0, 2).toUpperCase(),
        loggedInAt:  new Date().toISOString(),
        permissions,
      });
      setRoleLoading(false);
    } catch (err) {
      console.error("[UserContext] loadProfile unexpected error:", err);
      setUser(fallbackUser(userId, userEmail));
      setRoleLoading(false);
    } finally {
      fetchingRef.current = false;
    }
  };

  useEffect(() => {
    const supabase = supabaseRef.current;
    let cancelled  = false;

    (async () => {
      try {
        console.log("[UserContext] calling getUser()...");
        const { data, error } = await supabase.auth.getUser();

        console.log("[UserContext] getUser result — user:", data?.user?.id, "error:", error?.message);

        if (cancelled) return;

        if (data?.user) {
          await loadProfile(data.user.id, data.user.email ?? "");
        } else {
          console.log("[UserContext] no authenticated user, hydrating as guest");
          setRoleLoading(false);
        }
      } catch (err) {
        console.error("[UserContext] getUser failed:", err);
        if (!cancelled) setRoleLoading(false);
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event: AuthChangeEvent, session: Session | null) => {
        console.log("[UserContext] onAuthStateChange event:", event, "session user:", session?.user?.id);
        if (cancelled) return;
        if (
          event === "SIGNED_IN" ||
          event === "TOKEN_REFRESHED" ||
          event === "USER_UPDATED"
        ) {
          if (session?.user) {
            await loadProfile(session.user.id, session.user.email ?? "");
          }
        } else if (event === "SIGNED_OUT") {
          console.log("[UserContext] SIGNED_OUT event, clearing user");
          setUser(null);
          setRoleLoading(false);
        }
      }
    );

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Explicit logout — only called by user action
  async function logout() {
    console.log("[UserContext] logout called");
    setUser(null);
    setRoleLoading(false);
    await supabaseRef.current.auth.signOut();
    router.push("/login");
  }

  return (
    <UserContext.Provider value={{ user, hydrated, roleLoading, logout }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  return useContext(UserContext);
}

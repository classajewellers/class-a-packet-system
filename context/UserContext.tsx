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
import { LoggedInUser, UserRole } from "@/lib/userTypes";
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

const DEFAULT_TENANT_ID   = "00000000-0000-0000-0000-000000000001";
const DEFAULT_TENANT_SLUG = "classa";

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser]               = useState<LoggedInUser | null>(null);
  const [hydrated, setHydrated]       = useState(false);
  const [roleLoading, setRoleLoading] = useState(true);

  const router      = useRouter();
  const supabaseRef = useRef(createBrowserSupabaseClient());
  const loadGenRef  = useRef(0);

  async function forceSignOut() {
    console.log("[UserContext] forceSignOut called");
    loadGenRef.current++;
    setUser(null);
    setRoleLoading(false);
    setHydrated(true);
    await supabaseRef.current.auth.signOut();
    router.push("/login");
  }

  async function loadProfile(userId: string, email: string) {
    const gen = ++loadGenRef.current;
    setRoleLoading(true);

    console.log("[UserContext] loadProfile start — userId:", userId, "email:", email);

    // 5-second timeout: if profile fetch hangs, sign out
    const timeoutId = setTimeout(async () => {
      if (gen === loadGenRef.current) {
        console.warn("[UserContext] loadProfile timed out after 5s, signing out");
        await forceSignOut();
      }
    }, 5000);

    try {
      // Query profiles WHERE auth_user_id = userId (invite flow)
      const { data, error } = await supabaseRef.current
        .from("profiles")
        .select("id, full_name, role, email, tenant_id")
        .eq("auth_user_id", userId)
        .maybeSingle();

      console.log("[UserContext] profile query result — data:", data, "error:", error);

      if (gen !== loadGenRef.current) {
        console.log("[UserContext] stale generation, ignoring result");
        clearTimeout(timeoutId);
        return;
      }

      if (error) {
        console.error("[UserContext] profile fetch error:", error.message);
        clearTimeout(timeoutId);
        await forceSignOut();
        return;
      }

      if (!data) {
        console.warn("[UserContext] no profile found for auth_user_id:", userId, "— signing out");
        clearTimeout(timeoutId);
        await forceSignOut();
        return;
      }

      console.log("[UserContext] profile loaded — role:", data.role, "tenant_id:", data.tenant_id);

      setUser({
        id:         userId,
        name:       data.full_name || email,
        role:       (data.role ?? "staff") as UserRole,
        email:      data.email || email,
        initials:   deriveInitials(data.full_name || email),
        loggedInAt: new Date().toISOString(),
        tenantId:   data.tenant_id ?? DEFAULT_TENANT_ID,
        tenantSlug: DEFAULT_TENANT_SLUG,
      });
    } catch (err) {
      console.error("[UserContext] loadProfile threw:", err);
      if (gen !== loadGenRef.current) return;
      clearTimeout(timeoutId);
      await forceSignOut();
      return;
    } finally {
      clearTimeout(timeoutId);
      if (gen === loadGenRef.current) setRoleLoading(false);
    }
  }

  useEffect(() => {
    const supabase = supabaseRef.current;
    let cancelled  = false;

    (async () => {
      try {
        // Use getUser() — validates against the server, not stale local storage
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
          loadGenRef.current++;
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

  async function logout() {
    console.log("[UserContext] logout called");
    loadGenRef.current++;
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

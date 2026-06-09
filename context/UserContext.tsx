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

  const router       = useRouter();
  const supabaseRef  = useRef(createBrowserSupabaseClient());
  const loadGenRef   = useRef(0);

  // Bug 2 fix: sign out and redirect to /login cleanly
  async function forceSignOut() {
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

    // Bug 2 fix: 5-second timeout — if profile fetch hangs, sign out
    const timeoutId = setTimeout(async () => {
      if (gen === loadGenRef.current) {
        console.warn("[UserContext] loadProfile timed out, signing out");
        await forceSignOut();
      }
    }, 5000);

    try {
      // Query by auth_user_id first (invite flow); fall back to id (legacy direct-auth)
      let { data, error: err1 } = await supabaseRef.current
        .from("profiles")
        .select("full_name, role, tenant_id, tenant:tenants(slug)")
        .eq("auth_user_id", userId)
        .maybeSingle();

      if (!data) {
        const fallback = await supabaseRef.current
          .from("profiles")
          .select("full_name, role, tenant_id, tenant:tenants(slug)")
          .eq("id", userId)
          .maybeSingle();
        data = fallback.data;
      }

      if (gen !== loadGenRef.current) return;

      // Bug 2 fix: if profile not found at all, sign out rather than leaving app broken
      if (!data) {
        console.warn("[UserContext] no profile found for user, signing out");
        clearTimeout(timeoutId);
        await forceSignOut();
        return;
      }

      const tenantRow  = data.tenant;
      const tenantSlug =
        tenantRow && !Array.isArray(tenantRow)
          ? (tenantRow as { slug?: string }).slug ?? DEFAULT_TENANT_SLUG
          : DEFAULT_TENANT_SLUG;

      setUser({
        id:         userId,
        name:       data.full_name || email,
        role:       ((data.role) ?? "staff") as UserRole,
        email,
        initials:   deriveInitials(data.full_name || email),
        loggedInAt: new Date().toISOString(),
        tenantId:   data.tenant_id ?? DEFAULT_TENANT_ID,
        tenantSlug,
      });
    } catch (err) {
      console.error("[UserContext] loadProfile failed:", err);
      if (gen !== loadGenRef.current) return;
      // Bug 2 fix: on fetch error, sign out rather than falling back to broken defaults
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
        const { data } = await supabase.auth.getSession();
        if (cancelled) return;
        if (data.session?.user) {
          await loadProfile(data.session.user.id, data.session.user.email ?? "");
        } else {
          setRoleLoading(false);
        }
      } catch (err) {
        console.error("[UserContext] getSession failed:", err);
        if (!cancelled) setRoleLoading(false);
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event: AuthChangeEvent, session: Session | null) => {
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

  // Bug 2 fix: logout clears all state and redirects immediately
  async function logout() {
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

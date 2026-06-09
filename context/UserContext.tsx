"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  ReactNode,
} from "react";
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

  const supabaseRef = useRef(createBrowserSupabaseClient());
  const loadGenRef  = useRef(0);

  async function loadProfile(userId: string, email: string) {
    const gen = ++loadGenRef.current;
    setRoleLoading(true);

    try {
      // Query by auth_user_id first (invite flow); fall back to id (legacy direct-auth)
      let { data } = await supabaseRef.current
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

      const tenantRow  = data?.tenant;
      const tenantSlug =
        tenantRow && !Array.isArray(tenantRow)
          ? (tenantRow as { slug?: string }).slug ?? DEFAULT_TENANT_SLUG
          : DEFAULT_TENANT_SLUG;

      setUser({
        id:         userId,
        name:       data?.full_name || email,
        role:       ((data?.role) ?? "staff") as UserRole,
        email,
        initials:   deriveInitials(data?.full_name || email),
        loggedInAt: new Date().toISOString(),
        tenantId:   data?.tenant_id ?? DEFAULT_TENANT_ID,
        tenantSlug,
      });
    } catch (err) {
      console.error("[UserContext] loadProfile failed:", err);
      if (gen !== loadGenRef.current) return;
      setUser({
        id:         userId,
        name:       email,
        role:       "staff" as UserRole,
        email,
        initials:   deriveInitials(email),
        loggedInAt: new Date().toISOString(),
        tenantId:   DEFAULT_TENANT_ID,
        tenantSlug: DEFAULT_TENANT_SLUG,
      });
    } finally {
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

  async function logout() {
    loadGenRef.current++;
    await supabaseRef.current.auth.signOut();
    setUser(null);
    setRoleLoading(false);
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

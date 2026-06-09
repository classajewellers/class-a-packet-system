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

// ── PIN session storage key ───────────────────────────────────────────────────
const PIN_SESSION_KEY = "vault_pin_session";

export interface PinSessionData {
  name: string;
  role: UserRole;
  email: string;
  initials: string;
  tenantId: string;
  tenantSlug: string;
}

interface UserContextType {
  user: LoggedInUser | null;
  hydrated: boolean;
  /** True while the role is being fetched from the profiles table. */
  roleLoading: boolean;
  logout: () => Promise<void>;
  /** Called by the PIN login page after successful verification. */
  loginWithPin: (data: PinSessionData) => void;
}

const UserContext = createContext<UserContextType>({
  user: null,
  hydrated: false,
  roleLoading: true,
  logout: async () => {},
  loginWithPin: () => {},
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

// ── Class A default tenant ID ────────────────────────────────────────────────
const DEFAULT_TENANT_ID = "00000000-0000-0000-0000-000000000001";
const DEFAULT_TENANT_SLUG = "classa";

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<LoggedInUser | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [roleLoading, setRoleLoading] = useState(true);

  const supabaseRef = useRef(createBrowserSupabaseClient());
  const loadGenRef = useRef(0);
  const hasLoadedOnce = useRef(false);

  // ── PIN session helper ────────────────────────────────────────────────────

  function loginWithPin(data: PinSessionData) {
    const session: LoggedInUser = {
      id: `pin-${data.email}`,
      name: data.name,
      role: data.role,
      email: data.email,
      initials: data.initials,
      loggedInAt: new Date().toISOString(),
      tenantId: data.tenantId,
      tenantSlug: data.tenantSlug,
    };
    try {
      localStorage.setItem(PIN_SESSION_KEY, JSON.stringify(session));
      // Set a simple cookie the middleware can read
      document.cookie = "vault_auth=1; path=/; max-age=86400; SameSite=Lax";
    } catch { /* localStorage may be unavailable in some envs */ }
    setUser(session);
    hasLoadedOnce.current = true;
    setRoleLoading(false);
    setHydrated(true);
  }

  // ── Main effect ───────────────────────────────────────────────────────────

  useEffect(() => {
    const supabase = supabaseRef.current;
    let cancelled = false;

    // 1. Check localStorage for a PIN session first
    try {
      const stored = localStorage.getItem(PIN_SESSION_KEY);
      if (stored) {
        const parsed: LoggedInUser = JSON.parse(stored);
        if (parsed?.id && parsed?.name) {
          setUser(parsed);
          hasLoadedOnce.current = true;
          setRoleLoading(false);
          setHydrated(true);
          return; // PIN session found — skip Supabase auth check
        }
      }
    } catch { /* ignore */ }

    // 2. Fall back to Supabase session
    async function loadProfile(userId: string, email: string) {
      const gen = ++loadGenRef.current;
      if (!hasLoadedOnce.current) {
        setRoleLoading(true);
      }

      let profileData: { full_name?: string | null; role?: string | null; tenant_id?: string | null } | null = null;

      try {
        const queryPromise = supabase
          .from("profiles")
          .select("full_name, role, tenant_id")
          .eq("id", userId)
          .single();

        const timeoutPromise = new Promise<{ data: null }>((resolve) =>
          setTimeout(() => resolve({ data: null }), 8000)
        );

        const result = await Promise.race([queryPromise, timeoutPromise]);
        profileData = result.data;
      } catch {
        // Network-level exception — profileData stays null
      }

      if (cancelled || gen !== loadGenRef.current) return;

      if (profileData) {
        setUser({
          id: userId,
          name: profileData.full_name || email,
          role: ((profileData.role) ?? "staff") as UserRole,
          email,
          initials: deriveInitials(profileData.full_name || email),
          loggedInAt: new Date().toISOString(),
          tenantId: profileData.tenant_id ?? DEFAULT_TENANT_ID,
          tenantSlug: DEFAULT_TENANT_SLUG,
        });
      } else {
        setUser((prev) =>
          prev
            ? { ...prev }
            : {
                id: userId,
                name: email,
                role: null,
                email,
                initials: deriveInitials(email),
                loggedInAt: new Date().toISOString(),
                tenantId: DEFAULT_TENANT_ID,
                tenantSlug: DEFAULT_TENANT_SLUG,
              }
        );
      }

      hasLoadedOnce.current = true;
      setRoleLoading(false);
    }

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

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event: AuthChangeEvent, session: Session | null) => {
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
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  async function logout() {
    loadGenRef.current++;
    // Clear PIN session
    try {
      localStorage.removeItem(PIN_SESSION_KEY);
      document.cookie = "vault_auth=; path=/; max-age=0; SameSite=Lax";
    } catch { /* ignore */ }
    // Clear Supabase session
    await supabaseRef.current.auth.signOut();
    setUser(null);
    setRoleLoading(false);
  }

  return (
    <UserContext.Provider value={{ user, hydrated, roleLoading, logout, loginWithPin }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  return useContext(UserContext);
}

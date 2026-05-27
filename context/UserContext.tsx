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
  /** True while the role is being fetched from the profiles table.
   *  Role-gated UI should render a skeleton instead of role-dependent content. */
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
  const [user, setUser] = useState<LoggedInUser | null>(null);
  const [hydrated, setHydrated] = useState(false);
  // True until the profile row has been read at least once.
  const [roleLoading, setRoleLoading] = useState(true);

  const supabaseRef = useRef(createBrowserSupabaseClient());

  // Generation counter — incremented on every loadProfile call.
  // Any completion whose gen doesn't match the latest is discarded,
  // which prevents a slow/timed-out first call from overwriting a faster second call.
  const loadGenRef = useRef(0);

  // Once the profile has been fetched successfully at least once, we never
  // re-show skeleton bars — subsequent refreshes (TOKEN_REFRESHED etc.) happen
  // silently in the background while keeping the existing nav visible.
  const hasLoadedOnce = useRef(false);

  useEffect(() => {
    const supabase = supabaseRef.current;
    let cancelled = false;

    async function loadProfile(userId: string, email: string) {
      // Claim a generation slot. If another call starts before this one
      // finishes, our gen will be stale and we'll discard the result.
      const gen = ++loadGenRef.current;
      // Only show skeleton bars on the very first load. After that, re-fetches
      // (token refresh, window focus, etc.) update the role silently so the
      // sidebar never flashes back to skeleton bars mid-session.
      if (!hasLoadedOnce.current) {
        setRoleLoading(true);
      }

      let profileData: { full_name?: string | null; role?: string | null } | null = null;

      try {
        const queryPromise = supabase
          .from("profiles")
          .select("full_name, role")
          .eq("id", userId)
          .single();

        // 8 s timeout — generous but bounded
        const timeoutPromise = new Promise<{ data: null }>((resolve) =>
          setTimeout(() => resolve({ data: null }), 8000)
        );

        const result = await Promise.race([queryPromise, timeoutPromise]);
        profileData = result.data;
      } catch {
        // Network-level exception — profileData stays null
      }

      // Discard stale results (another loadProfile call won the race).
      if (cancelled || gen !== loadGenRef.current) return;

      if (profileData) {
        // Profile row found — use confirmed role (or "staff" if role column is empty)
        setUser({
          id: userId,
          name: profileData.full_name || email,
          role: ((profileData.role) ?? "staff") as UserRole,
          email,
          initials: deriveInitials(profileData.full_name || email),
          loggedInAt: new Date().toISOString(),
        });
      } else {
        // Profile not found or timed out.
        // Set user with null role so the sidebar knows we're still uncertain —
        // never guess "staff" when we haven't confirmed from the DB.
        setUser((prev) =>
          prev
            ? { ...prev } // keep existing user/role if we already had one
            : {
                id: userId,
                name: email,
                role: null,
                email,
                initials: deriveInitials(email),
                loggedInAt: new Date().toISOString(),
              }
        );
      }

      hasLoadedOnce.current = true;
      setRoleLoading(false);
    }

    // ── Initial session check ──────────────────────────────────────────────────
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (cancelled) return;
        if (data.session?.user) {
          await loadProfile(data.session.user.id, data.session.user.email ?? "");
        } else {
          // No session — nothing to load
          setRoleLoading(false);
        }
      } catch (err) {
        console.error("[UserContext] getSession failed:", err);
        if (!cancelled) setRoleLoading(false);
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();

    // ── Auth state listener ────────────────────────────────────────────────────
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
        loadGenRef.current++; // invalidate any in-flight loadProfile
        setUser(null);
        setRoleLoading(false);
      }
      // INITIAL_SESSION is ignored — getSession() handles the initial state.
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  async function logout() {
    loadGenRef.current++; // invalidate in-flight loads
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

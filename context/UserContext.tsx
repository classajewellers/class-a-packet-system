"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  ReactNode,
} from "react";
import { LoggedInUser, UserRole } from "@/lib/userTypes";

interface UserContextType {
  user: LoggedInUser | null;
  hydrated: boolean;
  logout: () => Promise<void>;
}

const UserContext = createContext<UserContextType>({
  user: null,
  hydrated: false,
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

  // Initialised lazily inside useEffect so it never runs during SSR.
  // Stored in a ref so logout() can access the same instance.
  const supabaseRef = useRef<ReturnType<
    typeof import("@/lib/supabase-browser").createBrowserSupabaseClient
  > | null>(null);

  const loadProfile = useCallback(
    async (
      supabase: NonNullable<typeof supabaseRef.current>,
      userId: string,
      email: string
    ) => {
      try {
        const { data } = await supabase
          .from("profiles")
          .select("full_name, role")
          .eq("id", userId)
          .single();

        setUser({
          id: userId,
          name: data?.full_name || email,
          role: ((data?.role) ?? "staff") as UserRole,
          email,
          initials: deriveInitials(data?.full_name || email),
          loggedInAt: new Date().toISOString(),
        });
      } catch (err) {
        // Profile fetch failed — still show a minimal user so the app loads.
        console.error("[UserContext] loadProfile error:", err);
        setUser({
          id: userId,
          name: email,
          role: "staff",
          email,
          initials: deriveInitials(email),
          loggedInAt: new Date().toISOString(),
        });
      }
    },
    []
  );

  useEffect(() => {
    let cancelled = false;

    // Import and create the Supabase client here (client-side only).
    // Using a dynamic require so the module is never evaluated during SSR.
    const { createBrowserSupabaseClient } =
      require("@/lib/supabase-browser") as typeof import("@/lib/supabase-browser");

    const supabase = createBrowserSupabaseClient();
    supabaseRef.current = supabase;

    // ── Initial session check ──────────────────────────────────────────────
    supabase.auth
      .getSession()
      .then(async ({ data: { session } }) => {
        if (cancelled) return;
        if (session?.user) {
          await loadProfile(supabase, session.user.id, session.user.email ?? "");
        }
      })
      .catch((err) => {
        // Log but don't crash — still need to unblock the UI.
        console.error("[UserContext] getSession failed:", err);
      })
      .finally(() => {
        // ALWAYS unblock the UI, even if something went wrong.
        if (!cancelled) setHydrated(true);
      });

    // ── Auth state listener ───────────────────────────────────────────────
    // Guard on the event type to avoid the INITIAL_SESSION race where
    // onAuthStateChange fires with session=null before getSession resolves.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (cancelled) return;

      if (
        event === "SIGNED_IN" ||
        event === "TOKEN_REFRESHED" ||
        event === "USER_UPDATED"
      ) {
        if (session?.user) {
          await loadProfile(supabase, session.user.id, session.user.email ?? "");
        }
      } else if (event === "SIGNED_OUT") {
        setUser(null);
      }
      // INITIAL_SESSION and PASSWORD_RECOVERY are intentionally ignored here;
      // getSession() above handles the initial state reliably.
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [loadProfile]);

  const logout = useCallback(async () => {
    if (supabaseRef.current) {
      await supabaseRef.current.auth.signOut();
    }
    setUser(null);
  }, []);

  return (
    <UserContext.Provider value={{ user, hydrated, logout }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  return useContext(UserContext);
}

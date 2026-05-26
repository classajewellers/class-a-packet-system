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
// Top-level import is safe: createBrowserSupabaseClient() has a typeof window
// guard so calling it on the server returns a non-cached instance that won't
// store auth state. The singleton is only activated client-side.
import { createBrowserSupabaseClient } from "@/lib/supabase-browser";

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

  // Keep a ref to the supabase instance so logout() can call signOut()
  // without needing it in the closure's dependency array.
  const supabaseRef = useRef(createBrowserSupabaseClient());

  useEffect(() => {
    // Re-read from ref — this is the same singleton every time
    const supabase = supabaseRef.current;
    let cancelled = false;

    async function loadProfile(userId: string, email: string) {
      try {
        const { data } = await supabase
          .from("profiles")
          .select("full_name, role")
          .eq("id", userId)
          .single();

        if (cancelled) return;
        setUser({
          id: userId,
          name: data?.full_name || email,
          role: ((data?.role) ?? "staff") as UserRole,
          email,
          initials: deriveInitials(data?.full_name || email),
          loggedInAt: new Date().toISOString(),
        });
      } catch {
        // Profile query failed (e.g. migration not yet applied) — use minimal fallback
        if (cancelled) return;
        setUser({
          id: userId,
          name: email,
          role: "staff",
          email,
          initials: deriveInitials(email),
          loggedInAt: new Date().toISOString(),
        });
      }
    }

    // ── Initial session check ─────────────────────────────────────────────────
    // getSession() reads from cookies — fast, no network call for anonymous users.
    // Wrapped in an async IIFE so we can use await/try-finally cleanly.
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (cancelled) return;
        if (data.session?.user) {
          await loadProfile(data.session.user.id, data.session.user.email ?? "");
        }
      } catch (err) {
        console.error("[UserContext] getSession failed:", err);
      } finally {
        // Always unblock the UI — even if Supabase is unreachable.
        if (!cancelled) setHydrated(true);
      }
    })();

    // ── Auth state listener ───────────────────────────────────────────────────
    // Because we use a singleton client, this listener receives events from
    // signInWithPassword() called in the login form — even though that call
    // happens in a different component.
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
        setUser(null);
      }
      // INITIAL_SESSION is ignored — getSession() handles the initial state.
      // Ignoring it prevents the race where onAuthStateChange fires session=null
      // before getSession() has a chance to resolve.
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []); // Run once on mount — supabase singleton never changes

  async function logout() {
    await supabaseRef.current.auth.signOut();
    setUser(null);
  }

  return (
    <UserContext.Provider value={{ user, hydrated, logout }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  return useContext(UserContext);
}

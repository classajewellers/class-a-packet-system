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
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<LoggedInUser | null>(null);
  const [hydrated, setHydrated] = useState(false);
  // Stable client reference — never recreated
  const supabase = useRef(createBrowserSupabaseClient()).current;

  async function loadProfile(userId: string, email: string) {
    const { data } = await supabase
      .from("profiles")
      .select("full_name, role")
      .eq("id", userId)
      .single();

    if (data) {
      setUser({
        id: userId,
        name: data.full_name ?? email,
        role: (data.role ?? "staff") as UserRole,
        email,
        initials: deriveInitials(data.full_name ?? email),
        loggedInAt: new Date().toISOString(),
      });
    } else {
      // Profile not yet created — minimal fallback
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

  useEffect(() => {
    // Check existing session on mount
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        await loadProfile(session.user.id, session.user.email ?? "");
      }
      setHydrated(true);
    });

    // Subscribe to auth state changes (login/logout/token refresh)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        await loadProfile(session.user.id, session.user.email ?? "");
      } else {
        setUser(null);
      }
    });

    return () => subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function logout() {
    await supabase.auth.signOut();
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

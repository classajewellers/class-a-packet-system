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
import { createBrowserClient } from "@supabase/ssr";
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

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser]               = useState<LoggedInUser | null>(null);
  const [hydrated, setHydrated]       = useState(false);
  const [roleLoading, setRoleLoading] = useState(true);

  const router      = useRouter();
  const supabaseRef = useRef(createBrowserSupabaseClient());

  const loadProfile = async (userId: string, userEmail: string) => {
    try {
      const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );

      console.log("[UserContext] fetching profile for:", userId);

      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("auth_user_id", userId)
        .single();

      console.log("[UserContext] profile result:", JSON.stringify({ data, error }));

      if (error || !data) {
        // Fallback: use auth session data directly so login never hangs
        console.log("[UserContext] using auth fallback");
        setUser({
          id:         userId,
          name:       userEmail.split("@")[0],
          role:       "manager" as UserRole,
          email:      userEmail,
          tenantId:   "00000000-0000-0000-0000-000000000001",
          tenantSlug: "classa",
          initials:   userEmail.substring(0, 2).toUpperCase(),
          loggedInAt: new Date().toISOString(),
        });
        setRoleLoading(false);
        return;
      }

      setUser({
        id:         data.id,
        name:       data.full_name ?? userEmail,
        role:       data.role as UserRole,
        email:      data.email ?? userEmail,
        tenantId:   data.tenant_id,
        tenantSlug: "classa",
        initials:   (data.full_name ?? userEmail).substring(0, 2).toUpperCase(),
        loggedInAt: new Date().toISOString(),
      });
      setRoleLoading(false);
    } catch (err) {
      console.error("[UserContext] error:", err);
      setUser({
        id:         userId,
        name:       userEmail.split("@")[0],
        role:       "manager" as UserRole,
        email:      userEmail,
        tenantId:   "00000000-0000-0000-0000-000000000001",
        tenantSlug: "classa",
        initials:   userEmail.substring(0, 2).toUpperCase(),
        loggedInAt: new Date().toISOString(),
      });
      setRoleLoading(false);
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

"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import { LoggedInUser } from "@/lib/userTypes";

// ── Context shape ─────────────────────────────────────────────────────────────

interface UserContextType {
  user: LoggedInUser | null;
  /** true once localStorage has been read — guards against SSR mismatches */
  hydrated: boolean;
  login: (user: LoggedInUser) => void;
  logout: () => void;
}

const UserContext = createContext<UserContextType>({
  user: null,
  hydrated: false,
  login: () => {},
  logout: () => {},
});

const STORAGE_KEY = "classa_logged_in_user";

// ── Provider ──────────────────────────────────────────────────────────────────

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<LoggedInUser | null>(null);
  const [hydrated, setHydrated] = useState(false);

  // Read stored session once on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed: LoggedInUser = JSON.parse(stored);
        setUser(parsed);
      }
    } catch {
      /* ignore parse errors — treat as logged out */
    }
    setHydrated(true);
  }, []);

  function login(u: LoggedInUser) {
    setUser(u);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(u));
    } catch { /* ignore */ }
  }

  function logout() {
    setUser(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch { /* ignore */ }
  }

  return (
    <UserContext.Provider value={{ user, hydrated, login, logout }}>
      {children}
    </UserContext.Provider>
  );
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useUser() {
  return useContext(UserContext);
}

"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import { LoggedInUser } from "@/lib/userTypes";

interface UserContextType {
  user: LoggedInUser | null;
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
const SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000; // 12 hours

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<LoggedInUser | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed: LoggedInUser = JSON.parse(stored);
        // Check session age
        const age = Date.now() - new Date(parsed.loggedInAt).getTime();
        if (age < SESSION_MAX_AGE_MS) {
          setUser(parsed);
        } else {
          // Session expired — clear it
          localStorage.removeItem(STORAGE_KEY);
        }
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

export function useUser() {
  return useContext(UserContext);
}

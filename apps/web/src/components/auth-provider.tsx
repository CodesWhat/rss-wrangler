"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  isLoggedIn,
  isLoggedInFlag,
  clearLoggedInFlag,
  login,
  logout as apiLogout,
} from "@/lib/api";
import type { LoginRequest } from "@rss-wrangler/contracts";

interface AuthContextValue {
  authenticated: boolean;
  loading: boolean;
  loginUser: (req: LoginRequest) => Promise<void>;
  logoutUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  authenticated: false,
  loading: true,
  loginUser: async () => {},
  logoutUser: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Tokens are in-memory only, so after a page refresh they are gone.
    // If the localStorage flag says we were logged in but we have no
    // in-memory tokens, clear the stale flag.
    if (!isLoggedIn() && isLoggedInFlag()) {
      clearLoggedInFlag();
    }
    setAuthenticated(isLoggedIn());
    setLoading(false);
  }, []);

  const loginUser = useCallback(async (req: LoginRequest) => {
    await login(req);
    setAuthenticated(true);
  }, []);

  const logoutUser = useCallback(async () => {
    await apiLogout();
    setAuthenticated(false);
  }, []);

  // Cross-tab awareness: if another tab logs out (removes the flag),
  // mark this tab as unauthenticated too.
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === "rss_logged_in") {
        if (e.newValue !== "1") {
          setAuthenticated(false);
        }
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return (
    <AuthContext.Provider value={{ authenticated, loading, loginUser, logoutUser }}>
      {children}
    </AuthContext.Provider>
  );
}

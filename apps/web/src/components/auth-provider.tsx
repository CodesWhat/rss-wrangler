"use client";

import type { LoginRequest } from "@rss-wrangler/contracts";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useRef, useState } from "react";
import {
  logout as apiLogout,
  clearLoggedInFlag,
  getTokenExpiresAt,
  hasAccessToken,
  isLoggedIn,
  isLoggedInFlag,
  login,
  onAuthDeath,
  tryRestoreSession,
} from "@/lib/api";

interface AuthContextValue {
  authenticated: boolean;
  loading: boolean;
  loginUser: (req: LoginRequest) => Promise<void>;
  logoutUser: () => Promise<void>;
  markAuthenticated: () => void;
}

const AuthContext = createContext<AuthContextValue>({
  authenticated: false,
  loading: true,
  loginUser: async () => Promise.resolve(),
  logoutUser: async () => Promise.resolve(),
  markAuthenticated: () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function restoreSession() {
      if (isLoggedIn()) {
        // Access token in memory or refresh token in localStorage
        if (!hasAccessToken()) {
          // Have refresh token but no access token — try to restore
          const ok = await tryRestoreSession();
          if (cancelled) return;
          if (ok) {
            setAuthenticated(true);
          } else {
            clearLoggedInFlag();
            setAuthenticated(false);
          }
        } else {
          setAuthenticated(true);
        }
      } else {
        if (isLoggedInFlag()) clearLoggedInFlag();
        setAuthenticated(false);
      }
      setLoading(false);
    }
    restoreSession();
    return () => {
      cancelled = true;
    };
  }, []);

  const loginUser = useCallback(async (req: LoginRequest) => {
    await login(req);
    setAuthenticated(true);
  }, []);

  const logoutUser = useCallback(async () => {
    await apiLogout();
    setAuthenticated(false);
  }, []);

  const markAuthenticated = useCallback(() => {
    setAuthenticated(true);
  }, []);

  // Listen for auth-death events from the API layer (failed refresh)
  // and redirect to login exactly once.
  useEffect(() => {
    return onAuthDeath(() => {
      setAuthenticated(false);
    });
  }, []);

  // Proactive background token refresh: schedule a refresh ~60s before the
  // access token expires so the user never hits a 401 during normal browsing.
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function scheduleRefresh() {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }

      if (!authenticated) return;

      const expiresAt = getTokenExpiresAt();
      if (!expiresAt) return;

      // Refresh 60 seconds before expiry, minimum 5 seconds from now
      const refreshIn = Math.max(expiresAt - Date.now() - 60_000, 5_000);

      refreshTimerRef.current = setTimeout(async () => {
        refreshTimerRef.current = null;
        const ok = await tryRestoreSession();
        if (ok) {
          scheduleRefresh();
        }
        // If refresh failed, onAuthDeath will fire and setAuthenticated(false)
      }, refreshIn);
    }

    scheduleRefresh();

    return () => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    };
  }, [authenticated]);

  // Register service worker for push notifications
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Service worker registration failed — non-critical
      });
    }
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
    <AuthContext.Provider
      value={{ authenticated, loading, loginUser, logoutUser, markAuthenticated }}
    >
      {children}
    </AuthContext.Provider>
  );
}

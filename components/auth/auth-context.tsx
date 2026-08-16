"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { PublicUser } from "@/lib/auth/types";
import type { PublicBilling } from "@/lib/billing/types";
import { AuthToastProvider } from "./auth-toast";

export type AuthMode = "login" | "signup" | "forgot";

type AuthContextValue = {
  open: boolean;
  mode: AuthMode;
  user: PublicUser | null;
  billing: PublicBilling | null;
  loading: boolean;
  figmaOAuthConfigured: boolean;
  vercelOAuthConfigured: boolean;
  openAuth: (mode?: AuthMode) => void;
  closeAuth: () => void;
  setMode: (mode: AuthMode) => void;
  refreshUser: () => Promise<void>;
  setUser: (user: PublicUser | null) => void;
  setBilling: (billing: PublicBilling | null) => void;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<AuthMode>("signup");
  const [user, setUser] = useState<PublicUser | null>(null);
  const [billing, setBilling] = useState<PublicBilling | null>(null);
  const [figmaOAuthConfigured, setFigmaOAuthConfigured] = useState(false);
  const [vercelOAuthConfigured, setVercelOAuthConfigured] = useState(false);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me");
      const data = (await res.json()) as {
        user: PublicUser | null;
        billing?: PublicBilling | null;
        figmaOAuthConfigured?: boolean;
        vercelOAuthConfigured?: boolean;
      };
      setUser(data.user ?? null);
      setBilling(data.billing ?? null);
      setFigmaOAuthConfigured(Boolean(data.figmaOAuthConfigured));
      setVercelOAuthConfigured(Boolean(data.vercelOAuthConfigured));
    } catch {
      setUser(null);
      setBilling(null);
      setFigmaOAuthConfigured(false);
      setVercelOAuthConfigured(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshUser();
  }, [refreshUser]);

  const openAuth = useCallback((next: AuthMode = "signup") => {
    setMode(next);
    setOpen(true);
  }, []);

  const closeAuth = useCallback(() => setOpen(false), []);

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    setBilling(null);
    setFigmaOAuthConfigured(false);
    setVercelOAuthConfigured(false);
  }, []);

  const value = useMemo(
    () => ({
      open,
      mode,
      user,
      billing,
      loading,
      figmaOAuthConfigured,
      vercelOAuthConfigured,
      openAuth,
      closeAuth,
      setMode,
      refreshUser,
      setUser,
      setBilling,
      logout,
    }),
    [
      open,
      mode,
      user,
      billing,
      loading,
      figmaOAuthConfigured,
      vercelOAuthConfigured,
      openAuth,
      closeAuth,
      refreshUser,
      logout,
    ],
  );

  return (
    <AuthToastProvider>
      <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
    </AuthToastProvider>
  );
}

export function useAuthModal() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuthModal must be used within AuthProvider");
  }
  return ctx;
}

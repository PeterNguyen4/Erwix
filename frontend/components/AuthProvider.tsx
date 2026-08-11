"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { api, UserPrivate } from "@/lib/api";

interface AuthContextValue {
  user: UserPrivate | null;
  isAdmin: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  completeOnboarding: () => void;
  startOnboarding: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const PUBLIC_PATHS = ["/login"];
const ONBOARDING_PATH = "/onboarding";

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserPrivate | null>(null);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();
  const isPublicPath = PUBLIC_PATHS.some((p) => pathname.startsWith(p));
  const isOnboardingPath = pathname.startsWith(ONBOARDING_PATH);

  useEffect(() => {
    let cancelled = false;
    async function loadUser() {
      try {
        const me = await api.me();
        if (cancelled) return;
        setUser(me);
      } catch {
        // no valid cookie
        if (!cancelled) setIsLoading(false);
        return;
      }
      try {
        const prefs = await api.getPreferences();
        if (!cancelled) setNeedsOnboarding(!prefs.onboarding_completed_at);
      } catch {
        
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    loadUser();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (isLoading) return;
    if (!user && !isPublicPath) router.replace("/login");
    if (user && isPublicPath) router.replace("/");
    if (user && needsOnboarding && !isOnboardingPath && !isPublicPath) router.replace(ONBOARDING_PATH);
  }, [isLoading, user, needsOnboarding, isPublicPath, isOnboardingPath, router]);

  async function login(email: string, password: string) {
    const me = await api.login(email, password);
    setUser(me);
    const prefs = await api.getPreferences();
    setNeedsOnboarding(!prefs.onboarding_completed_at);
  }

  function logout() {
    api.logout().finally(() => {
      setUser(null);
      router.replace("/login");
    });
  }

  function completeOnboarding() {
    setNeedsOnboarding(false);
  }

  function startOnboarding() {
    setNeedsOnboarding(true);
    router.push(ONBOARDING_PATH);
  }

  const blockedByOnboardingRedirect = user && needsOnboarding && !isOnboardingPath && !isPublicPath;

  return (
    <AuthContext.Provider
      value={{
        user,
        isAdmin: user?.role === "admin",
        isLoading,
        login,
        logout,
        completeOnboarding,
        startOnboarding,
      }}
    >
      {isLoading || (!user && !isPublicPath) || blockedByOnboardingRedirect ? null : children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

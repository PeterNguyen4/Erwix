"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { api, clearToken, getToken, setToken, UserPrivate } from "@/lib/api";

interface AuthContextValue {
  user: UserPrivate | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const PUBLIC_PATHS = ["/login"];

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserPrivate | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();
  const isPublicPath = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  useEffect(() => {
    let cancelled = false;
    async function loadUser() {
      if (!getToken()) {
        setIsLoading(false);
        return;
      }
      try {
        const me = await api.me();
        if (!cancelled) setUser(me);
      } catch {
        clearToken();
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
  }, [isLoading, user, isPublicPath, router]);

  async function login(email: string, password: string) {
    const token = await api.login(email, password);
    setToken(token.access_token);
    const me = await api.me();
    setUser(me);
  }

  function logout() {
    clearToken();
    setUser(null);
    router.replace("/login");
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout }}>
      {isLoading || (!user && !isPublicPath) ? null : children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

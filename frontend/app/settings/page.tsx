"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { Moon, Sun, Link2, Unlink, LogOut, UserRoundCog } from "lucide-react";
import { useTheme } from "@/components/ThemeProvider";
import { useAuth } from "@/components/AuthProvider";
import AlpacaConnectModal from "@/components/AlpacaConnectModal";
import { api, AlpacaStatus, UserPrivate } from "@/lib/api";

export default function SettingsPage() {
  return (
    <Suspense fallback={null}>
      <SettingsPageInner />
    </Suspense>
  );
}

function SettingsPageInner() {
  const { theme, setTheme } = useTheme();
  const { user, isAdmin, logout, startOnboarding } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [replayingOnboarding, setReplayingOnboarding] = useState(false);
  const [replayOnboardingError, setReplayOnboardingError] = useState<string | null>(null);

  const [alpaca, setAlpaca] = useState<AlpacaStatus | null>(null);
  const [alpacaBanner, setAlpacaBanner] = useState<"connected" | "error" | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [showAlpacaDisclosure, setShowAlpacaDisclosure] = useState(false);

  const [users, setUsers] = useState<UserPrivate[] | null>(null);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [pendingUserId, setPendingUserId] = useState<number | null>(null);

  useEffect(() => {
    api.alpacaStatus().then(setAlpaca).catch(() => setAlpaca({ connected: false, env: null }));
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    api
      .listUsers()
      .then(setUsers)
      .catch(() => setUsersError("Couldn't load users."));
  }, [isAdmin]);

  const handleRoleToggle = async (target: UserPrivate) => {
    const nextRole = target.role === "admin" ? "user" : "admin";
    setPendingUserId(target.id);
    setUsersError(null);
    try {
      const updated = await api.updateUserRole(target.id, nextRole);
      setUsers((prev) => prev?.map((u) => (u.id === updated.id ? updated : u)) ?? prev);
    } catch {
      setUsersError("Couldn't update that user's role.");
    } finally {
      setPendingUserId(null);
    }
  };

  const handleReplayOnboarding = async () => {
    setReplayingOnboarding(true);
    setReplayOnboardingError(null);
    try {
      await api.resetOnboarding();
      startOnboarding();
    } catch {
      setReplayOnboardingError("Couldn't reset onboarding. Please try again.");
    } finally {
      setReplayingOnboarding(false);
    }
  };

  useEffect(() => {
    const result = searchParams.get("alpaca");
    if (result === "connected" || result === "error") {
      setAlpacaBanner(result);
      router.replace("/settings");
    }
  }, [searchParams, router]);

  const handleConnect = async () => {
    setShowAlpacaDisclosure(false);
    setConnecting(true);
    try {
      await api.connectAlpaca("paper");
    } catch {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      await api.disconnectAlpaca();
      setAlpaca({ connected: false, env: null });
    } finally {
      setDisconnecting(false);
    }
  };

  return (
    <main className="flex h-full flex-col">
      <header className="flex items-center min-h-[60px] border-b border-auth-field/40 bg-panel px-4 py-3 shrink-0">
        <div className="text-xl font-normal text-fg">Settings</div>
      </header>

      <div className="flex-1 overflow-auto p-3">
        <div className="max-w-2xl mx-auto space-y-4">
          {alpacaBanner && (
            <div
              className={`rounded-lg border px-4 py-3 text-sm ${
                alpacaBanner === "connected"
                  ? "border-green-500/30 bg-green-500/10 text-green-500"
                  : "border-red-500/30 bg-red-500/10 text-red-500"
              }`}
            >
              {alpacaBanner === "connected"
                ? "Your Alpaca account is connected."
                : "Couldn't connect your Alpaca account. Please try again."}
            </div>
          )}

          <div className="rounded-lg border border-border bg-panel p-6">
            <h2 className="text-lg font-semibold text-fg mb-4">Brokerage</h2>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Image src="/alpaca-icon.png" alt="Alpaca" width={32} height={32} className="rounded-md" />
                <div>
                  <div className="text-sm font-medium text-fg">Alpaca</div>
                  <div className="text-xs text-muted">
                    {alpaca === null
                      ? "Checking connection..."
                      : alpaca.connected
                        ? `Connected (${alpaca.env} account)`
                        : "Connect your Alpaca paper account to begin trading"}
                  </div>
                </div>
              </div>
              {alpaca?.connected ? (
                <button
                  type="button"
                  onClick={handleDisconnect}
                  disabled={disconnecting}
                  className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted hover:text-fg disabled:opacity-50"
                >
                  <Unlink size={14} strokeWidth={2} />
                  {disconnecting ? "Disconnecting..." : "Disconnect"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowAlpacaDisclosure(true)}
                  disabled={connecting || alpaca === null}
                  className="flex items-center gap-1.5 rounded-md bg-violet-500/20 px-3 py-1.5 text-xs font-medium text-violet-600 hover:bg-violet-500/30 disabled:opacity-50 dark:text-violet-400"
                >
                  <Link2 size={14} strokeWidth={2} />
                  {connecting ? "Redirecting..." : "Connect"}
                </button>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-border bg-panel p-6">
            <h2 className="text-lg font-semibold text-fg mb-4">Account</h2>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-fg">Theme</div>
                <div className="text-xs text-muted">Choose how Erwix looks on this device</div>
              </div>
              <div className="flex items-center gap-1 rounded-lg border border-border bg-field p-1">
                <button
                  type="button"
                  onClick={() => setTheme("dark")}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    theme === "dark" ? "bg-violet-500/20 text-violet-600 dark:text-violet-400" : "text-muted hover:text-fg"
                  }`}
                >
                  <Moon size={14} strokeWidth={2} />
                  Dark
                </button>
                <button
                  type="button"
                  onClick={() => setTheme("light")}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    theme === "light" ? "bg-violet-500/20 text-violet-600" : "text-muted hover:text-fg"
                  }`}
                >
                  <Sun size={14} strokeWidth={2} />
                  Light
                </button>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-border flex items-center justify-between">
              <a href="/legal" className="text-xs font-medium text-muted hover:text-fg underline">
                Terms of Use &amp; Privacy Policy
              </a>
              <button
                type="button"
                onClick={logout}
                className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted hover:text-fg"
              >
                <LogOut size={14} strokeWidth={2} />
                Sign out
              </button>
            </div>
          </div>

          {isAdmin && (
            <div className="rounded-lg border border-border bg-panel p-6">
              <div className="flex items-center gap-2 mb-4">
                <UserRoundCog size={16} strokeWidth={2} className="text-accent dark:text-violet-400" />
                <h2 className="text-lg font-semibold text-fg">Admins</h2>
              </div>

              {usersError && <div className="mb-3 text-xs text-red-500">{usersError}</div>}

              {users === null ? (
                <div className="text-xs text-muted">Loading users...</div>
              ) : (
                <div className="divide-y divide-border">
                  {users.map((u) => (
                    <div key={u.id} className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0">
                      <div>
                        <div className="text-sm font-medium text-fg">
                          {u.username}
                          {u.id === user?.id && <span className="ml-1.5 text-xs text-muted">(you)</span>}
                        </div>
                        <div className="text-xs text-muted">{u.email}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                            u.role === "admin"
                              ? "bg-accent/20 text-accent dark:text-violet-400"
                              : "bg-field text-muted"
                          }`}
                        >
                          {u.role}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRoleToggle(u)}
                          disabled={pendingUserId === u.id || (u.id === user?.id && u.role === "admin")}
                          className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-muted hover:text-fg disabled:opacity-50"
                        >
                          {pendingUserId === u.id
                            ? "Updating..."
                            : u.role === "admin"
                              ? "Remove admin"
                              : "Make admin"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {isAdmin && (
            <div className="rounded-lg border border-border bg-panel p-6">
              <div className="flex items-center gap-2 mb-4">
                <UserRoundCog size={16} strokeWidth={2} className="text-accent dark:text-violet-400" />
                <h2 className="text-lg font-semibold text-fg">Developer tools</h2>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-fg">Replay onboarding</div>
                  <div className="text-xs text-muted">
                    Reset your account&apos;s onboarding status and replay the first-login trial run
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleReplayOnboarding}
                  disabled={replayingOnboarding}
                  className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-muted hover:text-fg disabled:opacity-50"
                >
                  {replayingOnboarding ? "Resetting..." : "Act as a new user"}
                </button>
              </div>
              {replayOnboardingError && (
                <div className="mt-2 text-xs text-red-500">{replayOnboardingError}</div>
              )}
            </div>
          )}
        </div>
      </div>

      {showAlpacaDisclosure && (
        <AlpacaConnectModal
          onCancel={() => setShowAlpacaDisclosure(false)}
          onConnect={handleConnect}
          connecting={connecting}
        />
      )}
    </main>
  );
}

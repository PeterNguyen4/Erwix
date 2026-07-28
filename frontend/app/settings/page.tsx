"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { Moon, Sun, Link2, Unlink } from "lucide-react";
import { useTheme } from "@/components/ThemeProvider";
import { api, AlpacaStatus } from "@/lib/api";

export default function SettingsPage() {
  return (
    <Suspense fallback={null}>
      <SettingsPageInner />
    </Suspense>
  );
}

function SettingsPageInner() {
  const { theme, setTheme } = useTheme();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [alpaca, setAlpaca] = useState<AlpacaStatus | null>(null);
  const [alpacaBanner, setAlpacaBanner] = useState<"connected" | "error" | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  useEffect(() => {
    api.alpacaStatus().then(setAlpaca).catch(() => setAlpaca({ connected: false, env: null }));
  }, []);

  useEffect(() => {
    const result = searchParams.get("alpaca");
    if (result === "connected" || result === "error") {
      setAlpacaBanner(result);
      router.replace("/settings");
    }
  }, [searchParams, router]);

  const handleConnect = async () => {
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
      <header className="flex items-center border-b border-border bg-panel px-4 py-3 shrink-0">
        <div className="text-xl font-semibold text-fg">Settings</div>
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
                        : "Connect your Alpaca paper account to trade under your own account"}
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
                  onClick={handleConnect}
                  disabled={connecting || alpaca === null}
                  className="flex items-center gap-1.5 rounded-md bg-accent/20 px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent/30 disabled:opacity-50"
                >
                  <Link2 size={14} strokeWidth={2} />
                  {connecting ? "Redirecting..." : "Connect"}
                </button>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-border bg-panel p-6">
            <h2 className="text-lg font-semibold text-fg mb-4">Appearance</h2>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-fg">Theme</div>
                <div className="text-xs text-muted">Choose how Entro looks on this device</div>
              </div>
              <div className="flex items-center gap-1 rounded-lg border border-border bg-bg p-1">
                <button
                  type="button"
                  onClick={() => setTheme("dark")}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    theme === "dark" ? "bg-accent/20 text-accent" : "text-muted hover:text-fg"
                  }`}
                >
                  <Moon size={14} strokeWidth={2} />
                  Dark
                </button>
                <button
                  type="button"
                  onClick={() => setTheme("light")}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    theme === "light" ? "bg-accent/20 text-accent" : "text-muted hover:text-fg"
                  }`}
                >
                  <Sun size={14} strokeWidth={2} />
                  Light
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, Account } from "@/lib/api";
import TradeJournal from "@/components/TradeJournal";

export default function JournalPage() {
  const router = useRouter();
  const [account, setAccount] = useState<Account | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [showMenu, setShowMenu] = useState(false);

  const loadAccount = useCallback(() => {
    api.account().then(setAccount).catch(() => {});
  }, []);

  useEffect(() => {
    loadAccount();
    const id = setInterval(loadAccount, 15000);
    return () => clearInterval(id);
  }, [loadAccount]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (showMenu && !(e.target as HTMLElement).closest("button")) {
        setShowMenu(false);
      }
    };
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, [showMenu]);

  return (
    <main className="flex h-screen flex-col">
      <header className="flex items-center justify-between border-b border-border bg-panel px-4 py-3 gap-4">
        {/* Hamburger Menu */}
        <div className="relative">
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="flex flex-col gap-1.5 p-2 hover:bg-accent/20 rounded transition-colors"
          >
            <div className="w-6 h-0.5 bg-white rounded"></div>
            <div className="w-6 h-0.5 bg-white rounded"></div>
            <div className="w-6 h-0.5 bg-white rounded"></div>
          </button>

          {/* Dropdown Menu */}
          {showMenu && (
            <div className="absolute top-full left-0 mt-2 bg-panel border border-border rounded shadow-lg z-50 w-48">
              <button
                onClick={() => {
                  router.push("/");
                  setShowMenu(false);
                }}
                className="w-full text-left px-4 py-3 hover:bg-accent/20 border-b border-border text-white"
              >
                📈 Chart
              </button>
              <button
                onClick={() => {
                  router.push("/journal");
                  setShowMenu(false);
                }}
                className="w-full text-left px-4 py-3 hover:bg-accent/20 border-b border-border text-white"
              >
                📋 Journal
              </button>
              <button
                onClick={() => {
                  router.push("/settings");
                  setShowMenu(false);
                }}
                className="w-full text-left px-4 py-3 hover:bg-accent/20 text-white"
              >
                ⚙️ Settings
              </button>
            </div>
          )}
        </div>

        <div className="text-xl font-semibold text-white">Trade Journal</div>

        {account && (
          <div className="flex gap-8 text-xs ml-auto">
            <div>
              <div className="text-muted">Equity</div>
              <div className="text-white font-semibold">
                ${account.equity.toLocaleString()}
              </div>
            </div>
            <div>
              <div className="text-muted">Buying power</div>
              <div className="text-white font-semibold">
                ${account.buying_power.toLocaleString()}
              </div>
            </div>
          </div>
        )}
      </header>

      <div className="flex-1 overflow-hidden p-3">
        <div className="h-full rounded-lg border border-border bg-bg overflow-auto">
          <TradeJournal refreshKey={refreshKey} />
        </div>
      </div>
    </main>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function SettingsPage() {
  const router = useRouter();
  const [showMenu, setShowMenu] = useState(false);

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

        <div className="text-xl font-semibold text-white">Settings</div>

        <div className="flex-1" />
      </header>

      <div className="flex-1 overflow-auto p-3">
        <div className="max-w-2xl mx-auto">
          <div className="rounded-lg border border-border bg-bg p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Application Settings</h2>
            <p className="text-muted">Settings coming soon...</p>
          </div>
        </div>
      </div>
    </main>
  );
}

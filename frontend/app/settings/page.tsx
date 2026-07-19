"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/ThemeProvider";

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();

  return (
    <main className="flex h-full flex-col">
      <header className="flex items-center border-b border-border bg-panel px-4 py-3 shrink-0">
        <div className="text-xl font-semibold text-fg">Settings</div>
      </header>

      <div className="flex-1 overflow-auto p-3">
        <div className="max-w-2xl mx-auto">
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

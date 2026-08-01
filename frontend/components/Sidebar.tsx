"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useDebriefStatus } from "@/lib/useDebriefStatus";
import { ToolbarTooltip } from "@/components/chart/ToolbarButton";
import {
  LineChart,
  Notebook,
  Briefcase,
  Newspaper,
  Compass,
  FlaskConical,
  Settings,
} from "lucide-react";

const NAV_ITEMS = [
  { label: "Chart",     href: "/chart",     Icon: LineChart },
  { label: "Portfolio", href: "/portfolio", Icon: Briefcase },
  { label: "Journal",   href: "/journal",   Icon: Notebook },
  { label: "News",      href: "/news",      Icon: Newspaper },
  { label: "Strategy",  href: "/strategy",  Icon: Compass },
  { label: "Backtesting", href: "/backtesting", Icon: FlaskConical },
];

export default function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const { hasNewTrades } = useDebriefStatus();
  const [hoveredHref, setHoveredHref] = useState<string | null>(null);
  const [settingsHover, setSettingsHover] = useState(false);

  return (
    <nav className="flex flex-col items-center gap-1 border-r border-auth-field/40 bg-panel w-16 py-4 z-30 shrink-0">
      <div className="mb-3 px-2">
        <img src="/entro.svg" alt="Entro" className="w-8 h-8" />
      </div>
      {NAV_ITEMS.map(({ label, href, Icon }) => {
        const active = pathname === href;
        const showBadge = href === "/journal" && hasNewTrades;
        return (
          <div
            key={href}
            className="relative"
            onMouseEnter={() => setHoveredHref(href)}
            onMouseLeave={() => setHoveredHref(null)}
          >
            <button
              onClick={() => router.push(href)}
              className={`relative flex h-10 w-10 items-center justify-center rounded-lg transition-colors ${
                active
                  ? "text-violet-700 dark:text-violet-400 bg-violet-500/20"
                  : "text-muted hover:text-fg hover:bg-violet-500/10"
              }`}
            >
              <span className="relative">
                <Icon size={20} strokeWidth={2} />
                {showBadge && (
                  <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-violet-400 animate-pulse" />
                )}
              </span>
            </button>
            <ToolbarTooltip
              label={showBadge ? `${label} — analyst debrief ready` : label}
              hover={hoveredHref === href}
              placement="right"
            />
          </div>
        );
      })}
      <div className="flex-1" />
      <div
        className="relative mb-2"
        onMouseEnter={() => setSettingsHover(true)}
        onMouseLeave={() => setSettingsHover(false)}
      >
        <button
          onClick={() => router.push("/settings")}
          className={`flex h-10 w-10 items-center justify-center rounded-lg transition-colors ${
            pathname === "/settings"
              ? "text-violet-700 dark:text-violet-400 bg-violet-500/20"
              : "text-muted hover:text-fg hover:bg-violet-500/10"
          }`}
        >
          <Settings size={20} strokeWidth={2} />
        </button>
        <ToolbarTooltip label="Settings" hover={settingsHover} placement="right" />
      </div>
    </nav>
  );
}

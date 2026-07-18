"use client";

import { usePathname, useRouter } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { useDebriefStatus } from "@/lib/useDebriefStatus";
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
  { label: "Settings",  href: "/settings",  Icon: Settings },
];

export default function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const { hasNewTrades } = useDebriefStatus();

  return (
    <nav className="flex flex-col items-center gap-1 border-r border-border bg-panel w-16 py-4 z-30 shrink-0">
      <div className="mb-3 px-2">
        <img src="/entro.svg" alt="Entro" className="w-8 h-8" />
      </div>
      {NAV_ITEMS.map(({ label, href, Icon }) => {
        const active = pathname === href;
        const showBadge = href === "/journal" && hasNewTrades;
        return (
          <button
            key={href}
            onClick={() => router.push(href)}
            title={showBadge ? `${label} — analyst debrief ready` : label}
            className={`relative flex flex-col items-center gap-1 w-full py-2 px-1 transition-colors ${
              active
                ? "text-accent bg-accent/20"
                : "text-muted hover:text-fg hover:bg-accent/10"
            }`}
          >
            <span className="relative">
              <Icon size={20} strokeWidth={2} />
              {showBadge && (
                <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-accent animate-pulse" />
              )}
            </span>
            <span className="text-[10px] font-medium">{label}</span>
          </button>
        );
      })}
      <div className="flex-1" />
      <div className="mb-2">
        <UserButton afterSignOutUrl="/login" />
      </div>
    </nav>
  );
}

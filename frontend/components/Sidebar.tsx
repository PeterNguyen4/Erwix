"use client";

import { usePathname, useRouter } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { useDebriefStatus } from "@/lib/useDebriefStatus";

function IconChart() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <polyline points="2,14 7,8 11,11 16,4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="2" y1="17" x2="18" y2="17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconJournal() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <rect x="4" y="2" width="12" height="16" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <line x1="7" y1="7" x2="13" y2="7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="7" y1="10" x2="13" y2="10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="7" y1="13" x2="11" y2="13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconPortfolio() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <rect x="2.5" y="5" width="15" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M6 5V4a1.5 1.5 0 0 1 1.5-1.5h5A1.5 1.5 0 0 1 14 4v1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="14" cy="10.5" r="1.25" fill="currentColor" />
    </svg>
  );
}

function IconStrategy() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M10 2l6 2.5v4c0 4-2.5 7-6 8.5-3.5-1.5-6-4.5-6-8.5v-4L10 2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M10 6v6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M7.5 8.5h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconBacktest() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M3 16V11M8 16V6M13 16V9M18 16V3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M2 16h16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconNews() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <rect x="3" y="3.5" width="14" height="13" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <line x1="6" y1="7" x2="14" y2="7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="6" y1="10" x2="14" y2="10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="6" y1="13" x2="10.5" y2="13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconSettings() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.22 4.22l1.42 1.42M14.36 14.36l1.42 1.42M4.22 15.78l1.42-1.42M14.36 5.64l1.42-1.42" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

const NAV_ITEMS = [
  { label: "Chart",     href: "/chart",     Icon: IconChart },
  { label: "Portfolio", href: "/portfolio", Icon: IconPortfolio },
  { label: "Journal",   href: "/journal",   Icon: IconJournal },
  { label: "News",      href: "/news",      Icon: IconNews },
  { label: "Strategy",  href: "/strategy",  Icon: IconStrategy },
  { label: "Backtesting", href: "/backtesting", Icon: IconBacktest },
  { label: "Settings",  href: "/settings",  Icon: IconSettings },
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
                : "text-muted hover:text-white hover:bg-accent/10"
            }`}
          >
            <span className="relative">
              <Icon />
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

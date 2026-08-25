"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ToolbarTooltip } from "@/components/chart/ToolbarButton";
import NotificationBell from "@/components/NotificationBell";
import {
  LineChart,
  WalletMinimal,
  Newspaper,
  ClipboardList,
  FlaskConical,
  CalendarDays,
  Settings,
  PanelRight,
} from "lucide-react";

const NAV_ITEMS = [
  { label: "Chart",     href: "/chart",     Icon: LineChart },
  { label: "Portfolio", href: "/portfolio", Icon: WalletMinimal },
  { label: "Journal",   href: "/journal",   Icon: CalendarDays },
  { label: "News",      href: "/news",      Icon: Newspaper },
  { label: "Strategy",  href: "/strategy",  Icon: ClipboardList },
  { label: "Backtesting", href: "/backtesting", Icon: FlaskConical },
];

export default function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const [hoveredHref, setHoveredHref] = useState<string | null>(null);
  const [settingsHover, setSettingsHover] = useState(false);
  const navButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const settingsButtonRef = useRef<HTMLButtonElement>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia("(max-width: 767px)");
    setIsMobile(mql.matches);
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    setExpanded(false);
  }, [pathname]);

  const showLabel = isMobile && expanded;
  const navigate = (href: string) => {
    router.push(href);
    if (isMobile) setExpanded(false);
  };

  return (
    <>
      {isMobile && expanded && (
        <div
          className="fixed inset-0 bg-black/40 z-[55]"
          onClick={() => setExpanded(false)}
        />
      )}
      <nav
        className={`fixed top-0 left-0 bottom-0 md:relative flex flex-col items-stretch md:items-center gap-1 border-r border-auth-field/40 bg-panel pt-0 pb-2 md:py-4 z-[60] shrink-0 transition-[width] duration-200 ease-out overflow-hidden md:w-16 ${
          expanded ? "w-56" : "w-14"
        }`}
      >
        {isMobile ? (
          <div className="px-2 min-h-[60px] flex items-center shrink-0">
            {expanded ? (
              <div className="flex w-full h-10 items-center">
                <div className="flex min-w-0 flex-1 items-center gap-3 px-2.5">
                  <img src="/erwix.svg" alt="Erwix" className="w-5 h-5 shrink-0" />
                  <span className="truncate text-left text-lg font-normal text-fg">Erwix</span>
                </div>
                <button
                  onClick={() => setExpanded(false)}
                  className="shrink-0 flex h-10 w-10 items-center justify-center rounded-lg text-muted hover:text-fg hover:bg-violet-500/10"
                  aria-label="Collapse sidebar"
                >
                  <PanelRight size={20} strokeWidth={2} className="rotate-180" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setExpanded(true)}
                className="flex h-10 w-full items-center gap-3 px-2.5 rounded-lg text-muted hover:text-fg hover:bg-violet-500/10"
                aria-label="Expand sidebar"
              >
                <PanelRight size={20} strokeWidth={2} className="shrink-0" />
              </button>
            )}
          </div>
        ) : (
          <div className="mb-6 px-2 flex items-center justify-center shrink-0">
            <img src="/erwix.svg" alt="Erwix" className="w-8 h-8" />
          </div>
        )}
        {NAV_ITEMS.map(({ label, href, Icon }) => {
          const active = pathname === href;
          return (
            <div
              key={href}
              className="relative px-2 md:px-0"
              onMouseEnter={() => setHoveredHref(href)}
              onMouseLeave={() => setHoveredHref(null)}
            >
              <button
                ref={(el) => { navButtonRefs.current[href] = el; }}
                onClick={() => navigate(href)}
                className={`relative flex h-10 w-full md:w-10 items-center gap-3 px-2.5 md:px-0 md:justify-center rounded-lg transition-colors ${
                  active
                    ? "text-violet-700 dark:text-violet-400 bg-violet-500/20"
                    : "text-muted hover:text-fg hover:bg-violet-500/10"
                }`}
              >
                <span className="relative shrink-0">
                  <Icon size={20} strokeWidth={2} />
                </span>
                {showLabel && <span className="text-sm font-medium whitespace-nowrap">{label}</span>}
              </button>
              {!isMobile && (
                <ToolbarTooltip
                  label={label}
                  hover={hoveredHref === href}
                  placement="right"
                  anchorRef={{ current: navButtonRefs.current[href] ?? null }}
                />
              )}
            </div>
          );
        })}
        <div className="flex-1" />
        <div className="px-2 md:px-0">
          <NotificationBell showLabel={showLabel} hideTooltip={isMobile} />
        </div>
        <div
          className="relative mb-2 px-2 md:px-0"
          onMouseEnter={() => setSettingsHover(true)}
          onMouseLeave={() => setSettingsHover(false)}
        >
          <button
            ref={settingsButtonRef}
            onClick={() => navigate("/settings")}
            className={`flex h-10 w-full md:w-10 items-center gap-3 px-2.5 md:px-0 md:justify-center rounded-lg transition-colors ${
              pathname === "/settings"
                ? "text-violet-700 dark:text-violet-400 bg-violet-500/20"
                : "text-muted hover:text-fg hover:bg-violet-500/10"
            }`}
          >
            <Settings size={20} strokeWidth={2} className="shrink-0" />
            {showLabel && <span className="text-sm font-medium whitespace-nowrap">Settings</span>}
          </button>
          {!isMobile && (
            <ToolbarTooltip label="Settings" hover={settingsHover} placement="right" anchorRef={settingsButtonRef} />
          )}
        </div>
      </nav>
    </>
  );
}

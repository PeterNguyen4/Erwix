"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, X } from "lucide-react";
import { useNotifications } from "@/lib/useNotifications";
import { ToolbarTooltip } from "@/components/chart/ToolbarButton";

export default function NotificationBell() {
  const router = useRouter();
  const { items, unseenCount, markRead, dismiss } = useNotifications();
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        buttonRef.current && !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  const toggleOpen = () => setOpen((prev) => !prev);

  const handleItemClick = (key: string, href: string) => {
    markRead(key);
    setOpen(false);
    router.push(href);
  };

  return (
    <div
      className="relative"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <button
        ref={buttonRef}
        onClick={toggleOpen}
        className={`relative flex h-10 w-10 items-center justify-center rounded-lg transition-colors ${
          open
            ? "text-violet-700 dark:text-violet-400 bg-violet-500/20"
            : "text-muted hover:text-fg hover:bg-violet-500/10"
        }`}
      >
        <span className="relative inline-flex">
          <Bell size={20} strokeWidth={2} />
          {unseenCount > 0 && (
            <span className="absolute right-0 top-0 h-2 w-2 rounded-full bg-red-500" />
          )}
        </span>
      </button>
      {!open && <ToolbarTooltip label="Notifications" hover={hover} placement="right" anchorRef={buttonRef} />}

      {open && (
        <div
          ref={panelRef}
          className="absolute bottom-0 left-full ml-3 w-80 rounded-lg border border-auth-field/40 bg-panel shadow-xl z-40 overflow-hidden"
        >
          <div className="px-4 py-3 border-b border-auth-field/40 text-sm font-semibold text-fg">
            Notifications
          </div>
          {items.length === 0 ? (
            <div className="px-4 py-6 text-sm text-muted text-center">You're all caught up.</div>
          ) : (
            <ul className="max-h-96 overflow-y-auto">
              {items.map((item) => (
                <li key={item.id} className="group relative border-b border-auth-field/20 last:border-b-0">
                  <button
                    onClick={() => handleItemClick(item.id, item.href)}
                    className="w-full text-left pl-4 pr-9 py-3 hover:bg-violet-500/10 transition-colors"
                  >
                    <div className="flex items-start gap-2">
                      {item.unseen && (
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />
                      )}
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-fg">{item.title}</div>
                        <div className="text-xs text-muted mt-0.5">{item.body}</div>
                      </div>
                    </div>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      dismiss(item.id);
                    }}
                    aria-label="Dismiss"
                    className="absolute right-2 top-3 flex h-5 w-5 items-center justify-center rounded text-muted opacity-0 group-hover:opacity-100 hover:bg-violet-500/20 hover:text-fg transition-opacity"
                  >
                    <X size={14} strokeWidth={2} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

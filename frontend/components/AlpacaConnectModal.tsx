"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { ChevronDown, X } from "lucide-react";

interface AlpacaConnectModalProps {
  title?: string;
  subtitle?: string;
  onCancel: () => void;
  onConnect: () => void;
  connecting?: boolean;
}

export default function AlpacaConnectModal({
  title = "Connect Alpaca",
  subtitle = "Link your Alpaca paper account to place trades",
  onCancel,
  onConnect,
  connecting = false,
}: AlpacaConnectModalProps) {
  const [mounted, setMounted] = useState(false);
  const [showDisclosure, setShowDisclosure] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[60] flex animate-fade-in items-center justify-center bg-bg/80 backdrop-blur-sm px-4">
      <div className="relative w-full max-w-sm rounded-xl border border-border bg-panel p-5 shadow-xl">
        <button
          type="button"
          onClick={onCancel}
          aria-label="Close"
          className="absolute right-3 top-3 rounded-md p-1 text-muted hover:text-fg"
        >
          <X size={22} strokeWidth={2} />
        </button>

        <div className="flex flex-col items-center text-center">
          <Image src="/alpaca-icon.png" alt="Alpaca" width={40} height={40} className="rounded-md" />
          <h3 className="mt-3 text-base font-semibold text-fg">{title}</h3>
          <p className="mt-1 text-xs text-muted">{subtitle}</p>

          <button
            type="button"
            onClick={onConnect}
            disabled={connecting}
            className="mt-4 w-full rounded-md bg-violet-500/20 py-2 text-sm font-medium text-violet-600 hover:bg-violet-500/30 disabled:opacity-50 dark:text-violet-400"
          >
            {connecting ? "Redirecting..." : "Connect"}
          </button>
        </div>

        <button
          type="button"
          onClick={() => setShowDisclosure((v) => !v)}
          className="mt-3 flex w-full items-center justify-center gap-1 text-[11px] text-muted hover:text-fg"
        >
          Trading disclosure
          <ChevronDown
            size={12}
            strokeWidth={2}
            className={`transition-transform ${showDisclosure ? "rotate-180" : ""}`}
          />
        </button>

        {showDisclosure && (
          <p className="mt-2 text-[11px] leading-relaxed text-muted">
            By allowing Erwix to access your Alpaca account, you are granting Erwix access to your account
            information and authorization to place transactions in your account at your direction. Alpaca does
            not warrant or guarantee that Erwix will work as advertised or expected. Before authorizing, learn
            more about Erwix.
          </p>
        )}
      </div>
    </div>,
    document.body,
  );
}

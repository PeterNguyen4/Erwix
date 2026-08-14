"use client";

import { ArrowDown } from "lucide-react";

interface ScrollToBottomButtonProps {
  onClick: () => void;
  className?: string;
}

export default function ScrollToBottomButton({ onClick, className = "" }: ScrollToBottomButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Scroll to bottom"
      className={`flex h-8 w-8 items-center justify-center rounded-full border border-border bg-panel text-muted shadow-md transition-colors hover:border-accent hover:text-accent ${className}`}
    >
      <ArrowDown size={15} strokeWidth={2.25} />
    </button>
  );
}

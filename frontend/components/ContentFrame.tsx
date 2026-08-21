"use client";

import { useShowSidebar } from "@/components/ConditionalSidebar";

export default function ContentFrame({ children }: { children: React.ReactNode }) {
  const showSidebar = useShowSidebar();
  return (
    <div
      className={`flex flex-col flex-1 min-w-0 min-h-0 overflow-hidden ${
        showSidebar ? "pb-16 md:pb-0" : ""
      }`}
    >
      {children}
    </div>
  );
}

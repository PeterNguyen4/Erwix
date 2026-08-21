"use client";

import { usePathname } from "next/navigation";
import Sidebar from "@/components/Sidebar";

const AUTH_PATHS = ["/login", "/onboarding"];

export function useShowSidebar() {
  const pathname = usePathname();
  return !AUTH_PATHS.some((p) => pathname.startsWith(p));
}

export default function ConditionalSidebar() {
  const showSidebar = useShowSidebar();
  if (!showSidebar) return null;
  return <Sidebar />;
}

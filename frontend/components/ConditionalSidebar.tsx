"use client";

import { usePathname } from "next/navigation";
import Sidebar from "@/components/Sidebar";

const AUTH_PATHS = ["/login"];

export default function ConditionalSidebar() {
  const pathname = usePathname();
  if (AUTH_PATHS.some((p) => pathname.startsWith(p))) return null;
  return <Sidebar />;
}

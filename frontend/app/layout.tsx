import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "@/components/Sidebar";

export const metadata: Metadata = {
  title: "Entro",
  description: "Multi-agent trading system",
  icons: {
    icon: "/entro.svg",
    shortcut: "/entro.svg",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/entro.svg" />
      </head>
      <body className="flex h-screen" suppressHydrationWarning>
        <Sidebar />
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
          {children}
        </div>
      </body>
    </html>
  );
}

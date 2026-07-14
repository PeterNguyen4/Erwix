import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";
import ConditionalSidebar from "@/components/ConditionalSidebar";
import AuthBridge from "@/components/AuthBridge";

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
    <ClerkProvider>
      <html lang="en">
        <head>
          <link rel="icon" href="/entro.svg" />
        </head>
        <body className="flex h-screen" suppressHydrationWarning>
          <AuthBridge />
          <ConditionalSidebar />
          <div className="flex flex-col flex-1 min-w-0 min-h-0 overflow-hidden">
            {children}
          </div>
        </body>
      </html>
    </ClerkProvider>
  );
}

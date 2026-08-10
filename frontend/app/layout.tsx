import type { Metadata } from "next";
import "./globals.css";
import ConditionalSidebar from "@/components/ConditionalSidebar";
import AuthProvider from "@/components/AuthProvider";
import { ThemeProvider } from "@/components/ThemeProvider";

const THEME_INIT_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem("erwix-theme");
    var theme = stored === "dark" || stored === "light"
      ? stored
      : (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
    document.documentElement.dataset.theme = theme;
  } catch (e) {}
})();
`;

export const metadata: Metadata = {
  title: "Erwix",
  description: "Multi-agent trading system",
  icons: {
    icon: "/erwix.svg",
    shortcut: "/erwix.svg",
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
        <link rel="icon" href="/erwix.svg" />
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="flex h-screen" suppressHydrationWarning>
        <ThemeProvider>
          <AuthProvider>
            <ConditionalSidebar />
            <div className="flex flex-col flex-1 min-w-0 min-h-0 overflow-hidden">
              {children}
            </div>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

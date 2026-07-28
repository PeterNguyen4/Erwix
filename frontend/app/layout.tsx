import type { Metadata } from "next";
import "./globals.css";
import ConditionalSidebar from "@/components/ConditionalSidebar";
import AuthProvider from "@/components/AuthProvider";
import { ThemeProvider } from "@/components/ThemeProvider";

const THEME_INIT_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem("entro-theme");
    var theme = stored === "dark" || stored === "light"
      ? stored
      : (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
    document.documentElement.dataset.theme = theme;
  } catch (e) {}
})();
`;

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

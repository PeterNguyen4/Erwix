import type { Metadata, Viewport } from "next";
import "./globals.css";
import ConditionalSidebar from "@/components/ConditionalSidebar";
import ContentFrame from "@/components/ContentFrame";
import AuthProvider from "@/components/AuthProvider";
import { ThemeProvider } from "@/components/ThemeProvider";
import TitleTooltip from "@/components/TitleTooltip";

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

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
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
      <body className="flex flex-col md:flex-row h-screen" suppressHydrationWarning>
        <ThemeProvider>
          <AuthProvider>
            <ConditionalSidebar />
            <ContentFrame>{children}</ContentFrame>
            <TitleTooltip />
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

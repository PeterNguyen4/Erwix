import type { Metadata } from "next";
import "./globals.css";

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
      <body>{children}</body>
    </html>
  );
}

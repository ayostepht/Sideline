import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Inter } from "next/font/google";
import { ThemeProvider } from "../components/theme-provider";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: "Sideline",
  description: "A self-hosted fantasy football analyzer for Sleeper leagues.",
  applicationName: "Sideline",
  appleWebApp: {
    capable: true,
    title: "Sideline",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // A single static value, not a media-query list: the OS/browser color-scheme
  // preference alone can't reflect a manual in-app theme override. The actual
  // value is kept in sync with the app's resolved theme at runtime by
  // `ThemeColorSync` (see `components/theme-color-sync.tsx`), which updates
  // this same meta tag's `content` on mount and whenever the theme changes.
  // "#2a2a2a" (dark) is the safe default before hydration since the manifest
  // and OS chrome otherwise default to it too.
  themeColor: "#2a2a2a",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={inter.variable}>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}

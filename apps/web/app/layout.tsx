import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";

import { AppServiceWorker } from "@/components/AppServiceWorker";
import { GameRepositoryProvider } from "@/lib/gameRepositoryContext";

import type { Metadata, Viewport } from "next";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Flip 7 Scorekeeper",
  description: "A local-first scorekeeper for Flip 7.",
  appleWebApp: {
    capable: true,
    title: "Flip 7",
    statusBarStyle: "black-translucent",
    startupImage: [
      {
        url: "/splash/iphone-se",
        media:
          "(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)",
      },
      {
        url: "/splash/iphone",
        media:
          "(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)",
      },
      {
        url: "/splash/iphone-pro-max",
        media:
          "(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)",
      },
      {
        url: "/splash/ipad",
        media:
          "(device-width: 768px) and (device-height: 1024px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)",
      },
      {
        url: "/splash/ipad-pro-11",
        media:
          "(device-width: 834px) and (device-height: 1194px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)",
      },
    ],
  },
};

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#0a0a0c",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <GameRepositoryProvider>
          <AppServiceWorker />
          <header className="flex items-center justify-between border-b border-border px-4 py-3">
            <Link href="/" className="text-lg font-semibold tracking-tight">
              Flip 7 Scorekeeper
            </Link>
            <div className="flex items-center gap-4">
              <Link href="/stats">Stats</Link>
              <Link href="/settings">Settings</Link>
            </div>
          </header>
          <main className="flex flex-1 flex-col">{children}</main>
        </GameRepositoryProvider>
      </body>
    </html>
  );
}

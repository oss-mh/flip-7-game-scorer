import { Geist, Geist_Mono } from "next/font/google";

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
          <header className="border-b border-border px-4 py-3">
            <span className="text-lg font-semibold tracking-tight">Flip 7 Scorekeeper</span>
          </header>
          <main className="flex flex-1 flex-col">{children}</main>
        </GameRepositoryProvider>
      </body>
    </html>
  );
}

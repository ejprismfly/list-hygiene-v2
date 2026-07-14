import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";

import { ThemeToggle } from "@/components/app/theme-toggle";

import "./globals.css";

export const metadata: Metadata = {
  title: "List Hygiene",
  description: "List Hygiene v2",
  icons: {
    icon: "/favicon.ico",
  },
};

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const themeScript = `
  try {
    const theme = localStorage.getItem("list-hygiene-theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    if (theme === "dark" || (!theme && prefersDark)) {
      document.documentElement.classList.add("dark");
    }
  } catch {}
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head />
      <body className="min-h-full flex flex-col font-sans">
        <Script
          id="list-hygiene-theme"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: themeScript }}
        />
        <div className="fixed right-4 bottom-4 z-50">
          <ThemeToggle />
        </div>
        {children}
      </body>
    </html>
  );
}

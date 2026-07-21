import type { Metadata } from "next";
import Script from "next/script";

import { GoogleTagManager } from "@/components/app/google-tag-manager";

import "./globals.css";

export const metadata: Metadata = {
  title: "List Hygiene",
  description: "List Hygiene v2",
  icons: {
    icon: "/favicon.ico",
  },
};

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
      className="h-full antialiased"
      suppressHydrationWarning
    >
      <head />
      <body className="min-h-full flex flex-col font-sans">
        <Script
          id="list-hygiene-theme"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: themeScript }}
        />
        <GoogleTagManager />
        {children}
      </body>
    </html>
  );
}

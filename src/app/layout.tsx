import type { Metadata } from "next";
import Script from "next/script";
import "@fontsource-variable/inter";

import { AuthEventTracker } from "@/components/app/auth-event-tracker";
import { GoogleAnalyticsTag } from "@/components/app/google-analytics-tag";
import {
  GoogleTagManager,
  GoogleTagManagerNoScript,
} from "@/components/app/google-tag-manager";
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
      className="h-full font-sans antialiased"
      suppressHydrationWarning
    >
      <head>
        <GoogleTagManager />
      </head>
      <body className="min-h-full flex flex-col font-sans">
        <GoogleTagManagerNoScript />
        <GoogleAnalyticsTag />
        <Script
          id="list-hygiene-theme"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: themeScript }}
        />
        <AuthEventTracker />
        {children}
      </body>
    </html>
  );
}

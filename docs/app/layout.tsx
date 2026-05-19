import type { Metadata } from "next";
import type { ReactNode } from "react";
import { NotifyKitProvider } from "@notifykitjs/react";
import { SideNav } from "./_components/side-nav";
import { CopyButtonScript } from "./_components/copy-button-script";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "NotifyKit — App-native notifications for TypeScript",
    template: "%s — NotifyKit Docs",
  },
  description:
    "Define notifications in code. Store state in your own database. Ship inbox, email, preferences, and signed unsubscribes without running a notification platform.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Tomorrow:wght@400;500&family=Geist:wght@300;400;450;500;600&family=Geist+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <NotifyKitProvider options={{ baseUrl: "/api/notifykit" }}>
          <div className="docs-shell">
            <SideNav />
            <main className="docs-content">{children}</main>
          </div>
        </NotifyKitProvider>
        <CopyButtonScript />
      </body>
    </html>
  );
}

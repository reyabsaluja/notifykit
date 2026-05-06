import type { Metadata } from "next";
import type { ReactNode } from "react";
import { NotifyKitProvider } from "notifykit-react";
import { SideNav } from "./_components/side-nav";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "NotifyKit — app-native notifications for TypeScript",
    template: "%s — NotifyKit",
  },
  description:
    "Define notifications in code. Store state in your own database. Ship inbox, email, preferences, and signed unsubscribes without running a notification platform.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <NotifyKitProvider options={{ baseUrl: "/api/notifykit" }}>
          <div className="docs-shell">
            <SideNav />
            <main className="docs-content">{children}</main>
          </div>
        </NotifyKitProvider>
      </body>
    </html>
  );
}

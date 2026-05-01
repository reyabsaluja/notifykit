import type { Metadata } from "next";
import type { ReactNode } from "react";
import { NotifyKitProvider } from "notifykit-react";

export const metadata: Metadata = {
  title: "NotifyKit starter",
  description: "App-native notifications for your Next.js app",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          maxWidth: "48rem",
          margin: "2rem auto",
          padding: "0 1rem",
          lineHeight: 1.5,
        }}
      >
        <NotifyKitProvider options={{ baseUrl: "/api/notifykit" }}>
          {children}
        </NotifyKitProvider>
      </body>
    </html>
  );
}

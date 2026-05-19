"use client";

import { NotifyKitProvider } from "@notifykitjs/react";
import type { ReactNode } from "react";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <NotifyKitProvider options={{ baseUrl: "/api/notifykit" }}>
      {children}
    </NotifyKitProvider>
  );
}

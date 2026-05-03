"use client";

import { createContext, useContext, useRef, type ReactNode } from "react";
import {
  createNotifyKitClient,
  type CreateNotifyKitClientOptions,
  type NotifyKitClient,
} from "./client.js";

const NotifyKitContext = createContext<NotifyKitClient | null>(null);

export type NotifyKitProviderProps = {
  /** Pre-built client instance. Takes precedence over `options`. */
  client?: NotifyKitClient;
  /**
   * Options for creating a client. The client is created once on mount;
   * subsequent option changes are ignored. Ensure `fetch` and callback
   * props are stable references.
   */
  options?: CreateNotifyKitClientOptions;
  children: ReactNode;
};

export function NotifyKitProvider({
  client,
  options,
  children,
}: NotifyKitProviderProps) {
  const clientRef = useRef<NotifyKitClient | null>(client ?? null);
  if (!clientRef.current) {
    clientRef.current = createNotifyKitClient(options);
  }
  return (
    <NotifyKitContext.Provider value={clientRef.current}>
      {children}
    </NotifyKitContext.Provider>
  );
}

export function useNotifyKitClient(): NotifyKitClient {
  const client = useContext(NotifyKitContext);
  if (!client) {
    throw new Error(
      "useNotifyKitClient: must be used inside <NotifyKitProvider>.",
    );
  }
  return client;
}

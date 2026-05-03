"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import {
  createNotifyKitClient,
  type CreateNotifyKitClientOptions,
  type NotifyKitClient,
} from "./client.js";

const NotifyKitContext = createContext<NotifyKitClient | null>(null);

export type NotifyKitProviderProps = {
  client?: NotifyKitClient;
  options?: CreateNotifyKitClientOptions;
  children: ReactNode;
};

export function NotifyKitProvider({
  client,
  options,
  children,
}: NotifyKitProviderProps) {
  const optionsKey = client ? null : JSON.stringify(options);
  const resolved = useMemo(
    () => client ?? createNotifyKitClient(options),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [client, optionsKey],
  );
  return (
    <NotifyKitContext.Provider value={resolved}>
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

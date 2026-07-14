"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import type {
  ChannelType,
  ChannelPreferenceMap,
  InboxItem,
  RecipientPreference,
} from "@notifykitjs/core";
import type { ClientState, ClientStatus, RealtimeStatus } from "./client.js";
import { getClientSnapshot } from "./store.js";
import { useNotifyKitClient } from "./provider.js";

function useClientState<T>(select: (state: ClientState) => T): T {
  const client = useNotifyKitClient();
  return useSyncExternalStore(
    client.subscribe,
    () => select(getClientSnapshot(client)),
    () => select(getClientSnapshot(client)),
  );
}

export type UseInboxResult = {
  items: InboxItem[];
  status: ClientStatus;
  error: string | null;
  unreadCount: number;
  realtimeStatus: RealtimeStatus;
  refresh(): Promise<InboxItem[]>;
  markRead(inboxItemId: string): Promise<InboxItem | null>;
  markAllRead(): Promise<number>;
  archive(inboxItemId: string): Promise<InboxItem | null>;
  unarchive(inboxItemId: string): Promise<InboxItem | null>;
  deleteItem(inboxItemId: string): Promise<void>;
};

export function useInbox(options: { autoLoad?: boolean } = {}): UseInboxResult {
  const client = useNotifyKitClient();
  const items = useClientState((s) => s.inbox.items);
  const status = useClientState((s) => s.inbox.status);
  const error = useClientState((s) => s.inbox.error);

  const autoLoad = options.autoLoad ?? true;

  useEffect(() => {
    if (!autoLoad) return;
    if (status === "idle") {
      void client.inbox.list();
    }
  }, [autoLoad, client, status]);

  useEffect(() => {
    client.connect();
    return () => client.disconnect();
  }, [client]);

  const realtimeStatus = useSyncExternalStore(
    client.subscribe,
    () => client.realtimeStatus(),
    () => "disconnected" as RealtimeStatus,
  );

  const refresh = useCallback(() => client.inbox.list(), [client]);
  const markRead = useCallback(
    (id: string) => client.inbox.markRead(id),
    [client],
  );
  const markAllRead = useCallback(() => client.inbox.markAllRead(), [client]);
  const archive = useCallback(
    (id: string) => client.inbox.archive(id),
    [client],
  );
  const unarchive = useCallback(
    (id: string) => client.inbox.unarchive(id),
    [client],
  );
  const deleteItem = useCallback(
    (id: string) => client.inbox.deleteItem(id),
    [client],
  );

  const unreadCount = useClientState((s) => s.inbox.unreadCount);

  return {
    items, status, error, unreadCount, realtimeStatus, refresh,
    markRead, markAllRead, archive, unarchive, deleteItem,
  };
}

export type UsePreferencesResult = {
  items: RecipientPreference[];
  status: ClientStatus;
  error: string | null;
  refresh(): Promise<RecipientPreference[]>;
  update(input: {
    notificationId: string;
    channels: ChannelPreferenceMap;
  }): Promise<RecipientPreference>;
  isEnabled(notificationId: string, channel: ChannelType): boolean;
};

export function usePreferences(
  options: { autoLoad?: boolean } = {},
): UsePreferencesResult {
  const client = useNotifyKitClient();
  const items = useClientState((s) => s.preferences.items);
  const status = useClientState((s) => s.preferences.status);
  const error = useClientState((s) => s.preferences.error);

  const autoLoad = options.autoLoad ?? true;

  useEffect(() => {
    if (!autoLoad) return;
    if (status === "idle") {
      void client.preferences.list();
    }
  }, [autoLoad, client, status]);

  const refresh = useCallback(() => client.preferences.list(), [client]);
  const update = useCallback(
    (input: { notificationId: string; channels: ChannelPreferenceMap }) =>
      client.preferences.update(input),
    [client],
  );

  const isEnabled = useCallback(
    (notificationId: string, channel: ChannelType) => {
      const pref = items.find((p) => p.notificationId === notificationId);
      if (!pref) return true;
      return pref.channels[channel] !== false;
    },
    [items],
  );

  return { items, status, error, refresh, update, isEnabled };
}

"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useSyncExternalStore,
} from "react";
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
  /** Alias for `markRead`, matching common UI terminology. */
  markAsRead(inboxItemId: string): Promise<InboxItem | null>;
  markAllRead(): Promise<number>;
  archive(inboxItemId: string): Promise<InboxItem | null>;
  unarchive(inboxItemId: string): Promise<InboxItem | null>;
  deleteItem(inboxItemId: string): Promise<void>;
  /** Alias for `deleteItem`. */
  delete(inboxItemId: string): Promise<void>;
};

export type UseInboxOptions = {
  autoLoad?: boolean;
  /** Re-fetch the inbox on this interval. `false` disables polling. */
  pollInterval?: number | false;
  /** Called when a refresh or realtime event adds inbox items. */
  onNewItems?: (items: InboxItem[]) => void;
};

export function useInbox(options: UseInboxOptions = {}): UseInboxResult {
  const client = useNotifyKitClient();
  const items = useClientState((s) => s.inbox.items);
  const status = useClientState((s) => s.inbox.status);
  const error = useClientState((s) => s.inbox.error);

  const autoLoad = options.autoLoad ?? true;
  const pollInterval = options.pollInterval ?? false;
  const pollingIntervalMs =
    pollInterval !== false &&
    Number.isFinite(pollInterval) &&
    pollInterval > 0
      ? pollInterval
      : null;
  const onNewItemsRef = useRef(options.onNewItems);
  const knownItemIdsRef = useRef<Set<string> | null>(null);

  useEffect(() => {
    onNewItemsRef.current = options.onNewItems;
  }, [options.onNewItems]);

  useEffect(() => {
    if (!autoLoad) return;
    if (status === "idle") {
      void client.inbox.list();
    }
  }, [autoLoad, client, status]);

  useEffect(() => {
    if (pollingIntervalMs !== null) return;
    client.connect();
    return () => client.disconnect();
  }, [client, pollingIntervalMs]);

  useEffect(() => {
    if (pollingIntervalMs === null) return;
    const timer = setInterval(() => {
      void client.inbox.list().catch(() => undefined);
    }, pollingIntervalMs);
    return () => clearInterval(timer);
  }, [client, pollingIntervalMs]);

  useEffect(() => {
    if (status !== "ready") return;
    const currentIds = new Set(items.map((item) => item.id));
    const knownIds = knownItemIdsRef.current;
    knownItemIdsRef.current = currentIds;
    if (knownIds === null) return;
    const added = items.filter((item) => !knownIds.has(item.id));
    if (added.length > 0) onNewItemsRef.current?.(added);
  }, [items, status]);

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
    markRead, markAsRead: markRead, markAllRead, archive, unarchive,
    deleteItem, delete: deleteItem,
  };
}

export type UseUnreadCountResult = {
  unreadCount: number;
  status: ClientStatus;
  error: string | null;
  refresh(): Promise<number>;
};

export type UseUnreadCountOptions = {
  autoLoad?: boolean;
  /** Re-fetch the unread count on this interval. `false` disables polling. */
  pollInterval?: number | false;
};

/** Fetch only the unread count without loading full inbox items. */
export function useUnreadCount(
  options: UseUnreadCountOptions = {},
): UseUnreadCountResult {
  const client = useNotifyKitClient();
  const unreadCount = useClientState((s) => s.inbox.unreadCount);
  const status = useClientState((s) => s.inbox.status);
  const error = useClientState((s) => s.inbox.error);
  const autoLoad = options.autoLoad ?? true;
  const pollInterval = options.pollInterval ?? false;
  const pollingIntervalMs =
    pollInterval !== false &&
    Number.isFinite(pollInterval) &&
    pollInterval > 0
      ? pollInterval
      : null;

  useEffect(() => {
    if (autoLoad && status === "idle") {
      void client.inbox.unreadCount().catch(() => undefined);
    }
  }, [autoLoad, client, status]);

  useEffect(() => {
    if (pollingIntervalMs !== null) return;
    client.connect();
    return () => client.disconnect();
  }, [client, pollingIntervalMs]);

  useEffect(() => {
    if (pollingIntervalMs === null) return;
    const timer = setInterval(() => {
      void client.inbox.unreadCount().catch(() => undefined);
    }, pollingIntervalMs);
    return () => clearInterval(timer);
  }, [client, pollingIntervalMs]);

  const refresh = useCallback(() => client.inbox.unreadCount(), [client]);

  return { unreadCount, status, error, refresh };
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

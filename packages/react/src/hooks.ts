"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import type {
  ChannelPreferenceMap,
  InboxItem,
  RecipientPreference,
} from "notifykit";
import type { ClientState, ClientStatus } from "./client.js";
import { useNotifyKitClient } from "./provider.js";

function useClientState<T>(select: (state: ClientState) => T): T {
  const client = useNotifyKitClient();
  return useSyncExternalStore(
    client.subscribe,
    () => select(client.getState()),
    () => select(client.getState()),
  );
}

export type UseInboxResult = {
  items: InboxItem[];
  status: ClientStatus;
  error: string | null;
  unreadCount: number;
  refresh(): Promise<InboxItem[]>;
  markRead(inboxItemId: string): Promise<InboxItem | null>;
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

  const refresh = useCallback(() => client.inbox.list(), [client]);
  const markRead = useCallback(
    (id: string) => client.inbox.markRead(id),
    [client],
  );

  const unreadCount = items.reduce(
    (count, item) => (item.readAt ? count : count + 1),
    0,
  );

  return { items, status, error, unreadCount, refresh, markRead };
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
  isEnabled(notificationId: string, channel: "inbox" | "email"): boolean;
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
    (notificationId: string, channel: "inbox" | "email") => {
      const pref = items.find((p) => p.notificationId === notificationId);
      if (!pref) return true;
      return pref.channels[channel] !== false;
    },
    [items],
  );

  return { items, status, error, refresh, update, isEnabled };
}

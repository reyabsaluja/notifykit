"use client";
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { useNotifyKitClient } from "./provider.js";
function useClientState(select) {
    const client = useNotifyKitClient();
    return useSyncExternalStore(client.subscribe, () => select(client.getState()), () => select(client.getState()));
}
export function useInbox(options = {}) {
    const client = useNotifyKitClient();
    const items = useClientState((s) => s.inbox.items);
    const status = useClientState((s) => s.inbox.status);
    const error = useClientState((s) => s.inbox.error);
    const autoLoad = options.autoLoad ?? true;
    useEffect(() => {
        if (!autoLoad)
            return;
        if (status === "idle") {
            void client.inbox.list();
        }
    }, [autoLoad, client, status]);
    const refresh = useCallback(() => client.inbox.list(), [client]);
    const markRead = useCallback((id) => client.inbox.markRead(id), [client]);
    const unreadCount = items.reduce((count, item) => (item.readAt ? count : count + 1), 0);
    return { items, status, error, unreadCount, refresh, markRead };
}
export function usePreferences(options = {}) {
    const client = useNotifyKitClient();
    const items = useClientState((s) => s.preferences.items);
    const status = useClientState((s) => s.preferences.status);
    const error = useClientState((s) => s.preferences.error);
    const autoLoad = options.autoLoad ?? true;
    useEffect(() => {
        if (!autoLoad)
            return;
        if (status === "idle") {
            void client.preferences.list();
        }
    }, [autoLoad, client, status]);
    const refresh = useCallback(() => client.preferences.list(), [client]);
    const update = useCallback((input) => client.preferences.update(input), [client]);
    const isEnabled = useCallback((notificationId, channel) => {
        const pref = items.find((p) => p.notificationId === notificationId);
        if (!pref)
            return true;
        return pref.channels[channel] !== false;
    }, [items]);
    return { items, status, error, refresh, update, isEnabled };
}
//# sourceMappingURL=hooks.js.map
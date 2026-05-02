import type { ChannelPreferenceMap, InboxItem, RecipientPreference } from "notifykit";
export type ClientStatus = "idle" | "loading" | "ready" | "error";
export type NotificationMetadata = {
    id: string;
    channels: string[];
    payload: Record<string, string>;
    description?: string;
    category?: string;
    version?: number;
};
export type ClientState = {
    inbox: {
        items: InboxItem[];
        unreadCount: number;
        status: ClientStatus;
        error: string | null;
    };
    preferences: {
        items: RecipientPreference[];
        status: ClientStatus;
        error: string | null;
    };
};
export type CreateNotifyKitClientOptions = {
    /**
     * URL prefix where the NotifyKit handler is mounted.
     * Defaults to "/api/notifykit".
     */
    baseUrl?: string;
    /**
     * Custom fetch implementation. Useful for SSR, testing, or
     * injecting auth headers. Defaults to globalThis.fetch.
     */
    fetch?: typeof fetch;
    /**
     * Passed to every request. Defaults to "same-origin".
     */
    credentials?: RequestCredentials;
    /**
     * Extra headers merged into every request.
     */
    headers?: Record<string, string>;
    /**
     * Enable realtime updates via SSE. When `true`, calling `connect()`
     * opens an EventSource to `/inbox/stream` and merges events into state.
     */
    realtime?: boolean;
};
export type RealtimeStatus = "disconnected" | "connecting" | "connected";
export type NotifyKitClient = {
    getState(): ClientState;
    subscribe(listener: () => void): () => void;
    /**
     * Open an SSE connection to receive live inbox updates. No-op if already
     * connected or if `realtime` was not enabled in options. The connection
     * auto-reconnects on failure via EventSource semantics.
     */
    connect(): void;
    /** Close the SSE connection. Safe to call when already disconnected. */
    disconnect(): void;
    /** Current SSE connection status. */
    realtimeStatus(): RealtimeStatus;
    inbox: {
        list(options?: {
            archived?: boolean;
        }): Promise<InboxItem[]>;
        markRead(inboxItemId: string): Promise<InboxItem | null>;
        unreadCount(): Promise<number>;
        markAllRead(): Promise<number>;
        archive(inboxItemId: string): Promise<InboxItem | null>;
        unarchive(inboxItemId: string): Promise<InboxItem | null>;
        deleteItem(inboxItemId: string): Promise<void>;
    };
    preferences: {
        list(): Promise<RecipientPreference[]>;
        update(input: {
            notificationId: string;
            channels: ChannelPreferenceMap;
        }): Promise<RecipientPreference>;
    };
    notifications: {
        list(): Promise<NotificationMetadata[]>;
    };
};
export declare function createNotifyKitClient(options?: CreateNotifyKitClientOptions): NotifyKitClient;
//# sourceMappingURL=client.d.ts.map
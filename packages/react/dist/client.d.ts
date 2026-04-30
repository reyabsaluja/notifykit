import type { ChannelPreferenceMap, InboxItem, RecipientPreference } from "notifykit";
export type ClientStatus = "idle" | "loading" | "ready" | "error";
export type NotificationMetadata = {
    id: string;
    channels: string[];
    payload: Record<string, string>;
};
export type ClientState = {
    inbox: {
        items: InboxItem[];
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
};
export type NotifyKitClient = {
    getState(): ClientState;
    subscribe(listener: () => void): () => void;
    inbox: {
        list(): Promise<InboxItem[]>;
        markRead(inboxItemId: string): Promise<InboxItem | null>;
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
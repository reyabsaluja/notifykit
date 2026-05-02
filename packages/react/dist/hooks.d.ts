import type { ChannelPreferenceMap, InboxItem, RecipientPreference } from "notifykit";
import type { ClientStatus } from "./client.js";
export type UseInboxResult = {
    items: InboxItem[];
    status: ClientStatus;
    error: string | null;
    unreadCount: number;
    refresh(): Promise<InboxItem[]>;
    markRead(inboxItemId: string): Promise<InboxItem | null>;
    markAllRead(): Promise<number>;
    archive(inboxItemId: string): Promise<InboxItem | null>;
    unarchive(inboxItemId: string): Promise<InboxItem | null>;
    deleteItem(inboxItemId: string): Promise<void>;
};
export declare function useInbox(options?: {
    autoLoad?: boolean;
}): UseInboxResult;
export type UsePreferencesResult = {
    items: RecipientPreference[];
    status: ClientStatus;
    error: string | null;
    refresh(): Promise<RecipientPreference[]>;
    update(input: {
        notificationId: string;
        channels: ChannelPreferenceMap;
    }): Promise<RecipientPreference>;
    isEnabled(notificationId: string, channel: "inbox" | "email" | "webhook"): boolean;
};
export declare function usePreferences(options?: {
    autoLoad?: boolean;
}): UsePreferencesResult;
//# sourceMappingURL=hooks.d.ts.map
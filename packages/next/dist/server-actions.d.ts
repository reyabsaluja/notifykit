import type { InboxDeleteForRecipientResult, InboxItem, InboxItemForRecipientResult, InboxListFilter, MarkReadForRecipientResult, NotificationDefinition, NotifyKit, PayloadSchema, RecipientPreference, SecurityScope, UpdatePreferenceInput } from "notifykit";
export type ServerActionsIdentity = SecurityScope & {
    recipientId: string;
};
export type ServerActionsOptions<T extends readonly NotificationDefinition<string, PayloadSchema>[]> = {
    notifykit: NotifyKit<T>;
    identify: () => Promise<string | ServerActionsIdentity> | string | ServerActionsIdentity;
};
export type NotifyKitServerActions<T extends readonly NotificationDefinition<string, PayloadSchema>[]> = {
    getPreferences: () => Promise<RecipientPreference[]>;
    updatePreference: (input: Omit<UpdatePreferenceInput<T>, "recipientId" | "tenantId" | "workspaceId">) => Promise<RecipientPreference>;
    inbox: {
        list: (filter?: InboxListFilter) => Promise<InboxItem[]>;
        unreadCount: () => Promise<number>;
        markRead: (inboxItemId: string) => Promise<MarkReadForRecipientResult>;
        markAllRead: () => Promise<number>;
        archive: (inboxItemId: string) => Promise<InboxItemForRecipientResult>;
        unarchive: (inboxItemId: string) => Promise<InboxItemForRecipientResult>;
        deleteItem: (inboxItemId: string) => Promise<InboxDeleteForRecipientResult>;
    };
};
export declare function createServerActions<T extends readonly NotificationDefinition<string, PayloadSchema>[]>(options: ServerActionsOptions<T>): NotifyKitServerActions<T>;
//# sourceMappingURL=server-actions.d.ts.map
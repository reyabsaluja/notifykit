import type { DatabaseAdapter, DeliveryRecord, EmailProvider, Hooks, InboxItem, NotificationDefinition, NotificationRecord, PayloadSchema, Recipient, SendInput, UpsertRecipientInput } from "./types.js";
export type CreateNotifyKitInput<T extends readonly NotificationDefinition<string, PayloadSchema>[]> = {
    notifications: T;
    database: DatabaseAdapter;
    providers?: {
        email?: EmailProvider;
    };
    on?: Hooks;
};
export type NotifyKit<T extends readonly NotificationDefinition<string, PayloadSchema>[]> = {
    upsertRecipient(input: UpsertRecipientInput): Promise<Recipient>;
    send(input: SendInput<T>): Promise<{
        notification: NotificationRecord;
        inboxItems: InboxItem[];
        deliveries: DeliveryRecord[];
    }>;
    inbox: {
        list(recipientId: string): Promise<InboxItem[]>;
        markRead(inboxItemId: string): Promise<InboxItem | null>;
    };
    deliveries: {
        list(recipientId?: string): Promise<DeliveryRecord[]>;
    };
};
export declare function createNotifyKit<const T extends readonly NotificationDefinition<string, PayloadSchema>[]>(config: CreateNotifyKitInput<T>): NotifyKit<T>;
//# sourceMappingURL=create-notifykit.d.ts.map
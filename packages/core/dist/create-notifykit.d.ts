import type { ChannelType, DatabaseAdapter, DeliveryRecord, EmailProvider, GetPreferenceInput, Hooks, InboxItem, NotificationDefinition, NotificationRecord, PayloadSchema, Recipient, RecipientPreference, SendInput, UpdatePreferenceInput, UpsertRecipientInput } from "./types.js";
export type CreateNotifyKitInput<T extends readonly NotificationDefinition<string, PayloadSchema>[]> = {
    notifications: T;
    database: DatabaseAdapter;
    providers?: {
        email?: EmailProvider;
    };
    on?: Hooks;
};
export type SendResult = {
    notification: NotificationRecord;
    inboxItems: InboxItem[];
    deliveries: DeliveryRecord[];
    skippedChannels: ChannelType[];
};
export type NotifyKit<T extends readonly NotificationDefinition<string, PayloadSchema>[]> = {
    upsertRecipient(input: UpsertRecipientInput): Promise<Recipient>;
    send(input: SendInput<T>): Promise<SendResult>;
    inbox: {
        list(recipientId: string): Promise<InboxItem[]>;
        markRead(inboxItemId: string): Promise<InboxItem | null>;
    };
    deliveries: {
        list(recipientId?: string): Promise<DeliveryRecord[]>;
    };
    preferences: {
        get(input: GetPreferenceInput<T>): Promise<RecipientPreference | null>;
        list(recipientId: string): Promise<RecipientPreference[]>;
        update(input: UpdatePreferenceInput<T>): Promise<RecipientPreference>;
    };
};
export declare function createNotifyKit<const T extends readonly NotificationDefinition<string, PayloadSchema>[]>(config: CreateNotifyKitInput<T>): NotifyKit<T>;
//# sourceMappingURL=create-notifykit.d.ts.map
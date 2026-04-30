import type { ChannelType, DatabaseAdapter, DeliveryRecord, EmailProvider, GetPreferenceInput, Hooks, InboxItem, NotificationDefinition, NotificationRecord, PayloadSchema, Queue, Recipient, RecipientPreference, RetryPolicy, SendInput, UpdatePreferenceInput, UpsertRecipientInput } from "./types.js";
export type CreateNotifyKitInput<T extends readonly NotificationDefinition<string, PayloadSchema>[]> = {
    notifications: T;
    database: DatabaseAdapter;
    providers?: {
        email?: EmailProvider;
    };
    on?: Hooks;
    /**
     * Queue used to run email deliveries. Defaults to `inlineQueue()` — jobs
     * run synchronously inside `send()`. Pass `setTimeoutQueue()` (or your own)
     * to run deliveries asynchronously.
     */
    queue?: Queue;
    /** Retry policy for email deliveries. Defaults to 3 attempts with backoff. */
    retry?: Partial<RetryPolicy>;
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
    /** Resolves when the queue has finished all outstanding and retried jobs. */
    drain(): Promise<void>;
    /** Registered notification definitions. Read-only, for introspection. */
    readonly definitions: T;
};
export declare function createNotifyKit<const T extends readonly NotificationDefinition<string, PayloadSchema>[]>(config: CreateNotifyKitInput<T>): NotifyKit<T>;
//# sourceMappingURL=create-notifykit.d.ts.map
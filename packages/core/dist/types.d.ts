export type PrimitiveSchema = "string" | "number" | "boolean";
export type PayloadSchema = Record<string, PrimitiveSchema>;
export type InferSchema<S extends PayloadSchema> = {
    [K in keyof S]: S[K] extends "string" ? string : S[K] extends "number" ? number : S[K] extends "boolean" ? boolean : never;
};
export type InboxChannelConfig = {
    type: "inbox";
    title: string;
    body?: string;
    actionUrl?: string;
};
export type EmailChannelConfig = {
    type: "email";
    subject: string;
    body: string;
};
export type ChannelConfig = InboxChannelConfig | EmailChannelConfig;
export type NotificationDefinition<Id extends string = string, S extends PayloadSchema = PayloadSchema> = {
    id: Id;
    payload: S;
    channels: ChannelConfig[];
};
export type Recipient = {
    id: string;
    email?: string;
    name?: string;
    createdAt: Date;
    updatedAt: Date;
};
export type UpsertRecipientInput = {
    id: string;
    email?: string;
    name?: string;
};
export type NotificationRecord = {
    id: string;
    recipientId: string;
    notificationId: string;
    payload: Record<string, unknown>;
    createdAt: Date;
};
export type InboxItem = {
    id: string;
    notificationRecordId: string;
    recipientId: string;
    notificationId: string;
    title: string;
    body?: string;
    actionUrl?: string;
    readAt?: Date | null;
    createdAt: Date;
};
export type ChannelType = ChannelConfig["type"];
export type ChannelPreferenceMap = Partial<Record<ChannelType, boolean>>;
export type RecipientPreference = {
    recipientId: string;
    notificationId: string;
    channels: ChannelPreferenceMap;
    updatedAt: Date;
};
export type DeliveryStatus = "pending" | "sent" | "failed";
export type DeliveryRecord = {
    id: string;
    notificationRecordId: string;
    recipientId: string;
    notificationId: string;
    channel: "email";
    provider: string;
    status: DeliveryStatus;
    to?: string;
    subject?: string;
    body?: string;
    providerMessageId?: string;
    error?: string;
    attempts: number;
    createdAt: Date;
    updatedAt: Date;
    sentAt?: Date | null;
    failedAt?: Date | null;
};
export type EmailProvider = {
    id: string;
    send(input: {
        to: string;
        subject: string;
        body: string;
    }): Promise<{
        providerMessageId?: string;
    }>;
};
export type DeliveryJob = {
    deliveryId: string;
    notificationRecordId: string;
    recipientId: string;
    notificationId: string;
    channel: "email";
    provider: string;
    to: string;
    subject: string;
    body: string;
};
export type Queue = {
    enqueue(job: DeliveryJob, run: (job: DeliveryJob) => Promise<void>): void | Promise<void>;
    /** Resolves when all enqueued jobs (and their retries) have settled. */
    drain(): Promise<void>;
};
export type RetryPolicy = {
    /** Total attempts including the first. Defaults to 3. */
    maxAttempts: number;
    /**
     * Delay before the given attempt number (1-indexed). Return 0 or a negative
     * value to skip waiting. Defaults to exponential backoff: 0 / 250 / 1000 ms.
     */
    delayMs(attempt: number): number;
};
export type DatabaseAdapter = {
    recipients: {
        upsert(input: UpsertRecipientInput): Promise<Recipient>;
        findById(id: string): Promise<Recipient | null>;
    };
    notifications: {
        create(input: Omit<NotificationRecord, "id" | "createdAt">): Promise<NotificationRecord>;
    };
    inbox: {
        create(input: Omit<InboxItem, "id" | "createdAt" | "readAt">): Promise<InboxItem>;
        listByRecipient(recipientId: string): Promise<InboxItem[]>;
        markRead(inboxItemId: string): Promise<InboxItem | null>;
    };
    deliveries: {
        create(input: Omit<DeliveryRecord, "id" | "createdAt" | "updatedAt" | "attempts"> & {
            attempts?: number;
        }): Promise<DeliveryRecord>;
        findById(id: string): Promise<DeliveryRecord | null>;
        update(id: string, patch: Partial<Omit<DeliveryRecord, "id" | "createdAt">>): Promise<DeliveryRecord | null>;
        list(recipientId?: string): Promise<DeliveryRecord[]>;
    };
    preferences: {
        get(recipientId: string, notificationId: string): Promise<RecipientPreference | null>;
        list(recipientId: string): Promise<RecipientPreference[]>;
        upsert(input: {
            recipientId: string;
            notificationId: string;
            channels: ChannelPreferenceMap;
        }): Promise<RecipientPreference>;
    };
};
export type Hooks = {
    "notification.created"?: (ctx: {
        notification: NotificationRecord;
    }) => void | Promise<void>;
    "inbox.created"?: (ctx: {
        inboxItem: InboxItem;
    }) => void | Promise<void>;
    "delivery.sent"?: (ctx: {
        delivery: DeliveryRecord;
    }) => void | Promise<void>;
    "delivery.failed"?: (ctx: {
        delivery: DeliveryRecord;
        error: Error;
    }) => void | Promise<void>;
};
export type NotificationsById<T extends readonly NotificationDefinition<string, PayloadSchema>[]> = {
    [K in T[number] as K["id"]]: K;
};
export type SendInput<T extends readonly NotificationDefinition<string, PayloadSchema>[]> = {
    [K in T[number] as K["id"]]: {
        recipientId: string;
        notificationId: K["id"];
        payload: InferSchema<K["payload"]>;
    };
}[T[number]["id"]];
export type NotificationIds<T extends readonly NotificationDefinition<string, PayloadSchema>[]> = T[number]["id"];
export type UpdatePreferenceInput<T extends readonly NotificationDefinition<string, PayloadSchema>[]> = {
    recipientId: string;
    notificationId: NotificationIds<T>;
    channels: ChannelPreferenceMap;
};
export type GetPreferenceInput<T extends readonly NotificationDefinition<string, PayloadSchema>[]> = {
    recipientId: string;
    notificationId: NotificationIds<T>;
};
//# sourceMappingURL=types.d.ts.map
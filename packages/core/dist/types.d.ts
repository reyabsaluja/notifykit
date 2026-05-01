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
export type RateLimitConfig = {
    /** Maximum sends allowed within `windowMs`. */
    max: number;
    /** Sliding window length in milliseconds. */
    windowMs: number;
    /**
     * Scope of the limit. "recipient" counts sends to the same recipient for
     * this notification; "global" counts across all recipients. Defaults to
     * "recipient".
     */
    scope?: "recipient" | "global";
};
export type DigestConfig<S extends PayloadSchema = PayloadSchema> = {
    /** Rolling window to accumulate items before flushing. */
    windowMs: number;
    /**
     * Groups sends into buckets. Returning the same key for two sends (within
     * the window) merges them. Defaults to `${recipientId}:${notificationId}`.
     */
    key?: (ctx: {
        recipientId: string;
        notificationId: string;
        payload: InferSchema<S>;
    }) => string;
    /**
     * Coalesces buffered payloads into one final payload used for rendering.
     * Receives the accumulated payloads in chronological order.
     */
    render: (ctx: {
        recipientId: string;
        notificationId: string;
        payloads: InferSchema<S>[];
        count: number;
    }) => InferSchema<S>;
};
export type NotificationDefinition<Id extends string = string, S extends PayloadSchema = PayloadSchema> = {
    id: Id;
    payload: S;
    channels: ChannelConfig[];
    digest?: DigestConfig<S>;
    rateLimit?: RateLimitConfig;
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
export type RateLimitEvent = {
    /** "<notificationId>" for global scope, "<recipientId>:<notificationId>" otherwise. */
    key: string;
    notificationId: string;
    recipientId: string;
    occurredAt: Date;
};
export type DigestBufferEntry = {
    /** Composite "key" used to group payloads within a window. */
    key: string;
    recipientId: string;
    notificationId: string;
    /** Serialized payloads, oldest first. */
    payloads: Record<string, unknown>[];
    /** Wall-clock time when the window expires and a flush should fire. */
    flushAt: Date;
    createdAt: Date;
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
    digests: {
        /**
         * Append a payload to the bucket for `key`. If the bucket does not exist,
         * it's created with `flushAt` set to `now + windowMs`. Returns the bucket
         * after the append.
         */
        append(input: {
            key: string;
            recipientId: string;
            notificationId: string;
            payload: Record<string, unknown>;
            windowMs: number;
        }): Promise<DigestBufferEntry>;
        /** Atomically removes and returns the bucket, or null if already flushed. */
        take(key: string): Promise<DigestBufferEntry | null>;
        /** For inspection / test utilities only. */
        list(): Promise<DigestBufferEntry[]>;
    };
    rateLimits: {
        /** Append a rate-limit event for `key` at the current instant. */
        record(input: {
            key: string;
            recipientId: string;
            notificationId: string;
        }): Promise<RateLimitEvent>;
        /**
         * Number of events for `key` within the last `windowMs` milliseconds.
         * Implementations may prune older events opportunistically during this
         * call; stale rows never contribute to the count.
         */
        count(input: {
            key: string;
            windowMs: number;
        }): Promise<number>;
    };
};
export type Hooks = {
    "notification.created"?: (ctx: {
        notification: NotificationRecord;
    }) => void | Promise<void>;
    "notification.rate_limited"?: (ctx: {
        notificationId: string;
        recipientId: string;
        limit: RateLimitConfig;
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
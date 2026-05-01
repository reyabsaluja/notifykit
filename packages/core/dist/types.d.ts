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
export type WebhookChannelConfig = {
    type: "webhook";
    url: string;
    headers?: Record<string, string>;
};
export type ChannelConfig = InboxChannelConfig | EmailChannelConfig | WebhookChannelConfig;
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
/**
 * The digest shape the engine stores and reads internally. The callbacks
 * use `Record<string, unknown>` so that a `DigestConfig<{...specific}>` is
 * assignable to this type — i.e. `NotificationDefinition<"x", {...specific}>`
 * widens to `NotificationDefinition<string, PayloadSchema>` cleanly.
 * The engine validates payloads at runtime anyway.
 */
export type AnyDigestConfig = {
    windowMs: number;
    key?: (ctx: {
        recipientId: string;
        notificationId: string;
        payload: Record<string, unknown>;
    }) => string;
    render: (ctx: {
        recipientId: string;
        notificationId: string;
        payloads: Record<string, unknown>[];
        count: number;
    }) => Record<string, unknown>;
};
export type NotificationDefinition<Id extends string = string, S extends PayloadSchema = PayloadSchema> = {
    id: Id;
    payload: S;
    channels: ChannelConfig[];
    digest?: AnyDigestConfig;
    rateLimit?: RateLimitConfig;
    /**
     * Channel used when every primary delivery has terminally failed. Only
     * inbox is supported today — it runs after retries are exhausted so users
     * always see the message even if their email bounces.
     */
    fallback?: InboxChannelConfig;
};
/**
 * Quiet hours define a daily window during which non-urgent channels defer.
 * Times are "HH:MM" in 24h format in the recipient's own timezone. Inbox
 * channels still deliver immediately — quiet hours only suppress push/email.
 * Omitting a field disables the feature.
 */
export type QuietHours = {
    /** "HH:MM" in 24h format. e.g. "22:00". */
    start: string;
    /** "HH:MM" in 24h format. e.g. "08:00". Can cross midnight (e.g. 22:00 → 08:00). */
    end: string;
    /** IANA timezone. Defaults to "UTC". */
    timezone?: string;
};
export type Recipient = {
    id: string;
    email?: string;
    name?: string;
    quietHours?: QuietHours | null;
    createdAt: Date;
    updatedAt: Date;
};
export type UpsertRecipientInput = {
    id: string;
    email?: string;
    name?: string;
    /** Pass `null` to clear. Pass `undefined` (omit) to leave as-is. */
    quietHours?: QuietHours | null;
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
export type MarkReadForRecipientResult = {
    status: "marked";
    item: InboxItem;
} | {
    status: "not_found";
} | {
    status: "forbidden";
};
export type ChannelType = ChannelConfig["type"];
export type ChannelPreferenceMap = Partial<Record<ChannelType, boolean>>;
export type RecipientPreference = {
    recipientId: string;
    notificationId: string;
    channels: ChannelPreferenceMap;
    updatedAt: Date;
};
export type ScheduledSendStatus = "pending" | "claimed";
export type ScheduledSend = {
    id: string;
    recipientId: string;
    notificationId: string;
    payload: Record<string, unknown>;
    /** Wall-clock moment when the send should fire. */
    scheduledFor: Date;
    /** Why the send was deferred. Informational. */
    reason: "quiet_hours";
    /**
     * Lifecycle state. "pending" — not yet picked up. "claimed" — a worker has
     * reserved it but delivery hasn't confirmed completion. Rows are only
     * removed after a successful `complete()` call; failures `release()` them
     * back to pending so nothing is silently dropped.
     */
    status: ScheduledSendStatus;
    /** When a worker claimed this row. Cleared on release. */
    claimedAt?: Date | null;
    createdAt: Date;
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
export type DeliveryChannel = "email" | "webhook";
export type DeliveryRecord = {
    id: string;
    notificationRecordId: string;
    recipientId: string;
    notificationId: string;
    channel: DeliveryChannel;
    provider: string;
    status: DeliveryStatus;
    /** Email destination OR webhook URL, depending on channel. */
    to?: string;
    /** Email subject; empty for webhook. */
    subject?: string;
    /** Email body; serialized JSON payload for webhook. */
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
export type WebhookProvider = {
    id: string;
    send(input: {
        url: string;
        headers: Record<string, string>;
        payload: {
            notificationId: string;
            recipientId: string;
            payload: Record<string, unknown>;
            sentAt: string;
        };
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
    payload: Record<string, unknown>;
} | {
    deliveryId: string;
    notificationRecordId: string;
    recipientId: string;
    notificationId: string;
    channel: "webhook";
    provider: string;
    url: string;
    headers: Record<string, string>;
    payload: Record<string, unknown>;
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
        markReadForRecipient(inboxItemId: string, recipientId: string): Promise<MarkReadForRecipientResult>;
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
        /**
         * Puts a taken bucket back if digest flush fails before delivery completes.
         * If a newer bucket already exists for the same key, implementations should
         * prepend the restored payloads so retrying does not lose order.
         */
        restore(entry: DigestBufferEntry): Promise<DigestBufferEntry>;
        /** For inspection / test utilities only. */
        list(): Promise<DigestBufferEntry[]>;
    };
    rateLimits: {
        /**
         * Atomically: count events for `key` within the last `windowMs`, prune
         * aged rows, and — if below `max` — append a new event. Returns
         * `{ allowed: true }` on pass (the event was recorded), `{ allowed: false }`
         * on drop (no event recorded). Must be safe under concurrent callers; a
         * correct implementation guarantees at most `max` successful reservations
         * within any sliding window.
         */
        reserve(input: {
            key: string;
            max: number;
            windowMs: number;
            recipientId: string;
            notificationId: string;
        }): Promise<{
            allowed: boolean;
        }>;
        /**
         * Non-admission count used by tests and inspection. Does not record.
         * Implementations may prune aged events opportunistically during this
         * call.
         */
        count(input: {
            key: string;
            windowMs: number;
        }): Promise<number>;
    };
    scheduledSends: {
        create(input: Omit<ScheduledSend, "id" | "createdAt" | "status" | "claimedAt"> & {
            status?: ScheduledSendStatus;
        }): Promise<ScheduledSend>;
        /**
         * Claim a specific row for delivery. Transitions status from "pending"
         * to "claimed" and sets `claimedAt`. Returns the row if the claim won,
         * `null` if the row is already claimed or doesn't exist. Delivery MUST
         * call `complete(id)` on success or `release(id)` on failure — never
         * delete before delivery is confirmed.
         */
        claim(id: string): Promise<ScheduledSend | null>;
        /** Remove a successfully-delivered claim. No-op if the row is gone. */
        complete(id: string): Promise<void>;
        /** Return a claimed row to "pending" so it can be retried. */
        release(id: string): Promise<void>;
        /**
         * Rows whose `scheduledFor <= now` and whose status is "pending".
         * Used by the recovery sweep so future-dated rows don't fire early.
         */
        listDue(now: Date): Promise<ScheduledSend[]>;
        /** All rows, regardless of state. For tests and admin tooling. */
        list(): Promise<ScheduledSend[]>;
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
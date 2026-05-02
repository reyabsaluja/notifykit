import type { CategoryDefaults, ChannelPreferenceMap, ChannelType, DatabaseAdapter, DeliveryRecord, EmailProvider, GetPreferenceInput, Hooks, InboxItem, MarkReadForRecipientResult, NotificationDefinition, NotificationRecord, PayloadSchema, PreferenceExplanation, Queue, Recipient, RecipientPreference, RetryPolicy, SendInput, SecurityScope, UpdatePreferenceInput, UpsertRecipientInput, WebhookProvider } from "./types.js";
export type CreateNotifyKitInput<T extends readonly NotificationDefinition<string, PayloadSchema>[]> = {
    notifications: T;
    database: DatabaseAdapter;
    providers?: {
        email?: EmailProvider;
        webhook?: WebhookProvider;
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
    /**
     * Enable unsubscribe links. When set, email templates can reference
     * `{{_unsubscribeUrl}}` and the handler exposes a public route that flips
     * `preferences.channels.email = false` for the signed recipient +
     * notification pair. Omit to disable the feature entirely.
     */
    unsubscribe?: {
        /** HMAC secret used to sign tokens. Rotate with care — existing links break. */
        secret: string;
        /** Absolute URL (including scheme + host) the handler is mounted at, e.g. "https://app.com/api/notifykit". */
        baseUrl: string;
    };
    /**
     * App-level preference defaults. These are the lowest-priority layer in the
     * resolution engine — any more specific preference overrides them.
     */
    defaults?: {
        /** Default channel enable/disable state for all notifications. */
        channels?: ChannelPreferenceMap;
        /** Per-category default channel state. Keys must match a registered notification category. */
        categories?: CategoryDefaults;
    };
    /**
     * Tenant-level default channel overrides. Called with the tenant ID at
     * resolution time. Return a channel map to override app defaults for that
     * tenant, or `null` for no tenant-level overrides.
     */
    tenantDefaults?: (tenantId: string) => ChannelPreferenceMap | Promise<ChannelPreferenceMap | null> | null;
};
export type SendResult = {
    notification: NotificationRecord | null;
    inboxItems: InboxItem[];
    deliveries: DeliveryRecord[];
    skippedChannels: ChannelType[];
    /**
     * Channel types that were deferred to fire after quiet hours end. The inbox
     * channel still delivers immediately because it's user-pulled viewing.
     */
    deferredChannels: ChannelType[];
    /**
     * True if the send was buffered into a digest window instead of delivered
     * immediately. In that case `notification` is null and the other arrays
     * are empty; the eventual delivery fires from a later flush.
     */
    digested: boolean;
    /**
     * True if the send was dropped because the recipient has hit the
     * notification's rate limit. No records are written and no hooks fire
     * except `notification.rate_limited`.
     */
    rateLimited: boolean;
};
export type NotifyKit<T extends readonly NotificationDefinition<string, PayloadSchema>[]> = {
    upsertRecipient(input: UpsertRecipientInput): Promise<Recipient>;
    /**
     * Send a notification. **Server-only** — the caller is trusted. The
     * `recipientId` is used as provided, with no additional auth check.
     * Client-facing code should go through `createHandler()` which resolves
     * the recipient via `identify()`.
     */
    send(input: SendInput<T>): Promise<SendResult>;
    inbox: {
        /**
         * List inbox items. **Server-only** — the caller supplies the
         * `recipientId` and optional `scope` directly. In client-facing code
         * use the handler's `GET /inbox` route, which derives the recipient
         * from `identify()`.
         */
        list(recipientId: string, scope?: SecurityScope): Promise<InboxItem[]>;
        markRead(inboxItemId: string): Promise<InboxItem | null>;
        markReadForRecipient(inboxItemId: string, recipientId: string, scope?: SecurityScope): Promise<MarkReadForRecipientResult>;
    };
    deliveries: {
        /**
         * List delivery records. **Server-only** — the caller is trusted to
         * supply `recipientId` and `scope`. Never expose this to end-users
         * without authorization; use the handler's `GET /deliveries` route
         * which requires the `deliveries.list` permission.
         */
        list(recipientId?: string, scope?: SecurityScope): Promise<DeliveryRecord[]>;
    };
    preferences: {
        get(input: GetPreferenceInput<T>): Promise<RecipientPreference | null>;
        /**
         * List preferences. **Server-only** — the caller supplies the
         * `recipientId` and optional `scope` directly. In client-facing code
         * use the handler's `GET /preferences` route. Synthetic keys
         * (`__global__`, `__category:*__`) are excluded by default.
         */
        list(recipientId: string, scope?: SecurityScope): Promise<RecipientPreference[]>;
        update(input: UpdatePreferenceInput<T>): Promise<RecipientPreference>;
        /** Update user's global channel preferences (applies across all notifications). */
        updateGlobal(input: {
            recipientId: string;
            tenantId?: string;
            workspaceId?: string;
            channels: ChannelPreferenceMap;
        }): Promise<RecipientPreference>;
        /** Update user's category-level channel preferences. */
        updateCategory(input: {
            recipientId: string;
            tenantId?: string;
            workspaceId?: string;
            category: string;
            channels: ChannelPreferenceMap;
        }): Promise<RecipientPreference>;
        /**
         * Explain why each channel is enabled or disabled for a specific
         * notification + recipient combination. Returns the full resolution trail.
         */
        explain(input: {
            recipientId: string;
            tenantId?: string;
            workspaceId?: string;
            notificationId: string;
        }): Promise<PreferenceExplanation>;
    };
    /**
     * Resolves when outstanding digest flushes and all enqueued delivery jobs
     * (and their retries) have settled.
     */
    drain(): Promise<void>;
    /**
     * Forces pending digest buckets to flush now instead of waiting for their
     * window. Useful in tests and "send now" buttons. Resolves once every
     * triggered flush (and its follow-up deliveries) has completed.
     */
    flushDigests(): Promise<void>;
    /**
     * Fire scheduled-send rows immediately.
     *
     * - `{ force: true }` (default when called from tests / admin UIs) flushes
     *   every row regardless of `scheduledFor`. Use this to bypass quiet hours
     *   intentionally.
     * - `{ force: false }` (the production recovery default) only flushes rows
     *   whose `scheduledFor` is already in the past. Call this on boot to pick
     *   up rows left behind by a crash without sending future-dated rows early.
     *
     * Defaults to `{ force: true }` to preserve the "admin force" intent of
     * callers who were using this method before the split.
     */
    flushScheduledSends(options?: {
        force?: boolean;
    }): Promise<void>;
    /**
     * Recovery sweep: deliver every scheduled-send row whose `scheduledFor` is
     * already in the past. Safe to call on boot and periodically. Equivalent to
     * `flushScheduledSends({ force: false })`.
     */
    recoverScheduledSends(): Promise<void>;
    /** Registered notification definitions. Read-only, for introspection. */
    readonly definitions: T;
    /**
     * Redact sensitive payload fields for a given notification. Returns a copy
     * with fields listed in the definition's `redact` array replaced by
     * `"[REDACTED]"`. If no redaction is configured, returns the payload as-is.
     */
    redactPayload(notificationId: string, payload: Record<string, unknown>): Record<string, unknown>;
};
export declare function createNotifyKit<const T extends readonly NotificationDefinition<string, PayloadSchema>[]>(config: CreateNotifyKitInput<T>): NotifyKit<T>;
//# sourceMappingURL=create-notifykit.d.ts.map
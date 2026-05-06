export type PrimitiveSchema = "string" | "number" | "boolean";

export type PayloadSchema = Record<string, PrimitiveSchema>;

export type NotificationClassification = "transactional" | "product" | "marketing";

export type CategoryDefaults = Record<string, ChannelPreferenceMap>;

export type PreferenceResolutionLayer =
  | "app_default"
  | "notification_default"
  | "category_default"
  | "tenant_setting"
  | "user_global"
  | "user_category"
  | "user_notification"
  | "required_override"
  | "destination_unavailable";

export type ChannelResolution = {
  channel: ChannelType;
  allowed: boolean;
  resolvedBy: PreferenceResolutionLayer;
  trail: Array<{
    layer: PreferenceResolutionLayer;
    value: boolean | undefined;
  }>;
  reason: string;
};

export type PreferenceExplanation = {
  recipientId: string;
  notificationId: string;
  scope?: SecurityScope;
  channels: ChannelResolution[];
  required: boolean;
  classification?: NotificationClassification;
  category?: string;
};

export type ChannelOutcome =
  | "deliver"
  | "disabled"
  | "delayed"
  | "unavailable"
  | "rate_limited"
  | "digested";

export type DeliveryExplanation = {
  recipientId: string;
  notificationId: string;
  scope?: SecurityScope;
  channels: Array<ChannelResolution & { outcome: ChannelOutcome }>;
  required: boolean;
  classification?: NotificationClassification;
  category?: string;
  wouldRateLimit: boolean;
  wouldDigest: boolean;
  rateLimit: { current: number; max: number; windowMs: number } | null;
  digest: { windowMs: number } | null;
  quietHours: { active: boolean; resumesAt: Date | null } | null;
};

export type SecurityScope = {
  /** Tenant identifier. Aliased as `organizationId`. */
  tenantId?: string;
  /** Alias for `tenantId`. When both are set, `tenantId` takes precedence. */
  organizationId?: string;
  workspaceId?: string;
};

export type InferSchema<S extends PayloadSchema> = {
  [K in keyof S]: S[K] extends "string"
    ? string
    : S[K] extends "number"
      ? number
      : S[K] extends "boolean"
        ? boolean
        : never;
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
  html?: boolean;
};

export type WebhookChannelConfig = {
  type: "webhook";
  url: string;
  headers?: Record<string, string>;
};

export type SmsChannelConfig = {
  type: "sms";
  body: string;
};

export type ChannelConfig =
  | InboxChannelConfig
  | EmailChannelConfig
  | WebhookChannelConfig
  | SmsChannelConfig;

export type FallbackTrigger = "channel.failed" | "missing_address" | "skipped";

export type FallbackRule = {
  if: FallbackTrigger;
  then: ChannelConfig;
  from?: ChannelType;
};

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
   * Groups sends into buckets for the same recipient, notification, and
   * security scope. Returning the same key for two sends within that boundary
   * (and within the window) merges them. Defaults to one bucket per
   * recipient/notification/scope.
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

export type NotificationDefinition<
  Id extends string = string,
  S extends PayloadSchema = PayloadSchema,
> = {
  id: Id;
  payload: S;
  channels: ChannelConfig[];
  digest?: AnyDigestConfig;
  rateLimit?: RateLimitConfig;
  /**
   * Fallback behavior when a channel fails, is skipped, or the recipient
   * lacks a destination address. Pass a single `InboxChannelConfig` for the
   * legacy inbox-only fallback, or an array of `FallbackRule` objects for
   * rule-based routing (e.g. email fails → send SMS).
   */
  fallback?: InboxChannelConfig | FallbackRule[];
  /** Human-readable description for docs, studio, and generated contracts. */
  description?: string;
  /**
   * Grouping label for notification preferences UI and generated docs.
   * Free-form string — use whatever taxonomy fits your product (e.g.
   * "billing", "social", "security").
   */
  category?: string;
  /**
   * Monotonically increasing version number for this definition. Stored on
   * every notification record so historical sends can be debugged/rendered
   * even after the definition changes. Optional — omit to leave unversioned.
   */
  version?: number;
  /**
   * Payload field names that contain sensitive data (PII, secrets, tokens).
   * These fields are replaced with `"[REDACTED]"` before being exposed in
   * delivery logs, timeline, studio, and analytics surfaces. The full
   * payload is still stored on the notification record for server-side use.
   */
  redact?: readonly string[];
  /**
   * Custom validation function for payloads. When set, this runs *instead*
   * of the built-in primitive schema validation. Use this to plug in Zod,
   * Valibot, ArkType, or any other runtime validator. Should throw on
   * invalid input and return the validated (potentially transformed) data.
   */
  validate?: (payload: unknown) => Record<string, unknown>;
  /**
   * When `true`, this notification cannot be disabled by user preferences.
   * Use for transactional notifications like password resets, 2FA codes, or
   * billing receipts. Required notifications still respect missing
   * destinations (e.g. no email address) and safety constraints.
   */
  required?: boolean;
  /**
   * Default channel enable/disable state when no user preference exists.
   * Overrides app-level defaults for this specific notification.
   */
  defaultChannels?: ChannelPreferenceMap;
  /**
   * Classification for grouping in preference UIs and applying policy.
   * "transactional" — receipts, resets, legal notices.
   * "product" — activity, comments, mentions.
   * "marketing" — newsletters, promos, announcements.
   */
  classification?: NotificationClassification;
};

/**
 * Quiet hours define a daily window during which non-urgent channels defer.
 * Times are "HH:MM" in 24h format in the recipient's own timezone. Inbox
 * channels still deliver immediately — quiet hours defer email, webhook, and
 * SMS channels until the window ends.
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
  tenantId?: string;
  workspaceId?: string;
  email?: string;
  phone?: string;
  name?: string;
  quietHours?: QuietHours | null;
  createdAt: Date;
  updatedAt: Date;
};

export type UpsertRecipientInput = SecurityScope & {
  id: string;
  email?: string;
  phone?: string;
  name?: string;
  /** Pass `null` to clear. Pass `undefined` (omit) to leave as-is. */
  quietHours?: QuietHours | null;
};

export type NotificationRecord = {
  id: string;
  recipientId: string;
  tenantId?: string;
  workspaceId?: string;
  notificationId: string;
  payload: Record<string, unknown>;
  /**
   * Snapshot of the payload schema at send time. Allows historical sends to
   * be validated/rendered even after the definition changes.
   */
  payloadSchema?: Record<string, string>;
  /** Definition version at send time. Matches `NotificationDefinition.version`. */
  definitionVersion?: number;
  /**
   * Composite idempotency key stored when the caller passes `idempotencyKey`
   * to `send()`. Combines (key, notificationId, recipientId) so the same
   * user-provided key is scoped per notification type and recipient.
   */
  idempotencyKey?: string;
  createdAt: Date;
};

export type InboxItem = {
  id: string;
  notificationRecordId: string;
  recipientId: string;
  tenantId?: string;
  workspaceId?: string;
  notificationId: string;
  title: string;
  body?: string;
  actionUrl?: string;
  readAt?: Date | null;
  archivedAt?: Date | null;
  createdAt: Date;
};

export type MarkReadForRecipientResult =
  | { status: "marked"; item: InboxItem }
  | { status: "not_found" }
  | { status: "forbidden" };

export type InboxItemForRecipientResult =
  | { status: "ok"; item: InboxItem }
  | { status: "not_found" }
  | { status: "forbidden" };

export type InboxDeleteForRecipientResult =
  | { status: "deleted" }
  | { status: "not_found" }
  | { status: "forbidden" };

export type InboxListFilter = {
  archived?: boolean;
};

export type ChannelType = ChannelConfig["type"];

export type ChannelPreferenceMap = Partial<Record<ChannelType, boolean>>;

export type RecipientPreference = {
  recipientId: string;
  tenantId?: string;
  workspaceId?: string;
  notificationId: string;
  channels: ChannelPreferenceMap;
  updatedAt: Date;
};

export type ScheduledSendStatus = "pending" | "claimed";

export type ScheduledSend = {
  id: string;
  recipientId: string;
  tenantId?: string;
  workspaceId?: string;
  notificationId: string;
  /** ID of the NotificationRecord created at send() time, so the deferred delivery references the same record instead of creating a duplicate. */
  notificationRecordId?: string;
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
  tenantId?: string;
  workspaceId?: string;
  occurredAt: Date;
};

export type DigestBufferEntry = {
  /** Composite "key" used to group payloads within a window. */
  key: string;
  recipientId: string;
  tenantId?: string;
  workspaceId?: string;
  notificationId: string;
  /** Serialized payloads, oldest first. */
  payloads: Record<string, unknown>[];
  /** Wall-clock time when the window expires and a flush should fire. */
  flushAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

export const SKIP_REASONS = [
  "preferences_disabled",
  "required_override",
  "missing_address",
  "missing_provider",
  "rate_limited",
  "quiet_hours_deferred",
  "duplicate",
  "idempotent_replay",
  "condition_false",
  "expired",
  "unsubscribed",
  "suppressed",
  "invalid_payload",
  "disabled_in_dev",
] as const;

export type SkipReason = (typeof SKIP_REASONS)[number];

export type SkippedDelivery = {
  channel: ChannelType;
  reason: SkipReason;
  details?: string;
};

export type DeliveryStatus = "pending" | "sent" | "failed" | "skipped";

/** Includes "inbox" for skip-only records; actual delivery jobs use "email" | "webhook" | "sms". */
export type DeliveryChannel = "email" | "webhook" | "sms" | "inbox";

export type DeliveryRecord = {
  id: string;
  notificationRecordId: string;
  recipientId: string;
  tenantId?: string;
  workspaceId?: string;
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
  /** Set when `status` is `"skipped"`. */
  skipReason?: SkipReason;
  /** Additional human-readable context for the skip. */
  skipDetails?: string;
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
  }): Promise<{ providerMessageId?: string }>;
};

export type WebhookProvider = {
  id: string;
  send(input: {
    url: string;
    headers: Record<string, string>;
    payload: {
      notificationId: string;
      recipientId: string;
      tenantId?: string;
      workspaceId?: string;
      payload: Record<string, unknown>;
      sentAt: string;
    };
  }): Promise<{ providerMessageId?: string }>;
};

export type SmsProvider = {
  id: string;
  send(input: {
    to: string;
    body: string;
  }): Promise<{ providerMessageId?: string }>;
};

export type DeliveryJob =
  | {
      deliveryId: string;
      notificationRecordId: string;
      recipientId: string;
      tenantId?: string;
      workspaceId?: string;
      notificationId: string;
      channel: "email";
      provider: string;
      to: string;
      subject: string;
      body: string;
      payload: Record<string, unknown>;
    }
  | {
      deliveryId: string;
      notificationRecordId: string;
      recipientId: string;
      tenantId?: string;
      workspaceId?: string;
      notificationId: string;
      channel: "webhook";
      provider: string;
      url: string;
      headers: Record<string, string>;
      payload: Record<string, unknown>;
    }
  | {
      deliveryId: string;
      notificationRecordId: string;
      recipientId: string;
      tenantId?: string;
      workspaceId?: string;
      notificationId: string;
      channel: "sms";
      provider: string;
      to: string;
      body: string;
      payload: Record<string, unknown>;
    };

export type Queue = {
  enqueue(
    job: DeliveryJob,
    run: (job: DeliveryJob) => Promise<void>,
  ): void | Promise<void>;
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
    findByIdempotencyKey(key: string): Promise<NotificationRecord | null>;
  };
  inbox: {
    create(
      input: Omit<InboxItem, "id" | "createdAt" | "readAt" | "archivedAt">,
    ): Promise<InboxItem>;
    listByRecipient(
      recipientId: string,
      scope?: SecurityScope,
      filter?: InboxListFilter,
      limit?: number,
    ): Promise<InboxItem[]>;
    listByNotificationRecordId(notificationRecordId: string): Promise<InboxItem[]>;
    markReadForRecipient(
      inboxItemId: string,
      recipientId: string,
      scope?: SecurityScope,
    ): Promise<MarkReadForRecipientResult>;
    unreadCount(
      recipientId: string,
      scope?: SecurityScope,
    ): Promise<number>;
    markAllRead(
      recipientId: string,
      scope?: SecurityScope,
    ): Promise<number>;
    archiveForRecipient(
      inboxItemId: string,
      recipientId: string,
      scope?: SecurityScope,
    ): Promise<InboxItemForRecipientResult>;
    unarchiveForRecipient(
      inboxItemId: string,
      recipientId: string,
      scope?: SecurityScope,
    ): Promise<InboxItemForRecipientResult>;
    deleteForRecipient(
      inboxItemId: string,
      recipientId: string,
      scope?: SecurityScope,
    ): Promise<InboxDeleteForRecipientResult>;
  };
  deliveries: {
    create(
      input: Omit<DeliveryRecord, "id" | "createdAt" | "updatedAt" | "attempts"> & {
        attempts?: number;
      },
    ): Promise<DeliveryRecord>;
    findById(id: string): Promise<DeliveryRecord | null>;
    listByNotificationRecordId(notificationRecordId: string): Promise<DeliveryRecord[]>;
    update(
      id: string,
      patch: Partial<Omit<DeliveryRecord, "id" | "createdAt">>,
    ): Promise<DeliveryRecord | null>;
    list(
      recipientId?: string,
      scope?: SecurityScope,
      limit?: number,
    ): Promise<DeliveryRecord[]>;
  };
  preferences: {
    get(
      recipientId: string,
      notificationId: string,
      scope?: SecurityScope,
    ): Promise<RecipientPreference | null>;
    list(
      recipientId: string,
      scope?: SecurityScope,
    ): Promise<RecipientPreference[]>;
    upsert(input: SecurityScope & {
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
      tenantId?: string;
      workspaceId?: string;
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
      tenantId?: string;
      workspaceId?: string;
      notificationId: string;
    }): Promise<{ allowed: boolean }>;
    /**
     * Non-admission count used by tests and inspection. Does not record.
     * Implementations may prune aged events opportunistically during this
     * call.
     */
    count(input: { key: string; windowMs: number }): Promise<number>;
  };
  scheduledSends: {
    create(
      input: Omit<ScheduledSend, "id" | "createdAt" | "status" | "claimedAt"> & {
        status?: ScheduledSendStatus;
      },
    ): Promise<ScheduledSend>;
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
    /** Payload with sensitive fields replaced by `"[REDACTED]"` per the definition's `redact` list. */
    redactedPayload: Record<string, unknown>;
  }) => void | Promise<void>;
  "notification.rate_limited"?: (ctx: {
    notificationId: string;
    recipientId: string;
    limit: RateLimitConfig;
  }) => void | Promise<void>;
  "inbox.created"?: (ctx: { inboxItem: InboxItem }) => void | Promise<void>;
  "inbox.updated"?: (ctx: { inboxItem: InboxItem }) => void | Promise<void>;
  "inbox.archived"?: (ctx: { inboxItem: InboxItem }) => void | Promise<void>;
  "inbox.unarchived"?: (ctx: { inboxItem: InboxItem }) => void | Promise<void>;
  "inbox.deleted"?: (ctx: { itemId: string; recipientId: string }) => void | Promise<void>;
  "inbox.all_read"?: (ctx: { recipientId: string; count: number }) => void | Promise<void>;
  "delivery.sent"?: (ctx: {
    delivery: DeliveryRecord;
    /** Payload with sensitive fields replaced by `"[REDACTED]"` per the definition's `redact` list. */
    redactedPayload: Record<string, unknown>;
  }) => void | Promise<void>;
  "delivery.failed"?: (ctx: {
    delivery: DeliveryRecord;
    error: Error;
    /** Payload with sensitive fields replaced by `"[REDACTED]"` per the definition's `redact` list. */
    redactedPayload: Record<string, unknown>;
  }) => void | Promise<void>;
  "notification.suppressed"?: (ctx: {
    notificationId: string;
    recipientId: string;
    skippedChannels: ChannelType[];
    skipped: SkippedDelivery[];
  }) => void | Promise<void>;
};

export type NotificationsById<
  T extends readonly NotificationDefinition<string, PayloadSchema>[],
> = {
  [K in T[number] as K["id"]]: K;
};

export type SendInput<
  T extends readonly NotificationDefinition<string, PayloadSchema>[],
> = {
  [K in T[number] as K["id"]]: {
    recipientId: string;
    tenantId?: string;
    organizationId?: string;
    workspaceId?: string;
    notificationId: K["id"];
    payload: InferSchema<K["payload"]>;
    /**
     * Optional idempotency key. When provided, duplicate `send()` calls with
     * the same key + notificationId + recipientId within the TTL window return
     * the original result without re-processing.
     */
    idempotencyKey?: string;
  };
}[T[number]["id"]];

export type NotificationIds<
  T extends readonly NotificationDefinition<string, PayloadSchema>[],
> = T[number]["id"];

export type UpdatePreferenceInput<
  T extends readonly NotificationDefinition<string, PayloadSchema>[],
> = {
  recipientId: string;
  tenantId?: string;
  organizationId?: string;
  workspaceId?: string;
  notificationId: NotificationIds<T>;
  channels: ChannelPreferenceMap;
};

export type GetPreferenceInput<
  T extends readonly NotificationDefinition<string, PayloadSchema>[],
> = {
  recipientId: string;
  tenantId?: string;
  organizationId?: string;
  workspaceId?: string;
  notificationId: NotificationIds<T>;
};

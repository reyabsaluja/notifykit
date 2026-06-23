import type {
  CategoryDefaults,
  ChannelConfig,
  ChannelOutcome,
  ChannelPreferenceMap,
  ChannelType,
  DatabaseAdapter,
  DeliveryExplanation,
  DeliveryJob,
  DeliveryRecord,
  EmailProvider,
  FallbackRule,
  FallbackTrigger,
  GetPreferenceInput,
  Hooks,
  InboxChannelConfig,
  InboxDeleteForRecipientResult,
  InboxItem,
  InboxItemForRecipientResult,
  InboxListFilter,
  MarkReadForRecipientResult,
  NotificationDefinition,
  NotificationRecord,
  PayloadFieldError,
  PayloadSchema,
  PayloadValidationResult,
  PreferenceExplanation,
  PreferenceResolutionLayer,
  Queue,
  Recipient,
  RecipientPreference,
  RetryPolicy,
  SendInput,
  SecurityScope,
  SkipReason,
  SkippedDelivery,
  SmsProvider,
  TimelineEvent,
  TimelineEventType,
  UpdatePreferenceInput,
  UpsertRecipientInput,
  WebhookProvider,
} from "./types.js";
import type { RealtimeAdapter } from "./realtime.js";
import { defaultRetryPolicy, inlineQueue } from "./queues.js";
import { isWithinQuietHours, nextQuietHoursEnd, validateQuietHours } from "./quiet-hours.js";
import {
  GLOBAL_PREFERENCE_KEY,
  categoryPreferenceKey,
  isCategoryPreferenceKey,
  isSyntheticPreferenceKey,
} from "./preference-keys.js";
import { resolveChannel, resolvePreferences, type ResolutionContext } from "./resolve-preferences.js";
import { signUnsubscribeToken } from "./unsubscribe.js";
import { NotifyKitError, PAYLOAD_VALID, assertSafeWebhookUrl, checkPayload, sanitizeActionUrl, redactPayload, renderTemplate, validatePayload } from "./utils.js";
import { validateConfig, formatValidationIssues } from "./validate.js";

export const SKIP_PROVIDER = "skip" as const;

function buildDedupeCompositeKey(notificationId: string, recipientId: string, dedupeKey: string): string {
  return JSON.stringify(["dedup", notificationId, recipientId, dedupeKey]);
}

function normalizeListLimit(limit: number | undefined, field: string): number | undefined {
  if (limit === undefined) return undefined;
  if (!Number.isSafeInteger(limit) || limit <= 0) {
    throw new NotifyKitError(
      `${field} must be a positive integer.`,
      {
        code: "INVALID_LIMIT",
        field,
        fix: "Pass a positive integer limit, or omit the option to use the default.",
      },
    );
  }
  return limit;
}

function assertNonEmptyIdentifier(value: string, field: string): void {
  if (typeof value !== "string" || value.trim() === "") {
    throw new NotifyKitError(
      `${field} must be a non-empty string.`,
      {
        code: "INVALID_INPUT",
        field,
        fix: `Pass a non-empty ${field}.`,
      },
    );
  }
}

export type DevModeConfig = {
  allowlist?: string[];
  subjectPrefix?: string;
  logPreviews?: boolean;
  maxCaptured?: number;
};

export type CreateNotifyKitInput<
  T extends readonly NotificationDefinition<string, PayloadSchema>[],
> = {
  notifications: T;
  database: DatabaseAdapter;
  providers?: {
    email?: EmailProvider;
    webhook?: WebhookProvider;
    sms?: SmsProvider;
  };
  mode?: "production" | "development";
  dev?: DevModeConfig;
  on?: Hooks;
  /**
   * Queue used to run provider deliveries (email, webhook, SMS). Defaults to
   * `inlineQueue()` — jobs run synchronously inside `send()`. Pass
   * `setTimeoutQueue()` (or your own) to run deliveries asynchronously.
   */
  queue?: Queue;
  /** Retry policy for provider deliveries. Defaults to 3 attempts with backoff. */
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
  tenantDefaults?: (
    tenantId: string,
  ) => ChannelPreferenceMap | Promise<ChannelPreferenceMap | null> | null;
  /**
   * Pluggable realtime transport. When set, inbox mutations are published
   * so that connected clients (SSE, WebSocket, etc.) receive live updates.
   * Use `memoryRealtimeAdapter()` for single-process deployments.
   */
  realtime?: RealtimeAdapter;
  /**
   * TTL for idempotency keys in milliseconds. If a duplicate send arrives
   * after this window, it is treated as a new send. Default: 24 hours.
   */
  idempotencyKeyTtlMs?: number;
  /**
   * Called when a timeline append fails. Defaults to `console.error`.
   * Use this to route persistent timeline failures to your monitoring system.
   */
  onTimelineError?: (error: unknown) => void;
  /**
   * How long to retain timeline events. Events older than this are pruned
   * opportunistically during flush. Default: 7 days. Set to `0` to disable.
   */
  timelineRetentionMs?: number;
};

export type SendResult = {
  /**
   * The persisted notification record. Only null when `digested` is true.
   *
   * **BREAKING (pre-v1):** Previously null on suppression/rate-limit; now
   * always persisted so skipped deliveries have a parent record.
   */
  notification: NotificationRecord | null;
  inboxItems: InboxItem[];
  /** All delivery records including skipped ones (status "skipped"). */
  deliveries: DeliveryRecord[];
  /**
   * @deprecated Use `skipped[]` which includes the reason. Rate-limited sends
   * populate `skipped[]` but leave this array empty. Will be removed in v1.
   */
  skippedChannels: ChannelType[];
  skipped: SkippedDelivery[];
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
   * True if the send was rate-limited. A notification record and skipped
   * delivery records are still persisted; the `notification.rate_limited`
   * hook fires but no actual delivery is attempted.
   */
  rateLimited: boolean;
  /**
   * True if this result was returned from an idempotent replay — the
   * original send's result was returned without re-processing.
   */
  idempotent: boolean;
};

export type NotifyKit<
  T extends readonly NotificationDefinition<string, PayloadSchema>[],
> = {
  upsertRecipient(input: UpsertRecipientInput): Promise<Recipient>;
  /**
   * Send a notification. **Server-only** — the caller is trusted. The
   * `recipientId` is used as provided, with no additional auth check.
   * Client-facing code should go through `createHandler()` which resolves
   * the recipient via `identify()`.
   *
   * When `dryRun: true` is passed, returns a `DeliveryExplanation` without
   * writing any records — equivalent to calling `explain()`.
   */
  send(input: SendInput<T> & { dryRun: true }): Promise<DeliveryExplanation>;
  send(input: SendInput<T> & { dryRun?: false }): Promise<SendResult>;
  send(input: SendInput<T> & { dryRun?: boolean }): Promise<SendResult | DeliveryExplanation>;
  /**
   * Dry-run explanation of what `send()` would do for a given notification +
   * recipient. Covers preference resolution, rate limits, digests, and quiet
   * hours. Does not write any records or trigger delivery.
   */
  explain(input: SendInput<T>): Promise<DeliveryExplanation>;
  /**
   * Shorthand for `explain()`. Validates the send input and returns what
   * would happen without writing any records or triggering delivery.
   */
  check(input: SendInput<T>): Promise<DeliveryExplanation>;
  inbox: {
    /**
     * List inbox items. **Server-only** — the caller supplies the
     * `recipientId` and optional `scope` directly. In client-facing code
     * use the handler's `GET /inbox` route, which derives the recipient
     * from `identify()`.
     */
    list(recipientId: string, scope?: SecurityScope, filter?: InboxListFilter, limit?: number): Promise<InboxItem[]>;
    markReadForRecipient(
      inboxItemId: string,
      recipientId: string,
      scope?: SecurityScope,
    ): Promise<MarkReadForRecipientResult>;
    unreadCount(recipientId: string, scope?: SecurityScope): Promise<number>;
    markAllRead(recipientId: string, scope?: SecurityScope): Promise<number>;
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
    /**
     * List delivery records. **Server-only** — the caller is trusted to
     * supply `recipientId` and `scope`. Never expose this to end-users
     * without authorization; use the handler's `GET /deliveries` route
     * which requires the `deliveries.list` permission.
     */
    list(recipientId?: string, scope?: SecurityScope, limit?: number): Promise<DeliveryRecord[]>;
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
    /** Read the user's global channel preferences, or null if unset. */
    getGlobal(input: {
      recipientId: string;
      tenantId?: string;
      organizationId?: string;
      workspaceId?: string;
    }): Promise<RecipientPreference | null>;
    /** Update user's global channel preferences (applies across all notifications). */
    updateGlobal(input: {
      recipientId: string;
      tenantId?: string;
      organizationId?: string;
      workspaceId?: string;
      channels: ChannelPreferenceMap;
    }): Promise<RecipientPreference>;
    /** Read the user's category-level channel preferences, or null if unset. */
    getCategory(input: {
      recipientId: string;
      tenantId?: string;
      organizationId?: string;
      workspaceId?: string;
      category: string;
    }): Promise<RecipientPreference | null>;
    /** List all category preferences for a user. */
    listCategories(
      recipientId: string,
      scope?: SecurityScope,
    ): Promise<RecipientPreference[]>;
    /** Update user's category-level channel preferences. */
    updateCategory(input: {
      recipientId: string;
      tenantId?: string;
      organizationId?: string;
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
      organizationId?: string;
      workspaceId?: string;
      notificationId: string;
    }): Promise<PreferenceExplanation>;
  };
  /**
   * Resolves when outstanding digest flushes and all enqueued delivery jobs
   * (and their retries) have settled. Note: this waits for timer-gated work
   * (digests, scheduled sends) to fire naturally. For bounded shutdown, call
   * `close()` instead.
   */
  drain(): Promise<void>;
  /**
   * Graceful shutdown: cancels all pending timers (digest windows, scheduled
   * sends), resolves their tracked promises, and drains the delivery queue.
   * After `close()` resolves, no timers remain on the event loop from this
   * instance. Unlike `drain()`, this does NOT flush pending work — it
   * discards it. Call `flushDigests()` + `flushScheduledSends()` before
   * `close()` if you need to deliver pending items before shutting down.
   */
  close(): Promise<void>;
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
  flushScheduledSends(options?: { force?: boolean }): Promise<void>;
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
  redactPayload(
    notificationId: string,
    payload: Record<string, unknown>,
  ): Record<string, unknown>;
  /**
   * Retrieve the debug timeline for a notification. Returns lifecycle events
   * in chronological order showing every decision, side effect, and provider
   * interaction. Optionally filter to a specific delivery. Default limit: 1000.
   */
  timeline(
    notificationRecordId: string,
    options?: { deliveryId?: string; limit?: number },
  ): Promise<TimelineEvent[]>;
  /**
   * Manually prune timeline events older than the configured retention period
   * (or a custom cutoff). Returns the number of deleted events. Useful when
   * `timelineRetentionMs` is set to `0` (automatic pruning disabled).
   */
  pruneTimeline(olderThan?: Date): Promise<number>;
  /**
   * The realtime adapter passed to `createNotifyKit`, or `undefined` if none
   * was provided. Exposed so handlers and transports can subscribe clients;
   * core inbox mutations publish their own realtime events.
   */
  readonly realtime: RealtimeAdapter | undefined;
  /** True when `mode: "development"` was passed. */
  readonly isDev: boolean;
  /** Dev mode captured sends. Only populated when `mode: "development"`. */
  readonly captured: CapturedSend[];
};

export type CapturedSend = {
  channel: "email" | "webhook" | "sms";
  to: string;
  subject?: string;
  body: string;
  blocked: boolean;
  timestamp: Date;
};

type DevProvidersResult = {
  providers: { email?: EmailProvider; webhook?: WebhookProvider; sms?: SmsProvider };
  captured: CapturedSend[];
};

function applyDevProviders(
  providers: CreateNotifyKitInput<any>["providers"],
  allowlist: string[],
  subjectPrefix: string,
  logPreviews: boolean,
  maxCaptured: number,
): DevProvidersResult {
  const captured: CapturedSend[] = [];
  let idCounter = 0;

  function capture(entry: CapturedSend) {
    if (captured.length >= maxCaptured) captured.shift();
    captured.push(entry);
  }

  function isAllowed(to: string): boolean {
    if (allowlist.length === 0) return false;
    return allowlist.some((a) => to.toLowerCase() === a.toLowerCase());
  }

  function logPreview(channel: string, to: string, subject: string | undefined, body: string, blocked: boolean) {
    if (!logPreviews) return;
    const status = blocked ? "BLOCKED" : "SENT";
    const subj = subject ? ` | Subject: ${subject}` : "";
    console.log(`[notifykit:dev] ${status} ${channel} → ${to}${subj}`);
    if (body.length <= 200) {
      console.log(`[notifykit:dev]   Body: ${body}`);
    } else {
      console.log(`[notifykit:dev]   Body: ${body.slice(0, 200)}…`);
    }
  }

  const wrappedEmail: EmailProvider | undefined = (() => {
    const real = providers?.email;
    return {
      id: real?.id ?? "dev-sandbox",
      async send(input: { to: string; subject: string; body: string }) {
        const blocked = !isAllowed(input.to);
        const subject = `${subjectPrefix}${input.subject}`;
        capture({ channel: "email", to: input.to, subject, body: input.body, blocked, timestamp: new Date() });
        logPreview("email", input.to, subject, input.body, blocked);
        if (blocked) return { providerMessageId: `dev-blocked-${++idCounter}` };
        if (real) return real.send({ ...input, subject });
        return { providerMessageId: `dev-sandbox-${++idCounter}` };
      },
    };
  })();

  const wrappedWebhook: WebhookProvider | undefined = providers?.webhook
    ? {
        id: providers.webhook.id,
        signed: providers.webhook.signed,
        async send(input) {
          const blocked = !isAllowed(input.url);
          const body = JSON.stringify(input.payload);
          capture({ channel: "webhook", to: input.url, body, blocked, timestamp: new Date() });
          logPreview("webhook", input.url, undefined, body, blocked);
          if (blocked) return { providerMessageId: `dev-blocked-${++idCounter}` };
          return providers!.webhook!.send(input);
        },
      }
    : undefined;

  const wrappedSms: SmsProvider | undefined = (() => {
    const real = providers?.sms;
    if (!real) return undefined;
    return {
      id: real.id,
      async send(input: { to: string; body: string }) {
        const blocked = !isAllowed(input.to);
        capture({ channel: "sms", to: input.to, body: input.body, blocked, timestamp: new Date() });
        logPreview("sms", input.to, undefined, input.body, blocked);
        if (blocked) return { providerMessageId: `dev-blocked-${++idCounter}` };
        return real.send(input);
      },
    };
  })();

  return {
    providers: {
      email: wrappedEmail,
      webhook: wrappedWebhook,
      sms: wrappedSms,
    },
    captured,
  };
}

export function createNotifyKit<
  const T extends readonly NotificationDefinition<string, PayloadSchema>[],
>(config: CreateNotifyKitInput<T>): NotifyKit<T> {
  const isDev = config.mode === "development";
  if (isDev && typeof process !== "undefined" && process.env?.NODE_ENV === "production") {
    console.warn("[notifykit] WARNING: mode: \"development\" is active but NODE_ENV=production. All external sends are being blocked. Remove mode: \"development\" for production use.");
  }
  const devConfig: DevModeConfig = isDev ? (config.dev ?? {}) : {};
  const devAllowlist = devConfig.allowlist ?? [];
  const devSubjectPrefix = devConfig.subjectPrefix ?? "[DEV] ";
  const devLogPreviews = devConfig.logPreviews ?? false;
  const devMaxCaptured = Math.max(devConfig.maxCaptured ?? 1000, 1);

  const devResult = isDev
    ? applyDevProviders(config.providers, devAllowlist, devSubjectPrefix, devLogPreviews, devMaxCaptured)
    : null;
  const providers = devResult ? devResult.providers : config.providers;
  const devCaptured: CapturedSend[] = devResult ? devResult.captured : [];

  const { notifications, database, on } = config;
  const onTimelineError = config.onTimelineError ?? ((err: unknown) => {
    console.error("[notifykit] timeline append error:", err);
  });
  const timelineRetentionMs = config.timelineRetentionMs ?? 7 * 24 * 60 * 60 * 1000;
  const timelineAdapter = database.timeline ?? {
    async append() { return []; },
    async listByNotificationRecordId() { return []; },
    async listByDeliveryId() { return []; },
    async prune() { return 0; },
  };
  const queue = config.queue ?? inlineQueue();
  const retry: RetryPolicy = {
    maxAttempts: config.retry?.maxAttempts ?? defaultRetryPolicy.maxAttempts,
    delayMs: config.retry?.delayMs ?? defaultRetryPolicy.delayMs,
  };
  const unsubscribeConfig = config.unsubscribe ?? null;
  const realtimeAdapter = config.realtime;

  async function publishRealtime(...args: Parameters<NonNullable<typeof realtimeAdapter>["publish"]>) {
    try {
      await realtimeAdapter?.publish(...args);
    } catch (err) {
      console.error("[notifykit] realtime publish error:", err);
    }
  }

  // --- Startup validation: fail fast with all errors at once ---
  const startupIssues = validateConfig({
    notifications,
    providers,
    unsubscribe: config.unsubscribe,
    defaults: config.defaults,
    database: {
      timeline: database.timeline,
      digests: database.digests,
      rateLimits: database.rateLimits,
    },
    retry: config.retry,
    idempotencyKeyTtlMs: config.idempotencyKeyTtlMs,
    timelineRetentionMs: config.timelineRetentionMs,
  });
  const errors = startupIssues.filter((i) => i.severity === "error");
  const warnings = startupIssues.filter((i) => i.severity === "warning");
  if (errors.length > 0) {
    throw new NotifyKitError(
      `Invalid NotifyKit configuration (${errors.length} error${errors.length > 1 ? "s" : ""}):\n${formatValidationIssues(errors)}`,
      { code: "INVALID_CONFIG" },
    );
  }
  if (warnings.length > 0) {
    for (const w of warnings) {
      const loc = w.notificationId ? `[${w.notificationId}] ` : "";
      console.warn(`[notifykit] ${loc}${w.message}${w.fix ? ` ${w.fix}` : ""}`);
    }
  }

  if (isDev) {
    const allow = devAllowlist.length > 0 ? ` Allowlist: ${devAllowlist.join(", ")}` : " All external sends blocked.";
    console.log(`[notifykit] Development mode active.${allow}`);
  }

  function buildUnsubscribeUrl(
    recipient: Recipient,
    notificationId: string,
    scope: SecurityScope,
  ): string {
    if (!unsubscribeConfig) return "";
    const token = signUnsubscribeToken(
      {
        recipientId: recipient.id,
        tenantId: scope.tenantId,
        workspaceId: scope.workspaceId,
        notificationId,
      },
      unsubscribeConfig.secret,
    );
    const base = unsubscribeConfig.baseUrl.replace(/\/+$/, "");
    return `${base}/unsubscribe?token=${encodeURIComponent(token)}`;
  }

  const byId = new Map<string, NotificationDefinition<string, PayloadSchema>>();
  for (const def of notifications) {
    byId.set(def.id, def);
  }

  async function runHook<K extends keyof Hooks>(
    name: K,
    ...args: Parameters<NonNullable<Hooks[K]>>
  ): Promise<void> {
    const fn = on?.[name];
    if (!fn) return;
    try {
      // @ts-expect-error — dispatch to the user-provided hook with matching args
      await fn(...args);
    } catch (err) {
      console.error(`[notifykit] hook "${String(name)}" error:`, err);
    }
  }

  type TimelineBuffer = Omit<TimelineEvent, "id" | "seq" | "timestamp">[];

  function recordTimeline(
    buffer: TimelineBuffer,
    ctx: {
      notificationRecordId: string;
      recipientId: string;
      tenantId?: string;
      workspaceId?: string;
      notificationId: string;
    },
    event: TimelineEventType,
    message: string,
    opts?: { deliveryId?: string; channel?: ChannelType; provider?: string; metadata?: Record<string, unknown> },
  ): void {
    buffer.push({
      notificationRecordId: ctx.notificationRecordId,
      deliveryId: opts?.deliveryId,
      recipientId: ctx.recipientId,
      tenantId: ctx.tenantId,
      workspaceId: ctx.workspaceId,
      notificationId: ctx.notificationId,
      channel: opts?.channel,
      provider: opts?.provider,
      event,
      message,
      metadata: opts?.metadata,
    });
  }

  const pendingTimelineWrites = new Set<Promise<void>>();
  let pruneFailures = 0;
  let lastPruneAttemptMs = 0;

  async function reportTimelineError(error: unknown): Promise<void> {
    try {
      await onTimelineError(error);
    } catch (handlerError) {
      console.error("[notifykit] onTimelineError handler error:", handlerError);
    }
  }

  async function flushTimeline(buffer: TimelineBuffer): Promise<void> {
    const batch = buffer.splice(0);
    if (batch.length === 0) return;
    const p = timelineAdapter.append(batch).then(() => {}).catch(reportTimelineError);
    pendingTimelineWrites.add(p);
    try { await p; } finally { pendingTimelineWrites.delete(p); }
    if (timelineRetentionMs > 0) {
      const now = Date.now();
      const backoffMs = pruneFailures >= 10 ? 60_000 : 0;
      if (now - lastPruneAttemptMs >= backoffMs) {
        const pruneProbability = pruneFailures >= 10 ? 1 : 0.01;
        if (Math.random() < pruneProbability) {
          lastPruneAttemptMs = now;
          const pruneP = timelineAdapter.prune(new Date(now - timelineRetentionMs))
            .then(() => { pruneFailures = 0; })
            .catch((err: unknown) => {
              pruneFailures++;
              return reportTimelineError(err);
            });
          pendingTimelineWrites.add(pruneP);
          pruneP.finally(() => pendingTimelineWrites.delete(pruneP));
        }
      }
    }
  }

  async function drainPendingTimelineWrites(): Promise<void> {
    // Cap iterations: a completing write can spawn a prune, which may itself
    // resolve and remove itself, so we re-check. 10 rounds is generous; if
    // writes still remain, they are in-flight prunes we can safely orphan.
    for (let i = 0; i < 10 && pendingTimelineWrites.size > 0; i++) {
      await Promise.all(Array.from(pendingTimelineWrites));
    }
  }

  // Per-key serialization for idempotency checks. Prevents concurrent sends
  // with the same key from racing past the findByIdempotencyKey check.
  const idempotencyLocks = new Map<string, { chain: Promise<unknown>; pending: number }>();
  const LOCK_TIMEOUT_MS = 5 * 60 * 1000;
  function withIdempotencyLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const entry = idempotencyLocks.get(key) ?? { chain: Promise.resolve(), pending: 0 };
    entry.pending++;
    if (!idempotencyLocks.has(key)) idempotencyLocks.set(key, entry);

    let resolve!: (v: T) => void;
    let reject!: (e: unknown) => void;
    const result = new Promise<T>((res, rej) => { resolve = res; reject = rej; });

    // fn runs as both fulfilled/rejected handler: each queued operation executes
    // regardless of its predecessor's outcome (errors don't abort the queue).
    const newChain = entry.chain.then(fn, fn).then(resolve, reject);
    entry.chain = newChain;

    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      entry.pending--;
      if (entry.pending === 0) idempotencyLocks.delete(key);
    };
    const timer = setTimeout(cleanup, LOCK_TIMEOUT_MS);
    newChain.finally(() => { clearTimeout(timer); cleanup(); });

    return result;
  }

  const pendingFlushes = new Set<Promise<void>>();
  type ScheduledFlush = {
    timer: ReturnType<typeof setTimeout>;
    resolve: () => void;
    def: NotificationDefinition<string, PayloadSchema>;
  };
  const scheduledFlushes = new Map<string, ScheduledFlush>();
  let closing = false;
  type ScheduledSendTimer = {
    timer: ReturnType<typeof setTimeout>;
    resolve: () => void;
    scheduledFor: Date;
  };
  const scheduledSendTimers = new Map<string, ScheduledSendTimer>();
  const fallbackDeliveryIds = new Set<string>();

  function normalizeOrgId(scope: SecurityScope): SecurityScope {
    if (scope.tenantId !== undefined) {
      assertNonEmptyIdentifier(scope.tenantId, "tenantId");
    }
    if (scope.organizationId !== undefined) {
      assertNonEmptyIdentifier(scope.organizationId, "organizationId");
    }
    if (scope.workspaceId !== undefined) {
      assertNonEmptyIdentifier(scope.workspaceId, "workspaceId");
    }
    if (scope.organizationId && !scope.tenantId) {
      return { ...scope, tenantId: scope.organizationId, organizationId: undefined };
    }
    return scope;
  }

  function resolveScope(raw: SecurityScope, recipient: Recipient): SecurityScope {
    const input = normalizeOrgId(raw);
    const tenantId = input.tenantId ?? recipient.tenantId;
    const workspaceId = input.workspaceId ?? recipient.workspaceId;
    if (input.tenantId && recipient.tenantId && input.tenantId !== recipient.tenantId) {
      throw new NotifyKitError(
        `Recipient "${recipient.id}" does not belong to the specified tenant.`,
        {
          code: "TENANT_MISMATCH",
          recipientId: recipient.id,
          fix: "Ensure the tenantId matches the recipient's registered tenant.",
        },
      );
    }
    if (
      input.workspaceId &&
      recipient.workspaceId &&
      input.workspaceId !== recipient.workspaceId
    ) {
      throw new NotifyKitError(
        `Recipient "${recipient.id}" does not belong to the specified workspace.`,
        {
          code: "WORKSPACE_MISMATCH",
          recipientId: recipient.id,
          fix: "Ensure the workspaceId matches the recipient's registered workspace.",
        },
      );
    }
    return compactScope({ tenantId, workspaceId });
  }

  function compactScope(scope: SecurityScope): SecurityScope {
    const out: SecurityScope = {};
    if (scope.tenantId) out.tenantId = scope.tenantId;
    if (scope.workspaceId) out.workspaceId = scope.workspaceId;
    return out;
  }

  function redactForDef(
    def: NotificationDefinition<string, PayloadSchema>,
    payload: Record<string, unknown>,
  ): Record<string, unknown> {
    if (!def.redact || def.redact.length === 0) return payload;
    return redactPayload(payload, def.redact);
  }

  function resolvedByToSkipReason(
    resolvedBy: PreferenceResolutionLayer | undefined,
  ): SkipReason {
    switch (resolvedBy) {
      case "destination_unavailable":
        return "missing_address";
      case "required_override":
        return "required_override";
      case "user_notification":
      case "user_category":
      case "user_global":
        return "preferences_disabled";
      case "tenant_setting":
      case "category_default":
      case "notification_default":
      case "app_default":
        return "preferences_disabled";
      case undefined:
        return "suppressed";
      default: {
        const unexpected: never = resolvedBy;
        throw new NotifyKitError(
          `Unknown preference resolution layer: ${String(unexpected)}.`,
          { code: "INTERNAL_ERROR" },
        );
      }
    }
  }

  async function persistSkip(ctx: {
    notificationRecordId: string;
    recipientId: string;
    tenantId?: string;
    workspaceId?: string;
    notificationId: string;
    channel: ChannelType;
    reason: SkipReason;
    details?: string;
  }): Promise<DeliveryRecord> {
    return database.deliveries.create({
      notificationRecordId: ctx.notificationRecordId,
      recipientId: ctx.recipientId,
      tenantId: ctx.tenantId,
      workspaceId: ctx.workspaceId,
      notificationId: ctx.notificationId,
      channel: ctx.channel,
      provider: SKIP_PROVIDER,
      status: "skipped",
      skipReason: ctx.reason,
      skipDetails: ctx.details,
      attempts: 0,
    });
  }

  async function createSkippedNotification(ctx: {
    recipient: Recipient;
    scope: SecurityScope;
    def: NotificationDefinition<string, PayloadSchema>;
    payload: Record<string, unknown>;
    skipped: SkippedDelivery[];
    idempotencyKey?: string;
  }): Promise<{ notificationRecord: NotificationRecord; skippedRecords: DeliveryRecord[] }> {
    const notificationRecord = await database.notifications.create({
      recipientId: ctx.recipient.id,
      tenantId: ctx.scope.tenantId,
      workspaceId: ctx.scope.workspaceId,
      notificationId: ctx.def.id,
      payload: ctx.payload,
      payloadSchema: { ...ctx.def.payload },
      definitionVersion: ctx.def.version,
      idempotencyKey: ctx.idempotencyKey,
    });
    await runHook("notification.created", {
      notification: notificationRecord,
      redactedPayload: redactForDef(ctx.def, notificationRecord.payload),
    });
    const base = {
      notificationRecordId: notificationRecord.id,
      recipientId: ctx.recipient.id,
      tenantId: ctx.scope.tenantId,
      workspaceId: ctx.scope.workspaceId,
      notificationId: ctx.def.id,
    };
    const skippedRecords = await Promise.all(
      ctx.skipped.map((s) => persistSkip({ ...base, channel: s.channel, reason: s.reason, details: s.details })),
    );
    return { notificationRecord, skippedRecords };
  }

  function idempotencyCompositeKey(
    userKey: string,
    notificationId: string,
    recipientId: string,
  ): string {
    return JSON.stringify(["idem", notificationId, recipientId, userKey]);
  }

  async function buildIdempotentReplay(existing: NotificationRecord): Promise<SendResult | null> {
    const [existingDeliveries, existingInboxItems] = await Promise.all([
      database.deliveries.listByNotificationRecordId(existing.id),
      database.inbox.listByNotificationRecordId(existing.id),
    ]);
    if (existingDeliveries.length === 0 && existingInboxItems.length === 0) {
      return null;
    }
    const skipped: SkippedDelivery[] = existingDeliveries
      .filter((d) => d.status === "skipped")
      .map((d) => ({
        channel: d.channel,
        reason: (d.skipReason ?? "idempotent_replay") as SkipReason,
        details: d.skipDetails,
      }));
    return {
      notification: existing,
      inboxItems: existingInboxItems,
      deliveries: existingDeliveries,
      skippedChannels: skipped.map((s) => s.channel),
      skipped,
      deferredChannels: existingDeliveries
        .filter((d) => d.skipReason === "quiet_hours_deferred")
        .map((d) => d.channel),
      digested: false,
      rateLimited: existingDeliveries.some((d) => d.skipReason === "rate_limited"),
      idempotent: true,
    };
  }

  function isUniqueConstraintError(err: unknown): boolean {
    if (!(err instanceof Error)) return false;
    const msg = err.message.toLowerCase();
    return msg.includes("unique constraint") || msg.includes("duplicate key") || msg.includes("unique_violation");
  }

  function isIdempotencyKeyConstraintError(err: unknown): boolean {
    if (!isUniqueConstraintError(err)) return false;
    const msg = (err as Error).message.toLowerCase();
    return msg.includes("idempotency_key");
  }

  const digestIdempotencyWarned = new Set<string>();
  function warnIdempotencyKeyIgnoredForDigest(notificationId: string): void {
    if (digestIdempotencyWarned.has(notificationId)) return;
    digestIdempotencyWarned.add(notificationId);
    console.warn(
      `[notifykit] [${notificationId}] idempotencyKey is ignored for digested notifications. ` +
      `The key has no effect when digest is configured.`,
    );
  }

  function storageKey(parts: readonly string[]): string {
    return JSON.stringify(parts);
  }

  function scopedStorageKey(
    scope: SecurityScope,
    ...parts: readonly string[]
  ): string {
    return storageKey([scope.tenantId ?? "", scope.workspaceId ?? "", ...parts]);
  }

  function digestBucketKey(
    scope: SecurityScope,
    recipientId: string,
    notificationId: string,
    groupKey: string,
  ): string {
    return scopedStorageKey(scope, recipientId, notificationId, groupKey);
  }

  async function buildResolutionCtx(
    recipient: Recipient,
    def: NotificationDefinition<string, PayloadSchema>,
    scope: SecurityScope,
  ): Promise<ResolutionContext> {
    const [userGlobal, userCategory, userNotification, tenantChannels] =
      await Promise.all([
        database.preferences.get(recipient.id, GLOBAL_PREFERENCE_KEY, scope),
        def.category
          ? database.preferences.get(
              recipient.id,
              categoryPreferenceKey(def.category),
              scope,
            )
          : Promise.resolve(null),
        database.preferences.get(recipient.id, def.id, scope),
        scope.tenantId && config.tenantDefaults
          ? Promise.resolve(config.tenantDefaults(scope.tenantId))
          : Promise.resolve(null),
      ]);
    return {
      def,
      recipient,
      scope,
      appDefaults: config.defaults?.channels,
      categoryDefaults: config.defaults?.categories,
      tenantChannels,
      userGlobal,
      userCategory,
      userNotification,
    };
  }

  async function send(rawInput: SendInput<T>): Promise<SendResult> {
    const input = rawInput as { notificationId: string; recipientId: string; idempotencyKey?: string };
    const pending: TimelineBuffer = [];
    try {
      let result: SendResult;
      if (input.idempotencyKey) {
        if (input.idempotencyKey.length > 256) {
          throw new NotifyKitError(
            "idempotencyKey must be 256 characters or fewer.",
            {
              code: "INVALID_INPUT",
              field: "idempotencyKey",
              fix: "Shorten the idempotencyKey to 256 characters or fewer.",
            },
          );
        }
        const lockKey = `${input.notificationId}:${input.recipientId}:${input.idempotencyKey}`;
        const compositeKey = idempotencyCompositeKey(input.idempotencyKey, input.notificationId, input.recipientId);
        try {
          result = await withIdempotencyLock(lockKey, () => sendInner(pending, rawInput, compositeKey));
        } catch (err) {
          if (isIdempotencyKeyConstraintError(err) || isUniqueConstraintError(err)) {
            const existing = await database.notifications.findByIdempotencyKey(compositeKey);
            if (existing) {
              const ttl = config.idempotencyKeyTtlMs ?? 24 * 60 * 60 * 1000;
              const age = Date.now() - existing.createdAt.getTime();
              if (age < ttl) {
                const replay = await buildIdempotentReplay(existing);
                if (replay) {
                  recordTimeline(pending, {
                    notificationRecordId: existing.id,
                    recipientId: input.recipientId,
                    notificationId: input.notificationId,
                  }, "idempotent.replay", `Idempotent replay of notification ${existing.id}`);
                  return replay;
                }
              }
              await database.notifications.clearIdempotencyKey(existing.id);
              result = await withIdempotencyLock(lockKey, () => sendInner(pending, rawInput, compositeKey));
            } else {
              throw err;
            }
          } else {
            throw err;
          }
        }
      } else {
        result = await sendInner(pending, rawInput);
      }
      return result;
    } finally {
      await flushTimeline(pending);
    }
  }

  async function sendInner(pending: TimelineBuffer, rawInput: SendInput<T>, preComputedCompositeKey?: string): Promise<SendResult> {
    const input = rawInput as {
      recipientId: string;
      tenantId?: string;
      workspaceId?: string;
      notificationId: string;
      payload: unknown;
      idempotencyKey?: string;
      dedupeKey?: string;
      dedupeWindowMs?: number;
    };
    assertNonEmptyIdentifier(input.recipientId, "recipientId");
    const def = byId.get(input.notificationId);
    if (!def) {
      const known = [...byId.keys()];
      throw new NotifyKitError(
        `Unknown notification id: "${input.notificationId}".`,
        {
          code: "UNKNOWN_NOTIFICATION",
          notificationId: input.notificationId,
          fix: known.length > 0
            ? `Registered ids: ${known.join(", ")}.`
            : "No notifications are registered. Check your createNotifyKit({ notifications: [...] }) call.",
        },
      );
    }

    const recipient = await database.recipients.findById(input.recipientId);
    if (!recipient) {
      throw new NotifyKitError(
        `Unknown recipient: "${input.recipientId}".`,
        {
          code: "UNKNOWN_RECIPIENT",
          recipientId: input.recipientId,
          notificationId: input.notificationId,
          fix: "Call upsertRecipient({ id: \"...\", ... }) before sending.",
        },
      );
    }

    const payload = def.validate
      ? def.validate(input.payload)
      : validatePayload(def.payload, input.payload, def.id);
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new NotifyKitError(
        `Custom validate for "${def.id}" must return a plain object, got ${payload === null ? "null" : typeof payload}.`,
        { code: "INVALID_VALIDATE_RETURN", notificationId: def.id },
      );
    }
    const scope = resolveScope(input, recipient);

    const tlCtx = {
      recipientId: recipient.id,
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      notificationId: def.id,
    };

    const compositeIdempotencyKey = preComputedCompositeKey ?? (input.idempotencyKey
      ? idempotencyCompositeKey(input.idempotencyKey, input.notificationId, input.recipientId)
      : undefined);

    // Idempotency key dedup — if key exists and is within TTL, replay.
    if (compositeIdempotencyKey) {
      const existing = await database.notifications.findByIdempotencyKey(compositeIdempotencyKey);
      if (existing) {
        const ttl = config.idempotencyKeyTtlMs ?? 24 * 60 * 60 * 1000;
        const age = Date.now() - existing.createdAt.getTime();
        if (age < ttl) {
          const replay = await buildIdempotentReplay(existing);
          if (replay) {
            recordTimeline(pending, { ...tlCtx, notificationRecordId: existing.id }, "idempotent.replay", `Idempotent replay of notification ${existing.id}`);
            return replay;
          }
        }
        await database.notifications.clearIdempotencyKey(existing.id);
      }
    }

    // Semantic deduplication check — runs before preference resolution
    if (input.dedupeKey) {
      const MAX_DEDUPE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
      if (!input.dedupeWindowMs || input.dedupeWindowMs <= 0) {
        throw new NotifyKitError(
          "dedupeWindowMs is required and must be positive when dedupeKey is set.",
          {
            code: "INVALID_INPUT",
            field: "dedupeWindowMs",
            fix: "Pass a positive dedupeWindowMs (e.g. 3600000 for 1 hour).",
          },
        );
      }
      if (input.dedupeWindowMs > MAX_DEDUPE_WINDOW_MS) {
        throw new NotifyKitError(
          "dedupeWindowMs must be 30 days or fewer.",
          {
            code: "INVALID_INPUT",
            field: "dedupeWindowMs",
            fix: "Pass a dedupeWindowMs of 2592000000 (30 days) or less.",
          },
        );
      }
      if (input.dedupeKey.length > 256) {
        throw new NotifyKitError(
          "dedupeKey must be 256 characters or fewer.",
          {
            code: "INVALID_INPUT",
            field: "dedupeKey",
            fix: "Shorten the dedupeKey to 256 characters or fewer.",
          },
        );
      }
      const dedupeCompositeKey = buildDedupeCompositeKey(def.id, recipient.id, input.dedupeKey);
      const { duplicate } = await database.dedupe.check({
        key: dedupeCompositeKey,
        recipientId: recipient.id,
        tenantId: scope.tenantId,
        workspaceId: scope.workspaceId,
        notificationId: def.id,
        windowMs: input.dedupeWindowMs,
      });
      if (Math.random() < 0.01) {
        database.dedupe.prune().catch(() => {});
      }
      if (duplicate) {
        const allChannels = [...new Set(def.channels.map((c) => c.type))];
        const skipped: SkippedDelivery[] = allChannels.map((ch) => ({
          channel: ch,
          reason: "duplicate" as SkipReason,
          details: `Deduplicated: key "${input.dedupeKey}" seen within ${input.dedupeWindowMs}ms window`,
        }));
        const { notificationRecord, skippedRecords } = await createSkippedNotification({
          recipient, scope, def, payload, skipped, idempotencyKey: compositeIdempotencyKey,
        });
        recordTimeline(pending, { ...tlCtx, notificationRecordId: notificationRecord.id }, "deduplicated", `Duplicate send blocked: key "${input.dedupeKey}" within ${input.dedupeWindowMs}ms window`, {
          metadata: { dedupeKey: input.dedupeKey, windowMs: input.dedupeWindowMs },
        });
        await runHook("notification.deduplicated", {
          notificationId: def.id,
          recipientId: recipient.id,
          dedupeKey: input.dedupeKey,
          windowMs: input.dedupeWindowMs,
        });
        return {
          notification: notificationRecord,
          inboxItems: [],
          deliveries: skippedRecords,
          skippedChannels: [],
          skipped,
          deferredChannels: [],
          digested: false,
          rateLimited: false,
          idempotent: false,
        };
      }
    }

    const resolutionCtx = await buildResolutionCtx(recipient, def, scope);
    const prefResult = resolvePreferences(resolutionCtx);
    const hasAnyAllowed = prefResult.channels.some((ch) => ch.allowed);

    const hasMatchingFallback = (() => {
      if (!def.fallback || isLegacyFallback(def.fallback)) return false;
      const primaryTypes = new Set<ChannelType>(def.channels.map((c) => c.type));
      for (const ch of prefResult.channels) {
        if (ch.allowed) continue;
        const trigger: FallbackTrigger =
          ch.resolvedBy === "destination_unavailable" ? "missing_address" : "skipped";
        if (matchFallbackRules(def.fallback, trigger, ch.channel, primaryTypes)) {
          return true;
        }
      }
      return false;
    })();
    if (!hasAnyAllowed && !hasMatchingFallback) {
      const skippedChannels = prefResult.channels.map((ch) => ch.channel);
      const skipped: SkippedDelivery[] = prefResult.channels.map((ch) => ({
        channel: ch.channel,
        reason: resolvedByToSkipReason(ch.resolvedBy),
        details: ch.reason,
      }));
      const { notificationRecord, skippedRecords } = await createSkippedNotification({
        recipient, scope, def, payload, skipped, idempotencyKey: compositeIdempotencyKey,
      });
      const suppressCtx = { ...tlCtx, notificationRecordId: notificationRecord.id };
      recordTimeline(pending, suppressCtx, "preferences.resolved", `All channels disabled by preferences`);
      recordTimeline(pending, suppressCtx, "notification.suppressed", `Notification suppressed: no deliverable channels`, {
        metadata: { skippedChannels },
      });
      await runHook("notification.suppressed", {
        notificationId: def.id,
        recipientId: recipient.id,
        skippedChannels,
        skipped,
      });
      return {
        notification: notificationRecord,
        inboxItems: [],
        deliveries: skippedRecords,
        skippedChannels,
        skipped,
        deferredChannels: [],
        digested: false,
        rateLimited: false,
        idempotent: false,
      };
    }

    if (def.rateLimit) {
      const limit = def.rateLimit;
      const rateLimitScope = limit.scope ?? "recipient";
      const key =
        rateLimitScope === "global"
          ? scopedStorageKey(scope, def.id)
          : scopedStorageKey(scope, recipient.id, def.id);
      const result = await database.rateLimits.reserve({
        key,
        max: limit.max,
        windowMs: limit.windowMs,
        recipientId: recipient.id,
        tenantId: scope.tenantId,
        workspaceId: scope.workspaceId,
        notificationId: def.id,
      });
      if (!result.allowed) {
        const allChannels = [...new Set(def.channels.map((c) => c.type))];
        const skipped: SkippedDelivery[] = allChannels.map((ch) => ({
          channel: ch,
          reason: "rate_limited" as SkipReason,
          details: `Rate limit exceeded: ${limit.max} per ${limit.windowMs}ms`,
        }));
        const { notificationRecord, skippedRecords } = await createSkippedNotification({
          recipient, scope, def, payload, skipped, idempotencyKey: compositeIdempotencyKey,
        });
        recordTimeline(pending, { ...tlCtx, notificationRecordId: notificationRecord.id }, "rate_limited", `Rate limit exceeded: ${limit.max} per ${limit.windowMs}ms`, {
          metadata: { max: limit.max, windowMs: limit.windowMs, scope: rateLimitScope },
        });
        await runHook("notification.rate_limited", {
          notificationId: def.id,
          recipientId: recipient.id,
          limit,
        });
        return {
          notification: notificationRecord,
          inboxItems: [],
          deliveries: skippedRecords,
          skippedChannels: [],
          skipped,
          deferredChannels: [],
          digested: false,
          rateLimited: true,
          idempotent: false,
        };
      }
    }

    if (def.digest) {
      if (input.idempotencyKey) {
        warnIdempotencyKeyIgnoredForDigest(def.id);
      }
      const digest = def.digest;
      const groupKey =
        digest.key?.({
          recipientId: recipient.id,
          notificationId: def.id,
          payload: payload as never,
        }) ?? "default";
      const key = digestBucketKey(scope, recipient.id, def.id, groupKey);

      const entry = await database.digests.append({
        key,
        recipientId: recipient.id,
        tenantId: scope.tenantId,
        workspaceId: scope.workspaceId,
        notificationId: def.id,
        payload,
        windowMs: digest.windowMs,
      });

      if (!scheduledFlushes.has(key)) {
        const delay = Math.max(0, entry.flushAt.getTime() - Date.now());
        let resolveTask!: () => void;
        const task = new Promise<void>((resolve) => {
          resolveTask = resolve;
        });
        const timer = setTimeout(() => {
          const scheduled = scheduledFlushes.get(key);
          if (!scheduled) return;
          scheduledFlushes.delete(key);
          flushDigestKey(key, def)
            .catch((err) => { console.error("[notifykit] digest flush error:", err); })
            .finally(() => scheduled.resolve());
        }, delay);
        scheduledFlushes.set(key, { timer, resolve: resolveTask, def });
        pendingFlushes.add(task);
        task.finally(() => pendingFlushes.delete(task));
      }

      return {
        notification: null,
        inboxItems: [],
        deliveries: [],
        skippedChannels: [],
        skipped: [],
        deferredChannels: [],
        digested: true,
        rateLimited: false,
        idempotent: false,
      };
    }

    // Quiet hours: inbox still delivers immediately, email + webhook defer
    // until the window ends — but only if the channel is preference-allowed.
    const deferChannels: ChannelType[] = [];
    if (recipient.quietHours && isWithinQuietHours(recipient.quietHours)) {
      const deferSeen = new Set<ChannelType>();
      for (const ch of def.channels) {
        if ((ch.type === "email" || ch.type === "webhook" || ch.type === "sms") && !deferSeen.has(ch.type)) {
          const resolution = prefResult.channels.find((e) => e.channel === ch.type);
          if (resolution?.allowed) {
            deferSeen.add(ch.type);
            deferChannels.push(ch.type);
          }
        }
      }
    }

    if (deferChannels.length > 0) {
      const result = await deliver(pending, recipient, def, payload, { deferChannels, scope, prefResult, idempotencyKey: compositeIdempotencyKey });
      const scheduledFor = nextQuietHoursEnd(recipient.quietHours!);
      const record = await database.scheduledSends.create({
        recipientId: recipient.id,
        tenantId: scope.tenantId,
        workspaceId: scope.workspaceId,
        notificationId: def.id,
        notificationRecordId: result.notification?.id,
        payload,
        scheduledFor,
        reason: "quiet_hours",
      });
      scheduleDeferredFlush(record.id, scheduledFor);
      return result;
    }

    return deliver(pending, recipient, def, payload, { scope, prefResult, idempotencyKey: compositeIdempotencyKey });
  }

  async function explain(rawInput: SendInput<T>): Promise<DeliveryExplanation> {
    const input = rawInput as {
      recipientId: string;
      tenantId?: string;
      workspaceId?: string;
      notificationId: string;
      payload: unknown;
      idempotencyKey?: string;
      dedupeKey?: string;
      dedupeWindowMs?: number;
    };
    assertNonEmptyIdentifier(input.recipientId, "recipientId");
    const def = byId.get(input.notificationId);
    if (!def) {
      throw new NotifyKitError(
        `Unknown notification id: "${input.notificationId}".`,
        {
          code: "UNKNOWN_NOTIFICATION",
          notificationId: input.notificationId,
          fix: `Registered ids: ${[...byId.keys()].join(", ") || "(none)"}.`,
        },
      );
    }
    const recipient = await database.recipients.findById(input.recipientId);
    if (!recipient) {
      throw new NotifyKitError(
        `Unknown recipient: "${input.recipientId}".`,
        {
          code: "UNKNOWN_RECIPIENT",
          recipientId: input.recipientId,
          notificationId: input.notificationId,
          fix: "Call upsertRecipient({ id: \"...\", ... }) before calling explain().",
        },
      );
    }
    const scope = resolveScope(input, recipient);

    if (input.idempotencyKey && input.idempotencyKey.length > 256) {
      throw new NotifyKitError(
        "idempotencyKey must be 256 characters or fewer.",
        { code: "INVALID_INPUT", field: "idempotencyKey", fix: "Shorten the idempotencyKey to 256 characters or fewer." },
      );
    }
    if (input.dedupeKey) {
      if (!input.dedupeWindowMs || input.dedupeWindowMs <= 0) {
        throw new NotifyKitError(
          "dedupeWindowMs is required and must be positive when dedupeKey is set.",
          { code: "INVALID_INPUT", field: "dedupeWindowMs", fix: "Pass a positive dedupeWindowMs (e.g. 3600000 for 1 hour)." },
        );
      }
      const MAX_DEDUPE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
      if (input.dedupeWindowMs > MAX_DEDUPE_WINDOW_MS) {
        throw new NotifyKitError(
          "dedupeWindowMs must be 30 days or fewer.",
          { code: "INVALID_INPUT", field: "dedupeWindowMs", fix: "Pass a dedupeWindowMs of 2592000000 (30 days) or less." },
        );
      }
      if (input.dedupeKey.length > 256) {
        throw new NotifyKitError(
          "dedupeKey must be 256 characters or fewer.",
          { code: "INVALID_INPUT", field: "dedupeKey", fix: "Shorten the dedupeKey to 256 characters or fewer." },
        );
      }
    }

    let payloadValidation: PayloadValidationResult;
    if (def.validate) {
      try {
        const result = def.validate(input.payload);
        if (!result || typeof result !== "object" || Array.isArray(result)) {
          payloadValidation = {
            valid: false,
            fields: [{
              key: "(root)",
              expected: "object",
              actual: result === null ? "null" : Array.isArray(result) ? "array" : typeof result,
              message: "Custom validator must return a plain object.",
            }],
          };
        } else {
          payloadValidation = PAYLOAD_VALID;
        }
      } catch (err: unknown) {
        const errFields = err instanceof Error && "fields" in err
          ? (err as Record<string, unknown>).fields
          : undefined;
        const fields: PayloadFieldError[] = Array.isArray(errFields)
          ? errFields as PayloadFieldError[]
          : [{
              key: "(root)",
              expected: "valid",
              actual: "invalid",
              message: err instanceof Error ? err.message : String(err),
            }];
        payloadValidation = { valid: false, fields };
      }
    } else {
      payloadValidation = checkPayload(def.payload, input.payload);
    }

    let wouldReplayIdempotent = false;
    let idempotencyInfo: DeliveryExplanation["idempotency"] = null;
    let wouldRateLimit = false;
    let rateLimitInfo: DeliveryExplanation["rateLimit"] = null;
    let wouldDeduplicate = false;
    let dedupeInfo: DeliveryExplanation["dedupe"] = null;

    if (payloadValidation.valid) {
      if (input.idempotencyKey) {
        const ttl = config.idempotencyKeyTtlMs ?? 24 * 60 * 60 * 1000;
        const compositeKey = idempotencyCompositeKey(input.idempotencyKey, input.notificationId, input.recipientId);
        const existing = await database.notifications.findByIdempotencyKey(compositeKey);
        if (existing) {
          const age = Date.now() - existing.createdAt.getTime();
          if (age < ttl) {
            wouldReplayIdempotent = true;
            idempotencyInfo = { key: input.idempotencyKey, existingNotificationId: existing.id, ttlMs: ttl };
          }
        }
      }

      if (def.rateLimit) {
        const limit = def.rateLimit;
        const rateLimitScope = limit.scope ?? "recipient";
        const key =
          rateLimitScope === "global"
            ? scopedStorageKey(scope, def.id)
            : scopedStorageKey(scope, recipient.id, def.id);
        const current = await database.rateLimits.count({
          key,
          windowMs: limit.windowMs,
        });
        wouldRateLimit = current >= limit.max;
        rateLimitInfo = { current, max: limit.max, windowMs: limit.windowMs };
      }

      if (input.dedupeKey && input.dedupeWindowMs && input.dedupeWindowMs > 0) {
        dedupeInfo = { key: input.dedupeKey, windowMs: input.dedupeWindowMs };
        const dedupeCompositeKey = buildDedupeCompositeKey(def.id, recipient.id, input.dedupeKey);
        wouldDeduplicate = await database.dedupe.exists(dedupeCompositeKey);
      }
    }

    const prefExplanation = resolvePreferences(
      await buildResolutionCtx(recipient, def, scope),
    );

    const wouldDigest = !!def.digest;
    const digestInfo: DeliveryExplanation["digest"] = def.digest
      ? { windowMs: def.digest.windowMs }
      : null;

    let quietHoursActive = false;
    let quietHoursResumesAt: Date | null = null;
    let quietHoursInfo: DeliveryExplanation["quietHours"] = null;
    if (recipient.quietHours) {
      quietHoursActive = isWithinQuietHours(recipient.quietHours);
      quietHoursResumesAt = quietHoursActive
        ? nextQuietHoursEnd(recipient.quietHours)
        : null;
      quietHoursInfo = { active: quietHoursActive, resumesAt: quietHoursResumesAt };
    }

    const channels = prefExplanation.channels.map((ch) => {
      let outcome: ChannelOutcome;
      if (!ch.allowed) {
        outcome = ch.resolvedBy === "destination_unavailable"
          ? "unavailable"
          : "disabled";
      } else if (!payloadValidation.valid) {
        outcome = "invalid_payload";
      } else if (wouldReplayIdempotent) {
        outcome = "idempotent";
      } else if (wouldDeduplicate) {
        outcome = "deduplicated";
      } else if (wouldRateLimit) {
        outcome = "rate_limited";
      } else if (wouldDigest) {
        outcome = "digested";
      } else if (
        quietHoursActive &&
        (ch.channel === "email" || ch.channel === "webhook" || ch.channel === "sms")
      ) {
        outcome = "delayed";
      } else {
        outcome = "deliver";
      }
      return { ...ch, outcome };
    });

    return {
      recipientId: recipient.id,
      notificationId: def.id,
      scope,
      channels,
      required: def.required ?? false,
      classification: def.classification,
      category: def.category,
      payloadValidation,
      wouldReplayIdempotent,
      wouldDeduplicate,
      wouldRateLimit,
      wouldDigest,
      idempotency: idempotencyInfo,
      dedupe: dedupeInfo,
      rateLimit: rateLimitInfo,
      digest: digestInfo,
      quietHours: quietHoursInfo,
    };
  }

  function scheduleDeferredFlush(id: string, scheduledFor: Date): void {
    if (scheduledSendTimers.has(id)) return;
    const delay = Math.max(0, scheduledFor.getTime() - Date.now());
    let resolveTask!: () => void;
    const task = new Promise<void>((resolve) => {
      resolveTask = resolve;
    });
    const timer = setTimeout(() => {
      const entry = scheduledSendTimers.get(id);
      if (!entry) return;
      scheduledSendTimers.delete(id);
      flushScheduledSend(id)
        .catch((err) => { console.error("[notifykit] scheduled send flush error:", err); })
        .finally(() => entry.resolve());
    }, delay);
    scheduledSendTimers.set(id, { timer, resolve: resolveTask, scheduledFor });
    pendingFlushes.add(task);
    task.finally(() => pendingFlushes.delete(task));
  }

  async function flushScheduledSend(id: string): Promise<void> {
    // Claim first — if we can't (already claimed / already completed / gone)
    // just bail. This makes concurrent flushers safe and keeps the row
    // around until we confirm delivery succeeded.
    const record = await database.scheduledSends.claim(id);
    if (!record) return;
    const def = byId.get(record.notificationId);
    if (!def) {
      await database.scheduledSends.complete(id);
      return;
    }
    const recipient = await database.recipients.findById(record.recipientId);
    if (!recipient) {
      await database.scheduledSends.complete(id);
      return;
    }
    const scope = resolveScope(record, recipient);
    const payload = def.validate
      ? record.payload
      : validatePayload(def.payload, record.payload, def.id);
    const existingNotification = record.notificationRecordId
      ? {
          id: record.notificationRecordId,
          recipientId: record.recipientId,
          tenantId: record.tenantId,
          workspaceId: record.workspaceId,
          notificationId: record.notificationId,
          payload,
          createdAt: record.createdAt,
        }
      : undefined;
    const scheduledPending: TimelineBuffer = [];
    try {
      await deliver(scheduledPending, recipient, def, payload, {
        onlyChannels: ["email", "webhook", "sms"],
        scope,
        existingNotification,
      });
      await database.scheduledSends.complete(id);
    } catch (err) {
      await database.scheduledSends.release(id).catch((releaseErr) => {
        console.error("[notifykit] scheduled send release failed:", releaseErr);
      });
      throw err;
    } finally {
      await flushTimeline(scheduledPending);
    }
  }

  const MAX_DIGEST_RETRIES = 3;

  async function flushDigestKey(
    key: string,
    def: NotificationDefinition<string, PayloadSchema>,
    retryCount = 0,
  ): Promise<void> {
    const entry = await database.digests.take(key);
    if (!entry) return;
    try {
      if (!def.digest) {
        throw new NotifyKitError(
          `Notification "${def.id}" has no digest config but a digest flush was triggered.`,
          { code: "MISSING_DIGEST_CONFIG", notificationId: def.id },
        );
      }

      const recipient = await database.recipients.findById(entry.recipientId);
      if (!recipient) {
        throw new NotifyKitError(
          `Cannot flush digest "${key}": recipient "${entry.recipientId}" no longer exists.`,
          { code: "UNKNOWN_RECIPIENT", recipientId: entry.recipientId, notificationId: def.id },
        );
      }
      const scope = resolveScope(entry, recipient);

      const combined = def.digest.render({
        recipientId: entry.recipientId,
        notificationId: entry.notificationId,
        payloads: entry.payloads as never,
        count: entry.payloads.length,
      });
      if (!combined || typeof combined !== "object" || Array.isArray(combined)) {
        throw new NotifyKitError(
          `Digest render for "${def.id}" must return a plain object, got ${combined === null ? "null" : typeof combined}.`,
          { code: "INVALID_DIGEST_RENDER", notificationId: def.id },
        );
      }

      const validated = def.validate
        ? def.validate(combined)
        : validatePayload(def.payload, combined as Record<string, unknown>, def.id);
      if (!validated || typeof validated !== "object" || Array.isArray(validated)) {
        throw new NotifyKitError(
          `Custom validate for "${def.id}" must return a plain object, got ${validated === null ? "null" : typeof validated}.`,
          { code: "INVALID_VALIDATE_RETURN", notificationId: def.id },
        );
      }

      const resolutionCtx = await buildResolutionCtx(recipient, def, scope);
      const prefResult = resolvePreferences(resolutionCtx);

      const deferChannels: ChannelType[] = [];
      if (recipient.quietHours && isWithinQuietHours(recipient.quietHours)) {
        const deferSeen = new Set<ChannelType>();
        for (const ch of def.channels) {
          if ((ch.type === "email" || ch.type === "webhook" || ch.type === "sms") && !deferSeen.has(ch.type)) {
            const resolution = prefResult.channels.find((e) => e.channel === ch.type);
            if (resolution?.allowed) {
              deferSeen.add(ch.type);
              deferChannels.push(ch.type);
            }
          }
        }
      }

      const digestPending: TimelineBuffer = [];
      try {
        if (deferChannels.length > 0) {
          const result = await deliver(digestPending, recipient, def, validated, { deferChannels, scope, prefResult });
          const scheduledFor = nextQuietHoursEnd(recipient.quietHours!);
          const record = await database.scheduledSends.create({
            recipientId: recipient.id,
            tenantId: scope.tenantId,
            workspaceId: scope.workspaceId,
            notificationId: def.id,
            notificationRecordId: result.notification?.id,
            payload: validated,
            scheduledFor,
            reason: "quiet_hours",
          });
          scheduleDeferredFlush(record.id, scheduledFor);
          return;
        }

        await deliver(digestPending, recipient, def, validated, { scope, prefResult });
      } finally {
        await flushTimeline(digestPending);
      }
    } catch (err) {
      const permanent =
        err instanceof NotifyKitError &&
        (err.code === "UNKNOWN_RECIPIENT" ||
          err.code === "MISSING_DIGEST_CONFIG" ||
          err.code === "INVALID_DIGEST_RENDER" ||
          err.code === "INVALID_VALIDATE_RETURN");
      const retryable =
        !permanent &&
        !(err instanceof NotifyKitError && err.code === "PAYLOAD_VALIDATION_ERROR");
      if (!permanent) {
        await database.digests.restore(entry);
      }
      if (retryable && retryCount < MAX_DIGEST_RETRIES && !closing && !scheduledFlushes.has(key)) {
        const retryDelay = 30_000;
        let resolveTask!: () => void;
        const task = new Promise<void>((resolve) => {
          resolveTask = resolve;
        });
        const timer = setTimeout(() => {
          const scheduled = scheduledFlushes.get(key);
          if (!scheduled) return;
          scheduledFlushes.delete(key);
          flushDigestKey(key, def, retryCount + 1)
            .catch((retryErr) => { console.error("[notifykit] digest retry flush error:", retryErr); })
            .finally(() => scheduled.resolve());
        }, retryDelay);
        scheduledFlushes.set(key, { timer, resolve: resolveTask, def });
        pendingFlushes.add(task);
        task.finally(() => pendingFlushes.delete(task));
      }
      throw err;
    }
  }

  function isLegacyFallback(
    fb: InboxChannelConfig | FallbackRule[],
  ): fb is InboxChannelConfig {
    return !Array.isArray(fb);
  }

  function matchFallbackRules(
    rules: FallbackRule[],
    trigger: FallbackTrigger,
    fromChannel: ChannelType,
    alreadyAttempted: Set<ChannelType>,
  ): FallbackRule | null {
    for (const rule of rules) {
      if (rule.if !== trigger) continue;
      if (rule.from && rule.from !== fromChannel) continue;
      if (alreadyAttempted.has(rule.then.type)) continue;
      return rule;
    }
    return null;
  }

  async function enqueueOrRun(job: DeliveryJob, insideQueue: boolean, parentBuffer?: TimelineBuffer): Promise<void> {
    if (insideQueue) {
      await processDeliveryJob(job, parentBuffer);
    } else {
      if (parentBuffer) await flushTimeline(parentBuffer);
      await queue.enqueue(job, (j) => processDeliveryJob(j));
    }
  }

  async function executeFallbackChannel(
    ch: ChannelConfig,
    ctx: {
      notificationRecordId: string;
      recipientId: string;
      tenantId?: string;
      workspaceId?: string;
      notificationId: string;
      payload: Record<string, unknown>;
      insideQueue?: boolean;
      timelineBuffer?: TimelineBuffer;
    },
  ): Promise<{ inboxItem?: InboxItem; delivery?: DeliveryRecord }> {
    const scope: SecurityScope = { tenantId: ctx.tenantId, workspaceId: ctx.workspaceId };
    const def = byId.get(ctx.notificationId);
    if (!def) {
      console.error(`[notifykit] fallback: unknown notification "${ctx.notificationId}"`);
      return {};
    }
    const recipient = await database.recipients.findById(ctx.recipientId);
    if (!recipient) {
      console.error(`[notifykit] fallback: recipient "${ctx.recipientId}" not found`);
      return {};
    }

    const resCtx = await buildResolutionCtx(recipient, def, scope);
    const resolution = resolveChannel(ch.type, resCtx);
    if (!resolution.allowed) return {};

    if (ch.type === "inbox") {
      const item = await database.inbox.create({
        notificationRecordId: ctx.notificationRecordId,
        recipientId: ctx.recipientId,
        tenantId: ctx.tenantId,
        workspaceId: ctx.workspaceId,
        notificationId: ctx.notificationId,
        title: renderTemplate(ch.title, ctx.payload, { escapeHtml: true }),
        body: ch.body !== undefined
          ? renderTemplate(ch.body, ctx.payload, { escapeHtml: true })
          : undefined,
        actionUrl: ch.actionUrl !== undefined
          ? sanitizeActionUrl(renderTemplate(ch.actionUrl, ctx.payload, { escapeHtml: false }))
          : undefined,
      });
      await runHook("inbox.created", { inboxItem: item });
      await publishRealtime(ctx.recipientId, scope, {
        type: "inbox.created",
        item,
      });
      return { inboxItem: item };
    }

    if (ch.type === "email") {
      const provider = providers?.email;
      if (!provider || !recipient.email) return {};
      const renderCtx: Record<string, unknown> = { ...ctx.payload };
      if (unsubscribeConfig) {
        renderCtx._unsubscribeUrl = buildUnsubscribeUrl(recipient, def.id, scope);
      }
      const isHtml = ch.html !== false;
      const subject = renderTemplate(ch.subject, renderCtx, { escapeHtml: false });
      const body = renderTemplate(ch.body, renderCtx, { escapeHtml: isHtml });
      const delivery = await database.deliveries.create({
        notificationRecordId: ctx.notificationRecordId,
        recipientId: ctx.recipientId,
        tenantId: ctx.tenantId,
        workspaceId: ctx.workspaceId,
        notificationId: ctx.notificationId,
        channel: "email",
        provider: provider.id,
        status: "pending",
        to: recipient.email,
        subject,
        body,
        attempts: 0,
      });
      fallbackDeliveryIds.add(delivery.id);
      const job: DeliveryJob = {
        deliveryId: delivery.id,
        notificationRecordId: ctx.notificationRecordId,
        recipientId: ctx.recipientId,
        tenantId: ctx.tenantId,
        workspaceId: ctx.workspaceId,
        notificationId: ctx.notificationId,
        channel: "email",
        provider: provider.id,
        to: recipient.email,
        subject,
        body,
        payload: ctx.payload,
      };
      await enqueueOrRun(job, !!ctx.insideQueue, ctx.timelineBuffer);
      const latest = await database.deliveries.findById(delivery.id);
      return { delivery: latest ?? delivery };
    }

    if (ch.type === "webhook") {
      const provider = providers?.webhook;
      if (!provider) return {};
      const url = renderTemplate(ch.url, ctx.payload, { encodeUri: true });
      const { pinnedUrl, hostHeader } = await assertSafeWebhookUrl(url);
      const headers: Record<string, string> = { host: hostHeader };
      if (ch.headers) {
        for (const [k, v] of Object.entries(ch.headers)) {
          if (k.toLowerCase() === "host") continue;
          headers[k] = renderTemplate(v, ctx.payload, { escapeHtml: false }).replace(/[\r\n]/g, "");
        }
      }
      const delivery = await database.deliveries.create({
        notificationRecordId: ctx.notificationRecordId,
        recipientId: ctx.recipientId,
        tenantId: ctx.tenantId,
        workspaceId: ctx.workspaceId,
        notificationId: ctx.notificationId,
        channel: "webhook",
        provider: provider.id,
        status: "pending",
        to: url,
        body: JSON.stringify(ctx.payload),
        attempts: 0,
      });
      fallbackDeliveryIds.add(delivery.id);
      const job: DeliveryJob = {
        deliveryId: delivery.id,
        notificationRecordId: ctx.notificationRecordId,
        recipientId: ctx.recipientId,
        tenantId: ctx.tenantId,
        workspaceId: ctx.workspaceId,
        notificationId: ctx.notificationId,
        channel: "webhook",
        provider: provider.id,
        url: pinnedUrl,
        headers,
        payload: ctx.payload,
      };
      await enqueueOrRun(job, !!ctx.insideQueue, ctx.timelineBuffer);
      const latest = await database.deliveries.findById(delivery.id);
      return { delivery: latest ?? delivery };
    }

    if (ch.type === "sms") {
      const provider = providers?.sms;
      if (!provider || !recipient.phone) return {};
      const body = renderTemplate(ch.body, ctx.payload, { escapeHtml: false });
      const delivery = await database.deliveries.create({
        notificationRecordId: ctx.notificationRecordId,
        recipientId: ctx.recipientId,
        tenantId: ctx.tenantId,
        workspaceId: ctx.workspaceId,
        notificationId: ctx.notificationId,
        channel: "sms",
        provider: provider.id,
        status: "pending",
        to: recipient.phone,
        body,
        attempts: 0,
      });
      fallbackDeliveryIds.add(delivery.id);
      const job: DeliveryJob = {
        deliveryId: delivery.id,
        notificationRecordId: ctx.notificationRecordId,
        recipientId: ctx.recipientId,
        tenantId: ctx.tenantId,
        workspaceId: ctx.workspaceId,
        notificationId: ctx.notificationId,
        channel: "sms",
        provider: provider.id,
        to: recipient.phone,
        body,
        payload: ctx.payload,
      };
      await enqueueOrRun(job, !!ctx.insideQueue, ctx.timelineBuffer);
      const latest = await database.deliveries.findById(delivery.id);
      return { delivery: latest ?? delivery };
    }

    return {};
  }

  type DeliverOptions = {
    scope?: SecurityScope;
    /**
     * Channels to defer (not execute). Reported as `deferredChannels` on the
     * returned SendResult. Used by quiet-hours to run the inbox write now
     * while deferring email/push until the window ends.
     */
    deferChannels?: ChannelType[];
    /**
     * When `true`, reuse an already-created notification record rather than
     * creating a new one. Used by the scheduled-send flusher so a deferred
     * email doesn't double-log the notification. Defaults to false.
     */
    existingNotification?: NotificationRecord;
    /** When false, skip channels whose type isn't in this set. */
    onlyChannels?: ChannelType[];
    /** Pre-resolved preference result from send(). Avoids re-fetching. */
    prefResult?: PreferenceExplanation;
    /** Composite idempotency key to store on the notification record. */
    idempotencyKey?: string;
  };

  async function deliver(
    pending: TimelineBuffer,
    recipient: Recipient,
    def: NotificationDefinition<string, PayloadSchema>,
    payload: Record<string, unknown>,
    options: DeliverOptions = {},
  ): Promise<SendResult> {
    const scope = options.scope ?? resolveScope({}, recipient);

    const explanation = options.prefResult
      ?? resolvePreferences(await buildResolutionCtx(recipient, def, scope));
    const isChannelAllowed = (type: ChannelType): boolean => {
      const entry = explanation.channels.find((e) => e.channel === type);
      return entry?.allowed ?? false;
    };

    const deferSet = new Set(options.deferChannels ?? []);
    const onlySet = options.onlyChannels
      ? new Set(options.onlyChannels)
      : null;

    const notificationRecord =
      options.existingNotification ??
      (await database.notifications.create({
        recipientId: recipient.id,
        tenantId: scope.tenantId,
        workspaceId: scope.workspaceId,
        notificationId: def.id,
        payload,
        payloadSchema: { ...def.payload },
        definitionVersion: def.version,
        idempotencyKey: options.idempotencyKey,
      }));
    if (!options.existingNotification) {
      await runHook("notification.created", {
        notification: notificationRecord,
        redactedPayload: redactForDef(def, notificationRecord.payload),
      });
    }

    const deliverTlCtx = {
      notificationRecordId: notificationRecord.id,
      recipientId: recipient.id,
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      notificationId: def.id,
    };
    if (!options.existingNotification) {
      recordTimeline(pending, deliverTlCtx, "payload.validated", "Payload validated successfully");
      recordTimeline(pending, deliverTlCtx, "recipient.resolved", `Recipient "${recipient.id}" resolved`, {
        metadata: { email: recipient.email ? "present" : "absent", phone: recipient.phone ? "present" : "absent" },
      });
      recordTimeline(pending, deliverTlCtx, "preferences.resolved", `Preference resolution complete: ${explanation.channels.filter((c) => c.allowed).map((c) => c.channel).join(", ") || "none"} enabled`);
    }

    const inboxItems: InboxItem[] = [];
    const deliveries: DeliveryRecord[] = [];
    const skippedChannels: ChannelType[] = [];
    const skipped: SkippedDelivery[] = [];
    const deferredChannels: ChannelType[] = [];
    const pendingFallbacks: Array<{ trigger: FallbackTrigger; fromChannel: ChannelType }> = [];
    const pendingSkips: Array<{ channel: ChannelType; reason: SkipReason; details?: string }> = [];

    const queueSkip = (channel: ChannelType, reason: SkipReason, details?: string) => {
      skipped.push({ channel, reason, details });
      pendingSkips.push({ channel, reason, details });
    };

    for (const ch of def.channels) {
      if (onlySet && !onlySet.has(ch.type)) continue;
      if (deferSet.has(ch.type)) {
        deferredChannels.push(ch.type);
        pendingSkips.push({ channel: ch.type, reason: "quiet_hours_deferred", details: "Deferred until quiet hours end" });
        recordTimeline(pending, deliverTlCtx, "quiet_hours.deferred", `Channel "${ch.type}" deferred until quiet hours end`, { channel: ch.type });
        continue;
      }
      if (!isChannelAllowed(ch.type)) {
        skippedChannels.push(ch.type);
        const entry = explanation.channels.find((e) => e.channel === ch.type);
        const skipReason = resolvedByToSkipReason(entry?.resolvedBy);
        const skipDetails = entry?.reason;
        queueSkip(ch.type, skipReason, skipDetails);
        recordTimeline(pending, deliverTlCtx, "channel.skipped", `Channel "${ch.type}" skipped: ${skipDetails ?? skipReason}`, {
          channel: ch.type,
          metadata: { reason: skipReason, details: skipDetails },
        });
        if (def.fallback && !isLegacyFallback(def.fallback)) {
          const trigger: FallbackTrigger =
            entry?.resolvedBy === "destination_unavailable"
              ? "missing_address"
              : "skipped";
          pendingFallbacks.push({ trigger, fromChannel: ch.type });
        }
        continue;
      }
      if (ch.type === "inbox") {
        const item = await database.inbox.create({
          notificationRecordId: notificationRecord.id,
          recipientId: recipient.id,
          tenantId: scope.tenantId,
          workspaceId: scope.workspaceId,
          notificationId: def.id,
          title: renderTemplate(ch.title, payload, { escapeHtml: true }),
          body: ch.body !== undefined ? renderTemplate(ch.body, payload, { escapeHtml: true }) : undefined,
          actionUrl: ch.actionUrl !== undefined
            ? sanitizeActionUrl(renderTemplate(ch.actionUrl, payload, { escapeHtml: false }))
            : undefined,
        });
        inboxItems.push(item);
        recordTimeline(pending, deliverTlCtx, "inbox.created", `Inbox item created: "${item.title}"`, { channel: "inbox" });
        await runHook("inbox.created", { inboxItem: item });
        await publishRealtime(recipient.id, scope, {
          type: "inbox.created",
          item,
        });
      } else if (ch.type === "email") {
        // Startup validation guarantees providers.email exists for any
        // notification that declares an email channel.
        const provider = providers!.email!;
        if (!recipient.email) {
          skippedChannels.push("email");
          queueSkip("email", "missing_address", "Recipient has no email address");
          recordTimeline(pending, deliverTlCtx, "channel.skipped", `Channel "email" skipped: recipient has no email address`, { channel: "email", metadata: { reason: "missing_address" } });
          if (def.fallback && !isLegacyFallback(def.fallback)) {
            pendingFallbacks.push({ trigger: "missing_address", fromChannel: "email" });
          }
          continue;
        }

        const renderCtx: Record<string, unknown> = { ...payload };
        if (unsubscribeConfig) {
          renderCtx._unsubscribeUrl = buildUnsubscribeUrl(
            recipient,
            def.id,
            scope,
          );
        }
        const isHtml = ch.html !== false;
        const subject = renderTemplate(ch.subject, renderCtx, { escapeHtml: false });
        const body = renderTemplate(ch.body, renderCtx, { escapeHtml: isHtml });

        const delivery = await database.deliveries.create({
          notificationRecordId: notificationRecord.id,
          recipientId: recipient.id,
          tenantId: scope.tenantId,
          workspaceId: scope.workspaceId,
          notificationId: def.id,
          channel: "email",
          provider: provider.id,
          status: "pending",
          to: recipient.email,
          subject,
          body,
          attempts: 0,
        });
        recordTimeline(pending, deliverTlCtx, "delivery.created", `Email delivery created via ${provider.id}`, { deliveryId: delivery.id, channel: "email", provider: provider.id });

        const job: DeliveryJob = {
          deliveryId: delivery.id,
          notificationRecordId: notificationRecord.id,
          recipientId: recipient.id,
          tenantId: scope.tenantId,
          workspaceId: scope.workspaceId,
          notificationId: def.id,
          channel: "email",
          provider: provider.id,
          to: recipient.email,
          subject,
          body,
          payload,
        };

        await flushTimeline(pending);
        await queue.enqueue(job, (j) => processDeliveryJob(j));

        // Re-read after enqueue so inline queues return final state; async
        // queues return "pending" here (callers use drain() + deliveries.list).
        const latest = await database.deliveries.findById(delivery.id);
        deliveries.push(latest ?? delivery);
      } else if (ch.type === "webhook") {
        // Startup validation guarantees providers.webhook exists for any
        // notification that declares a webhook channel.
        const provider = providers!.webhook!;

        const url = renderTemplate(ch.url, payload, { encodeUri: true });
        const { pinnedUrl, hostHeader } = await assertSafeWebhookUrl(url);
        const headers: Record<string, string> = { host: hostHeader };
        if (ch.headers) {
          for (const [k, v] of Object.entries(ch.headers)) {
            if (k.toLowerCase() === "host") continue;
            headers[k] = renderTemplate(v, payload, { escapeHtml: false }).replace(/[\r\n]/g, "");
          }
        }

        const delivery = await database.deliveries.create({
          notificationRecordId: notificationRecord.id,
          recipientId: recipient.id,
          tenantId: scope.tenantId,
          workspaceId: scope.workspaceId,
          notificationId: def.id,
          channel: "webhook",
          provider: provider.id,
          status: "pending",
          to: url,
          body: JSON.stringify(payload),
          attempts: 0,
        });
        recordTimeline(pending, deliverTlCtx, "delivery.created", `Webhook delivery created via ${provider.id}`, { deliveryId: delivery.id, channel: "webhook", provider: provider.id });

        const job: DeliveryJob = {
          deliveryId: delivery.id,
          notificationRecordId: notificationRecord.id,
          recipientId: recipient.id,
          tenantId: scope.tenantId,
          workspaceId: scope.workspaceId,
          notificationId: def.id,
          channel: "webhook",
          provider: provider.id,
          url: pinnedUrl,
          headers,
          payload,
        };

        await flushTimeline(pending);
        await queue.enqueue(job, (j) => processDeliveryJob(j));

        const latest = await database.deliveries.findById(delivery.id);
        deliveries.push(latest ?? delivery);
      } else if (ch.type === "sms") {
        const provider = providers!.sms!;
        if (!recipient.phone) {
          skippedChannels.push("sms");
          queueSkip("sms", "missing_address", "Recipient has no phone number");
          recordTimeline(pending, deliverTlCtx, "channel.skipped", `Channel "sms" skipped: recipient has no phone number`, { channel: "sms", metadata: { reason: "missing_address" } });
          if (def.fallback && !isLegacyFallback(def.fallback)) {
            pendingFallbacks.push({ trigger: "missing_address", fromChannel: "sms" });
          }
          continue;
        }

        const body = renderTemplate(ch.body, payload, { escapeHtml: false });

        const delivery = await database.deliveries.create({
          notificationRecordId: notificationRecord.id,
          recipientId: recipient.id,
          tenantId: scope.tenantId,
          workspaceId: scope.workspaceId,
          notificationId: def.id,
          channel: "sms",
          provider: provider.id,
          status: "pending",
          to: recipient.phone,
          body,
          attempts: 0,
        });
        recordTimeline(pending, deliverTlCtx, "delivery.created", `SMS delivery created via ${provider.id}`, { deliveryId: delivery.id, channel: "sms", provider: provider.id });

        const job: DeliveryJob = {
          deliveryId: delivery.id,
          notificationRecordId: notificationRecord.id,
          recipientId: recipient.id,
          tenantId: scope.tenantId,
          workspaceId: scope.workspaceId,
          notificationId: def.id,
          channel: "sms",
          provider: provider.id,
          to: recipient.phone,
          body,
          payload,
        };

        await flushTimeline(pending);
        await queue.enqueue(job, (j) => processDeliveryJob(j));

        const latest = await database.deliveries.findById(delivery.id);
        deliveries.push(latest ?? delivery);
      }
    }

    if (pendingSkips.length > 0) {
      const skippedRecords = await Promise.all(pendingSkips.map((s) => persistSkip({
        notificationRecordId: notificationRecord.id,
        recipientId: recipient.id,
        tenantId: scope.tenantId,
        workspaceId: scope.workspaceId,
        notificationId: def.id,
        channel: s.channel,
        reason: s.reason,
        details: s.details,
      })));
      deliveries.push(...skippedRecords);
    }

    if (pendingFallbacks.length > 0 && def.fallback && !isLegacyFallback(def.fallback)) {
      const attempted = new Set<ChannelType>(
        def.channels.map((c) => c.type),
      );
      const fallbackCtx = {
        notificationRecordId: notificationRecord.id,
        recipientId: recipient.id,
        tenantId: scope.tenantId,
        workspaceId: scope.workspaceId,
        notificationId: def.id,
        payload,
        timelineBuffer: pending,
      };
      for (const pf of pendingFallbacks) {
        const rule = matchFallbackRules(def.fallback, pf.trigger, pf.fromChannel, attempted);
        if (!rule) continue;
        attempted.add(rule.then.type);
        recordTimeline(pending, deliverTlCtx, "fallback.triggered", `Fallback to "${rule.then.type}" triggered by "${pf.trigger}" on "${pf.fromChannel}"`, {
          channel: rule.then.type,
          metadata: { trigger: pf.trigger, fromChannel: pf.fromChannel },
        });
        try {
          const result = await executeFallbackChannel(rule.then, fallbackCtx);
          if (result.inboxItem) inboxItems.push(result.inboxItem);
          if (result.delivery) deliveries.push(result.delivery);
        } catch (err) {
          console.error("[notifykit] fallback channel error:", err);
        }
      }
    }

    return {
      notification: notificationRecord,
      inboxItems,
      deliveries,
      skippedChannels,
      skipped,
      deferredChannels,
      digested: false,
      rateLimited: false,
      idempotent: false,
    };
  }

  function isPermanentError(err: Error): boolean {
    return "permanent" in err && (err as Error & { permanent: unknown }).permanent === true;
  }

  async function processDeliveryJob(job: DeliveryJob, parentBuffer?: TimelineBuffer): Promise<void> {
    const ownsBuffer = !parentBuffer;
    const jobPending: TimelineBuffer = parentBuffer ?? [];
    const jobTlCtx = {
      notificationRecordId: job.notificationRecordId,
      recipientId: job.recipientId,
      tenantId: job.tenantId,
      workspaceId: job.workspaceId,
      notificationId: job.notificationId,
    };
    try {
      let lastError: Error | null = null;
      let attemptsMade = 0;
      for (let attempt = 1; attempt <= retry.maxAttempts; attempt++) {
        attemptsMade = attempt;
        if (attempt > 1) {
          let wait: number;
          try {
            wait = retry.delayMs(attempt);
            if (!Number.isFinite(wait) || wait < 0) {
              throw new NotifyKitError(
                `retry.delayMs(${attempt}) must return a non-negative finite number, got ${wait}.`,
                {
                  code: "INVALID_RETRY_DELAY",
                  field: "retry.delayMs",
                  fix: "Return a non-negative millisecond delay for every retry attempt.",
                },
              );
            }
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            lastError = err instanceof NotifyKitError
              ? err
              : new NotifyKitError(
                `retry.delayMs(${attempt}) threw: ${message}`,
                {
                  code: "INVALID_RETRY_DELAY",
                  field: "retry.delayMs",
                  fix: "Ensure retry.delayMs returns a non-negative millisecond delay for every retry attempt.",
                },
              );
            attemptsMade = attempt - 1;
            break;
          }
          recordTimeline(jobPending, jobTlCtx, "delivery.attempt", `Retry attempt ${attempt}/${retry.maxAttempts} (delay: ${wait}ms)`, {
            deliveryId: job.deliveryId,
            channel: job.channel,
            provider: job.provider,
            metadata: { attempt, maxAttempts: retry.maxAttempts, delayMs: wait },
          });
          if (wait > 0) {
            await new Promise<void>((r) => setTimeout(r, wait));
          }
        }
        try {
          let result: { providerMessageId?: string };
          if (job.channel === "email") {
            const provider = providers!.email!;
            result = await provider.send({
              to: job.to,
              subject: job.subject,
              body: job.body,
            });
          } else if (job.channel === "webhook") {
            const provider = providers!.webhook!;
            result = await provider.send({
              url: job.url,
              headers: job.headers,
              payload: {
                notificationId: job.notificationId,
                recipientId: job.recipientId,
                tenantId: job.tenantId,
                workspaceId: job.workspaceId,
                payload: job.payload,
                sentAt: new Date().toISOString(),
              },
            });
          } else {
            const provider = providers!.sms!;
            result = await provider.send({
              to: job.to,
              body: job.body,
            });
          }

          const updated = await database.deliveries.update(job.deliveryId, {
            status: "sent",
            providerMessageId: result.providerMessageId,
            attempts: attempt,
            sentAt: new Date(),
            error: undefined,
          });
          recordTimeline(jobPending, jobTlCtx, "delivery.sent", `Delivery sent on attempt ${attempt}`, {
            deliveryId: job.deliveryId,
            channel: job.channel,
            provider: job.provider,
          });
          if (result.providerMessageId) {
            recordTimeline(jobPending, jobTlCtx, "provider.message_id_stored", `Provider message ID: ${result.providerMessageId}`, {
              deliveryId: job.deliveryId,
              channel: job.channel,
              provider: job.provider,
              metadata: { providerMessageId: result.providerMessageId },
            });
          }
          try {
            if (updated) {
              const jobDef = byId.get(job.notificationId);
              await runHook("delivery.sent", {
                delivery: updated,
                redactedPayload: jobDef
                  ? redactForDef(jobDef, job.payload)
                  : job.payload,
              });
            }
          } finally {
            fallbackDeliveryIds.delete(job.deliveryId);
          }
          return;
        } catch (err) {
          lastError = err instanceof Error ? err : new Error(String(err));
          recordTimeline(jobPending, jobTlCtx, "provider.error", `Provider error on attempt ${attempt}: ${lastError.message}`, {
            deliveryId: job.deliveryId,
            channel: job.channel,
            provider: job.provider,
            metadata: { attempt, error: lastError.message, permanent: isPermanentError(lastError) },
          });
          try {
            await database.deliveries.update(job.deliveryId, {
              attempts: attempt,
              error: lastError.message,
            });
          } catch (updateErr) {
            console.error("[notifykit] delivery attempt update error:", updateErr);
          }
          if (isPermanentError(lastError)) break;
        }
      }
      const failed = await database.deliveries.update(job.deliveryId, {
        status: "failed",
        attempts: attemptsMade,
        error: lastError?.message,
        failedAt: new Date(),
      });
      recordTimeline(jobPending, jobTlCtx, "delivery.failed", `Delivery failed after ${attemptsMade} attempt(s): ${lastError?.message ?? "unknown error"}`, {
        deliveryId: job.deliveryId,
        channel: job.channel,
        provider: job.provider,
        metadata: { attempts: attemptsMade, error: lastError?.message },
      });
      const isFallbackDelivery = fallbackDeliveryIds.has(job.deliveryId);
      fallbackDeliveryIds.delete(job.deliveryId);
      if (failed) {
        const failedDef = byId.get(job.notificationId);
        await runHook("delivery.failed", {
          delivery: failed,
          error: lastError ?? new Error("Delivery failed"),
          redactedPayload: failedDef
            ? redactForDef(failedDef, job.payload)
            : job.payload,
        });
      }

      if (isFallbackDelivery) return;

      const def = byId.get(job.notificationId);
      if (def?.fallback) {
        recordTimeline(jobPending, jobTlCtx, "fallback.triggered", `Fallback triggered after "${job.channel}" delivery failed`, {
          deliveryId: job.deliveryId,
          channel: job.channel,
          provider: job.provider,
          metadata: { trigger: "channel.failed" },
        });
        try {
          if (isLegacyFallback(def.fallback)) {
            const fallbackScope: SecurityScope = {
              tenantId: job.tenantId,
              workspaceId: job.workspaceId,
            };
            const fallbackRecipient = await database.recipients.findById(job.recipientId);
            const resCtx = await buildResolutionCtx(
              fallbackRecipient ?? { id: job.recipientId, createdAt: new Date(), updatedAt: new Date() },
              def,
              fallbackScope,
            );
            const inboxResolution = resolveChannel("inbox", resCtx);
            if (inboxResolution.allowed) {
              const fallback = def.fallback;
              const item = await database.inbox.create({
                notificationRecordId: job.notificationRecordId,
                recipientId: job.recipientId,
                tenantId: job.tenantId,
                workspaceId: job.workspaceId,
                notificationId: job.notificationId,
                title: renderTemplate(fallback.title, job.payload, { escapeHtml: true }),
                body:
                  fallback.body !== undefined
                    ? renderTemplate(fallback.body, job.payload, { escapeHtml: true })
                    : undefined,
                actionUrl: fallback.actionUrl !== undefined
                  ? sanitizeActionUrl(renderTemplate(fallback.actionUrl, job.payload, { escapeHtml: false }))
                  : undefined,
              });
              await runHook("inbox.created", { inboxItem: item });
              await publishRealtime(job.recipientId, fallbackScope, {
                type: "inbox.created",
                item,
              });
            }
          } else {
            const attempted = new Set<ChannelType>(
              def.channels.map((c) => c.type),
            );
            attempted.add(job.channel);
            const rule = matchFallbackRules(def.fallback, "channel.failed", job.channel, attempted);
            if (rule) {
              attempted.add(rule.then.type);
              await executeFallbackChannel(rule.then, {
                notificationRecordId: job.notificationRecordId,
                recipientId: job.recipientId,
                tenantId: job.tenantId,
                workspaceId: job.workspaceId,
                notificationId: job.notificationId,
                payload: job.payload,
                insideQueue: true,
                timelineBuffer: jobPending,
              });
            }
          }
        } catch (fallbackErr) {
          console.error("[notifykit] fallback after channel.failed error:", fallbackErr);
        }
      }
    } finally {
      if (ownsBuffer) await flushTimeline(jobPending);
    }
  }

  async function updatePreference(
    rawInput: UpdatePreferenceInput<T>,
  ): Promise<RecipientPreference> {
    const input = rawInput as UpdatePreferenceInput<
      readonly NotificationDefinition<string, PayloadSchema>[]
    >;
    if (!byId.has(input.notificationId)) {
      throw new NotifyKitError(
        `Unknown notification id: "${input.notificationId}".`,
        {
          code: "UNKNOWN_NOTIFICATION",
          notificationId: input.notificationId,
          fix: `Registered ids: ${[...byId.keys()].join(", ") || "(none)"}.`,
        },
      );
    }
    const recipient = await database.recipients.findById(input.recipientId);
    if (!recipient) {
      throw new NotifyKitError(
        `Unknown recipient: "${input.recipientId}".`,
        {
          code: "UNKNOWN_RECIPIENT",
          recipientId: input.recipientId,
          fix: "Call upsertRecipient({ id: \"...\", ... }) before updating preferences.",
        },
      );
    }
    const scope = resolveScope(input, recipient);
    return database.preferences.upsert({
      recipientId: input.recipientId,
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      notificationId: input.notificationId,
      channels: input.channels,
    });
  }

  async function getPreference(
    rawInput: GetPreferenceInput<T>,
  ): Promise<RecipientPreference | null> {
    const input = rawInput as GetPreferenceInput<
      readonly NotificationDefinition<string, PayloadSchema>[]
    >;
    const recipient = await database.recipients.findById(input.recipientId);
    if (!recipient) return null;
    const scope = resolveScope(input, recipient);
    return database.preferences.get(input.recipientId, input.notificationId, scope);
  }

  async function runFlushScheduledSends(options?: {
    force?: boolean;
  }): Promise<void> {
    const force = options?.force ?? true;
    const now = new Date();
    // Cancel in-memory timers that are eligible for this sweep. Forced flushes
    // intentionally bypass scheduledFor; recovery sweeps leave future timers
    // armed so periodic boot/recovery calls do not defeat quiet hours.
    const scheduled = Array.from(scheduledSendTimers.entries());
    for (const [id, entry] of scheduled) {
      if (!force && entry.scheduledFor.getTime() > now.getTime()) continue;
      clearTimeout(entry.timer);
      scheduledSendTimers.delete(id);
      await flushScheduledSend(id).catch(() => {});
      entry.resolve();
    }
    // Sweep stored rows. When force=false, only rows whose scheduledFor has
    // already passed — the correct recovery-on-boot semantic so future-dated
    // rows don't fire early.
    const leftover = force
      ? await database.scheduledSends.list()
      : await database.scheduledSends.listDue(now);
    for (const row of leftover) {
      // A claimed row from a crashed prior run stays claimed — skip it
      // rather than double-delivering. Operators wanting to recover stuck
      // claims should do so explicitly via release().
      if (row.status !== "pending") continue;
      await flushScheduledSend(row.id).catch(() => {});
    }
    if (force) {
      while (pendingFlushes.size > 0) {
        await Promise.all(Array.from(pendingFlushes));
      }
    }
    await queue.drain();
  }

  return {
    async upsertRecipient(input) {
      assertNonEmptyIdentifier(input.id, "id");
      if (input.quietHours != null) {
        const quietHoursError = validateQuietHours(input.quietHours);
        if (quietHoursError) {
          throw new NotifyKitError(
            `Invalid quietHours: ${quietHoursError}`,
            {
              code: "INVALID_QUIET_HOURS",
              field: "quietHours",
              fix: "Use { start: \"HH:MM\", end: \"HH:MM\", timezone?: \"Area/City\" }, or pass null to clear quiet hours.",
            },
          );
        }
      }
      const normalized = normalizeOrgId(input);
      const tenantId = normalized.tenantId;
      const workspaceId = normalized.workspaceId;
      const existing = await database.recipients.findById(input.id);
      if (existing && existing.tenantId && tenantId && existing.tenantId !== tenantId) {
        throw new NotifyKitError(
          `Recipient "${input.id}" already belongs to tenant "${existing.tenantId}", cannot reassign to "${tenantId}".`,
          {
            code: "TENANT_REASSIGNMENT",
            recipientId: input.id,
            fix: "Create a new recipient for the target tenant instead of reassigning an existing one.",
          },
        );
      }
      if (existing && existing.workspaceId && workspaceId && existing.workspaceId !== workspaceId) {
        throw new NotifyKitError(
          `Recipient "${input.id}" already belongs to workspace "${existing.workspaceId}", cannot reassign to "${workspaceId}".`,
          {
            code: "WORKSPACE_REASSIGNMENT",
            recipientId: input.id,
            fix: "Create a new recipient for the target workspace instead of reassigning an existing one.",
          },
        );
      }
      return database.recipients.upsert({
        ...input,
        tenantId,
        organizationId: undefined,
      });
    },
    send(input: SendInput<T> & { dryRun?: boolean }): any {
      if (input.dryRun) {
        return explain(input) satisfies Promise<DeliveryExplanation>;
      }
      return send(input) satisfies Promise<SendResult>;
    },
    explain,
    check: explain,
    inbox: {
      list(recipientId, scope, filter, limit?) {
        const s = scope ? normalizeOrgId(scope) : scope;
        return database.inbox.listByRecipient(recipientId, s, filter, normalizeListLimit(limit, "inbox.limit"));
      },
      async markReadForRecipient(inboxItemId, recipientId, scope) {
        const s = scope ? normalizeOrgId(scope) : scope;
        const result = await database.inbox.markReadForRecipient(
          inboxItemId,
          recipientId,
          s,
        );
        if (result.status === "marked") {
          try { await runHook("inbox.updated", { inboxItem: result.item }); } catch {}
          await publishRealtime(recipientId, s ?? {}, {
            type: "inbox.updated",
            item: result.item,
          });
        }
        return result;
      },
      unreadCount(recipientId, scope) {
        const s = scope ? normalizeOrgId(scope) : scope;
        return database.inbox.unreadCount(recipientId, s);
      },
      async markAllRead(recipientId, scope) {
        const s = scope ? normalizeOrgId(scope) : scope;
        const count = await database.inbox.markAllRead(recipientId, s);
        if (count > 0) {
          try { await runHook("inbox.all_read", { recipientId, count }); } catch {}
          await publishRealtime(recipientId, s ?? {}, {
            type: "inbox.all_read",
            count,
          });
        }
        return count;
      },
      async archiveForRecipient(inboxItemId, recipientId, scope) {
        const s = scope ? normalizeOrgId(scope) : scope;
        const result = await database.inbox.archiveForRecipient(inboxItemId, recipientId, s);
        if (result.status === "ok") {
          try { await runHook("inbox.archived", { inboxItem: result.item }); } catch {}
          await publishRealtime(recipientId, s ?? {}, {
            type: "inbox.archived",
            item: result.item,
          });
        }
        return result;
      },
      async unarchiveForRecipient(inboxItemId, recipientId, scope) {
        const s = scope ? normalizeOrgId(scope) : scope;
        const result = await database.inbox.unarchiveForRecipient(inboxItemId, recipientId, s);
        if (result.status === "ok") {
          try { await runHook("inbox.unarchived", { inboxItem: result.item }); } catch {}
          await publishRealtime(recipientId, s ?? {}, {
            type: "inbox.unarchived",
            item: result.item,
          });
        }
        return result;
      },
      async deleteForRecipient(inboxItemId, recipientId, scope) {
        const s = scope ? normalizeOrgId(scope) : scope;
        const result = await database.inbox.deleteForRecipient(inboxItemId, recipientId, s);
        if (result.status === "deleted") {
          try { await runHook("inbox.deleted", { itemId: inboxItemId, recipientId }); } catch {}
          await publishRealtime(recipientId, s ?? {}, {
            type: "inbox.deleted",
            itemId: inboxItemId,
          });
        }
        return result;
      },
    },
    deliveries: {
      list(recipientId, scope, limit?) {
        const s = scope ? normalizeOrgId(scope) : scope;
        return database.deliveries.list(recipientId, s, normalizeListLimit(limit, "deliveries.limit"));
      },
    },
    preferences: {
      get: getPreference,
      async list(recipientId, scope) {
        const s = scope ? normalizeOrgId(scope) : scope;
        const all = await database.preferences.list(recipientId, s);
        return all.filter((p) => !isSyntheticPreferenceKey(p.notificationId));
      },
      update: updatePreference,
      async getGlobal(input) {
        const recipient = await database.recipients.findById(input.recipientId);
        if (!recipient) return null;
        const scope = resolveScope(input, recipient);
        return database.preferences.get(
          input.recipientId,
          GLOBAL_PREFERENCE_KEY,
          scope,
        );
      },
      async getCategory(input) {
        const knownCategories = new Set(
          notifications.map((n) => n.category).filter(Boolean) as string[],
        );
        if (!knownCategories.has(input.category)) {
          throw new NotifyKitError(
            `Unknown category: "${input.category}".`,
            {
              code: "UNKNOWN_CATEGORY",
              field: "category",
              fix: `Known categories: ${[...knownCategories].join(", ") || "(none)"}. Add a category to a notification definition first.`,
            },
          );
        }
        const recipient = await database.recipients.findById(input.recipientId);
        if (!recipient) return null;
        const scope = resolveScope(input, recipient);
        return database.preferences.get(
          input.recipientId,
          categoryPreferenceKey(input.category),
          scope,
        );
      },
      async listCategories(recipientId, scope) {
        const recipient = await database.recipients.findById(recipientId);
        if (!recipient) return [];
        const resolved = resolveScope(scope ?? {}, recipient);
        const all = await database.preferences.list(recipientId, resolved);
        return all.filter((p) => isCategoryPreferenceKey(p.notificationId));
      },
      async updateGlobal(input) {
        const recipient = await database.recipients.findById(input.recipientId);
        if (!recipient) {
          throw new NotifyKitError(
            `Unknown recipient: "${input.recipientId}".`,
            {
              code: "UNKNOWN_RECIPIENT",
              recipientId: input.recipientId,
              fix: "Call upsertRecipient({ id: \"...\", ... }) before updating global preferences.",
            },
          );
        }
        const scope = resolveScope(input, recipient);
        return database.preferences.upsert({
          recipientId: input.recipientId,
          tenantId: scope.tenantId,
          workspaceId: scope.workspaceId,
          notificationId: GLOBAL_PREFERENCE_KEY,
          channels: input.channels,
        });
      },
      async updateCategory(input) {
        const recipient = await database.recipients.findById(input.recipientId);
        if (!recipient) {
          throw new NotifyKitError(
            `Unknown recipient: "${input.recipientId}".`,
            {
              code: "UNKNOWN_RECIPIENT",
              recipientId: input.recipientId,
              fix: "Call upsertRecipient({ id: \"...\", ... }) before updating category preferences.",
            },
          );
        }
        const knownCategories = new Set(
          notifications.map((n) => n.category).filter(Boolean) as string[],
        );
        if (!knownCategories.has(input.category)) {
          throw new NotifyKitError(
            `Unknown category: "${input.category}".`,
            {
              code: "UNKNOWN_CATEGORY",
              field: "category",
              fix: `Known categories: ${[...knownCategories].join(", ") || "(none)"}. Add a category to a notification definition first.`,
            },
          );
        }
        const scope = resolveScope(input, recipient);
        return database.preferences.upsert({
          recipientId: input.recipientId,
          tenantId: scope.tenantId,
          workspaceId: scope.workspaceId,
          notificationId: categoryPreferenceKey(input.category),
          channels: input.channels,
        });
      },
      async explain(input) {
        const def = byId.get(input.notificationId);
        if (!def) {
          throw new NotifyKitError(
            `Unknown notification id: "${input.notificationId}".`,
            {
              code: "UNKNOWN_NOTIFICATION",
              notificationId: input.notificationId,
              fix: `Registered ids: ${[...byId.keys()].join(", ") || "(none)"}.`,
            },
          );
        }
        const recipient = await database.recipients.findById(input.recipientId);
        if (!recipient) {
          throw new NotifyKitError(
            `Unknown recipient: "${input.recipientId}".`,
            {
              code: "UNKNOWN_RECIPIENT",
              recipientId: input.recipientId,
              fix: "Call upsertRecipient({ id: \"...\", ... }) before calling preferences.explain().",
            },
          );
        }
        const scope = resolveScope(input, recipient);
        return resolvePreferences(
          await buildResolutionCtx(recipient, def, scope),
        );
      },
    },
    async drain() {
      while (pendingFlushes.size > 0) {
        await Promise.all(Array.from(pendingFlushes));
      }
      await queue.drain();
    },
    async close() {
      closing = true;
      for (const [key, entry] of scheduledFlushes) {
        clearTimeout(entry.timer);
        scheduledFlushes.delete(key);
        entry.resolve();
      }
      for (const [id, entry] of scheduledSendTimers) {
        clearTimeout(entry.timer);
        scheduledSendTimers.delete(id);
        entry.resolve();
      }
      fallbackDeliveryIds.clear();
      while (pendingFlushes.size > 0) {
        await Promise.all(Array.from(pendingFlushes));
      }
      await queue.drain();
      await drainPendingTimelineWrites();
    },
    async flushDigests() {
      const errors: unknown[] = [];
      const attempted = new Set<string>();
      // Fire scheduled timers immediately, each resolving its outer task.
      const scheduled = Array.from(scheduledFlushes.entries());
      for (const [key, entry] of scheduled) {
        attempted.add(key);
        clearTimeout(entry.timer);
        scheduledFlushes.delete(key);
        try {
          await flushDigestKey(key, entry.def);
        } catch (err) {
          errors.push(err);
        }
        entry.resolve();
      }
      // Catch any buckets that have no timer (e.g. left over from a restart).
      const leftover = await database.digests.list();
      for (const bucket of leftover) {
        if (attempted.has(bucket.key)) continue;
        const def = byId.get(bucket.notificationId);
        if (!def) continue;
        try {
          await flushDigestKey(bucket.key, def);
        } catch (err) {
          errors.push(err);
        }
      }
      while (pendingFlushes.size > 0) {
        await Promise.all(Array.from(pendingFlushes));
      }
      await queue.drain();
      await drainPendingTimelineWrites();
      if (errors.length > 0) {
        throw errors[0];
      }
    },
    flushScheduledSends: runFlushScheduledSends,
    async recoverScheduledSends() {
      await runFlushScheduledSends({ force: false });
    },
    definitions: notifications,
    realtime: realtimeAdapter,
    isDev,
    captured: devCaptured,
    redactPayload(notificationId, payload) {
      const def = byId.get(notificationId);
      if (!def) {
        throw new NotifyKitError(
          `Unknown notification id: "${notificationId}".`,
          {
            code: "UNKNOWN_NOTIFICATION",
            notificationId,
            fix: `Registered ids: ${[...byId.keys()].join(", ") || "(none)"}.`,
          },
        );
      }
      if (!def.redact || def.redact.length === 0) return payload;
      return redactPayload(payload, def.redact);
    },
    async timeline(notificationRecordId, options) {
      const cap = normalizeListLimit(options?.limit, "timeline.limit") ?? 1000;
      if (options?.deliveryId) {
        return timelineAdapter.listByDeliveryId(options.deliveryId, notificationRecordId, cap);
      }
      return timelineAdapter.listByNotificationRecordId(notificationRecordId, cap);
    },
    async pruneTimeline(olderThan) {
      if (!olderThan && timelineRetentionMs === 0) return 0;
      const cutoff = olderThan ?? new Date(Date.now() - timelineRetentionMs);
      return timelineAdapter.prune(cutoff);
    },
  };
}

import type {
  ChannelType,
  DatabaseAdapter,
  DeliveryJob,
  DeliveryRecord,
  EmailProvider,
  GetPreferenceInput,
  Hooks,
  InboxItem,
  MarkReadForRecipientResult,
  NotificationDefinition,
  NotificationRecord,
  PayloadSchema,
  Queue,
  Recipient,
  RecipientPreference,
  RetryPolicy,
  SendInput,
  UpdatePreferenceInput,
  UpsertRecipientInput,
  WebhookProvider,
} from "./types.js";
import { defaultRetryPolicy, inlineQueue } from "./queues.js";
import { isWithinQuietHours, nextQuietHoursEnd } from "./quiet-hours.js";
import { signUnsubscribeToken } from "./unsubscribe.js";
import { NotifyKitError, renderTemplate, validatePayload } from "./utils.js";

export type CreateNotifyKitInput<
  T extends readonly NotificationDefinition<string, PayloadSchema>[],
> = {
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

export type NotifyKit<
  T extends readonly NotificationDefinition<string, PayloadSchema>[],
> = {
  upsertRecipient(input: UpsertRecipientInput): Promise<Recipient>;
  send(input: SendInput<T>): Promise<SendResult>;
  inbox: {
    list(recipientId: string): Promise<InboxItem[]>;
    markRead(inboxItemId: string): Promise<InboxItem | null>;
    markReadForRecipient(
      inboxItemId: string,
      recipientId: string,
    ): Promise<MarkReadForRecipientResult>;
  };
  deliveries: {
    list(recipientId?: string): Promise<DeliveryRecord[]>;
  };
  preferences: {
    get(input: GetPreferenceInput<T>): Promise<RecipientPreference | null>;
    list(recipientId: string): Promise<RecipientPreference[]>;
    update(input: UpdatePreferenceInput<T>): Promise<RecipientPreference>;
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
  flushScheduledSends(options?: { force?: boolean }): Promise<void>;
  /**
   * Recovery sweep: deliver every scheduled-send row whose `scheduledFor` is
   * already in the past. Safe to call on boot and periodically. Equivalent to
   * `flushScheduledSends({ force: false })`.
   */
  recoverScheduledSends(): Promise<void>;
  /** Registered notification definitions. Read-only, for introspection. */
  readonly definitions: T;
};

export function createNotifyKit<
  const T extends readonly NotificationDefinition<string, PayloadSchema>[],
>(config: CreateNotifyKitInput<T>): NotifyKit<T> {
  const { notifications, database, providers, on } = config;
  const queue = config.queue ?? inlineQueue();
  const retry: RetryPolicy = {
    maxAttempts: config.retry?.maxAttempts ?? defaultRetryPolicy.maxAttempts,
    delayMs: config.retry?.delayMs ?? defaultRetryPolicy.delayMs,
  };
  const unsubscribeConfig = config.unsubscribe ?? null;

  function buildUnsubscribeUrl(
    recipientId: string,
    notificationId: string,
  ): string {
    if (!unsubscribeConfig) return "";
    const token = signUnsubscribeToken(
      { recipientId, notificationId },
      unsubscribeConfig.secret,
    );
    const base = unsubscribeConfig.baseUrl.replace(/\/+$/, "");
    return `${base}/unsubscribe?token=${encodeURIComponent(token)}`;
  }

  const byId = new Map<string, NotificationDefinition<string, PayloadSchema>>();
  for (const def of notifications) {
    if (byId.has(def.id)) {
      throw new NotifyKitError(
        `Duplicate notification id: "${def.id}". Notification ids must be unique.`,
      );
    }
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
      // Surface hook errors; userland can catch if needed
      throw err instanceof Error
        ? err
        : new Error(`Hook "${String(name)}" threw a non-error value.`);
    }
  }

  const pendingFlushes = new Set<Promise<void>>();
  type ScheduledFlush = {
    timer: ReturnType<typeof setTimeout>;
    resolve: () => void;
    def: NotificationDefinition<string, PayloadSchema>;
  };
  const scheduledFlushes = new Map<string, ScheduledFlush>();
  type ScheduledSendTimer = {
    timer: ReturnType<typeof setTimeout>;
    resolve: () => void;
  };
  const scheduledSendTimers = new Map<string, ScheduledSendTimer>();

  async function send(rawInput: SendInput<T>): Promise<SendResult> {
    const input = rawInput as {
      recipientId: string;
      notificationId: string;
      payload: unknown;
    };
    const def = byId.get(input.notificationId);
    if (!def) {
      throw new NotifyKitError(
        `Unknown notification id: "${input.notificationId}".`,
      );
    }

    const recipient = await database.recipients.findById(input.recipientId);
    if (!recipient) {
      throw new NotifyKitError(
        `Unknown recipient: "${input.recipientId}". Call upsertRecipient() first.`,
      );
    }

    const payload = validatePayload(def.payload, input.payload, def.id);

    if (def.rateLimit) {
      const limit = def.rateLimit;
      const scope = limit.scope ?? "recipient";
      const key =
        scope === "global"
          ? def.id
          : `${recipient.id}:${def.id}`;
      // Atomic admission: count + insert happen in one adapter call so two
      // concurrent sends cannot both read N < max and both insert.
      const result = await database.rateLimits.reserve({
        key,
        max: limit.max,
        windowMs: limit.windowMs,
        recipientId: recipient.id,
        notificationId: def.id,
      });
      if (!result.allowed) {
        await runHook("notification.rate_limited", {
          notificationId: def.id,
          recipientId: recipient.id,
          limit,
        });
        return {
          notification: null,
          inboxItems: [],
          deliveries: [],
          skippedChannels: [],
          deferredChannels: [],
          digested: false,
          rateLimited: true,
        };
      }
    }

    if (def.digest) {
      const digest = def.digest;
      const key =
        digest.key?.({
          recipientId: recipient.id,
          notificationId: def.id,
          payload: payload as never,
        }) ?? `${recipient.id}:${def.id}`;

      const entry = await database.digests.append({
        key,
        recipientId: recipient.id,
        notificationId: def.id,
        payload,
        windowMs: digest.windowMs,
      });

      // Schedule a flush if there isn't already one for this key. We always
      // aim at the bucket's original `flushAt` — appends don't extend the
      // window (tumbling behavior, not sliding).
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
            .catch(() => {})
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
        deferredChannels: [],
        digested: true,
        rateLimited: false,
      };
    }

    // Quiet hours: inbox still delivers immediately, email + webhook defer
    // until the window ends. Schedule one row per (recipient, notification,
    // payload); the flusher calls deliver() again with `onlyChannels` when
    // it fires.
    const deferChannels: ChannelType[] = [];
    if (recipient.quietHours && isWithinQuietHours(recipient.quietHours)) {
      for (const ch of def.channels) {
        if (ch.type === "email" || ch.type === "webhook") {
          deferChannels.push(ch.type);
        }
      }
    }

    if (deferChannels.length > 0) {
      const scheduledFor = nextQuietHoursEnd(recipient.quietHours!);
      const record = await database.scheduledSends.create({
        recipientId: recipient.id,
        notificationId: def.id,
        payload,
        scheduledFor,
        reason: "quiet_hours",
      });
      scheduleDeferredFlush(record.id, scheduledFor);
      return deliver(recipient, def, payload, { deferChannels });
    }

    return deliver(recipient, def, payload);
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
        .catch(() => {})
        .finally(() => entry.resolve());
    }, delay);
    scheduledSendTimers.set(id, { timer, resolve: resolveTask });
    pendingFlushes.add(task);
    task.finally(() => pendingFlushes.delete(task));
  }

  async function flushScheduledSend(id: string): Promise<void> {
    // Claim first — if we can't (already claimed / already completed / gone)
    // just bail. This makes concurrent flushers safe and keeps the row
    // around until we confirm delivery succeeded.
    const record = await database.scheduledSends.claim(id);
    if (!record) return;
    try {
      const def = byId.get(record.notificationId);
      if (!def) {
        // Definition was removed since the row was created. There's nothing
        // we can deliver, so complete the row to stop it from blocking
        // future sweeps.
        await database.scheduledSends.complete(id);
        return;
      }
      const recipient = await database.recipients.findById(record.recipientId);
      if (!recipient) {
        // Recipient no longer exists. Same reasoning — complete to drop.
        await database.scheduledSends.complete(id);
        return;
      }
      // The payload was validated at send() time; still validate here so a
      // buggy store path surfaces loudly rather than feeding junk downstream.
      const payload = validatePayload(def.payload, record.payload, def.id);
      // The inbox item was written at send() time. Only fire the previously
      // deferred channels now. We create a fresh notification record for the
      // deferred delivery so the delivery row has a parent — matches the
      // behavior where digest flushes also create a fresh record.
      await deliver(recipient, def, payload, {
        onlyChannels: ["email", "webhook"],
      });
      // Only delete after delivery has been enqueued/completed successfully.
      await database.scheduledSends.complete(id);
    } catch (err) {
      // Something blew up after the claim. Release so a retry sweep can pick
      // the row up again — we do NOT want silent data loss.
      await database.scheduledSends.release(id).catch(() => {});
      throw err;
    }
  }

  async function flushDigestKey(
    key: string,
    def: NotificationDefinition<string, PayloadSchema>,
  ): Promise<void> {
    const entry = await database.digests.take(key);
    if (!entry) return;
    try {
      if (!def.digest) {
        throw new NotifyKitError(
          `Notification "${def.id}" has no digest config.`,
        );
      }

      const recipient = await database.recipients.findById(entry.recipientId);
      if (!recipient) {
        throw new NotifyKitError(
          `Unknown recipient: "${entry.recipientId}". Cannot flush digest "${key}".`,
        );
      }

      const combined = def.digest.render({
        recipientId: entry.recipientId,
        notificationId: entry.notificationId,
        payloads: entry.payloads as never,
        count: entry.payloads.length,
      }) as unknown as Record<string, unknown>;

      // Re-validate the combined payload so a buggy render() surfaces loudly.
      const validated = validatePayload(def.payload, combined, def.id);
      await deliver(recipient, def, validated);
    } catch (err) {
      await database.digests.restore(entry);
      throw err;
    }
  }

  type DeliverOptions = {
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
  };

  async function deliver(
    recipient: Recipient,
    def: NotificationDefinition<string, PayloadSchema>,
    payload: Record<string, unknown>,
    options: DeliverOptions = {},
  ): Promise<SendResult> {
    const preference = await database.preferences.get(recipient.id, def.id);
    const isChannelAllowed = (type: ChannelType): boolean => {
      if (!preference) return true;
      const value = preference.channels[type];
      return value !== false;
    };

    const deferSet = new Set(options.deferChannels ?? []);
    const onlySet = options.onlyChannels
      ? new Set(options.onlyChannels)
      : null;

    const notificationRecord =
      options.existingNotification ??
      (await database.notifications.create({
        recipientId: recipient.id,
        notificationId: def.id,
        payload,
      }));
    if (!options.existingNotification) {
      await runHook("notification.created", {
        notification: notificationRecord,
      });
    }

    const inboxItems: InboxItem[] = [];
    const deliveries: DeliveryRecord[] = [];
    const skippedChannels: ChannelType[] = [];
    const deferredChannels: ChannelType[] = [];

    for (const ch of def.channels) {
      if (onlySet && !onlySet.has(ch.type)) continue;
      if (deferSet.has(ch.type)) {
        deferredChannels.push(ch.type);
        continue;
      }
      if (!isChannelAllowed(ch.type)) {
        skippedChannels.push(ch.type);
        continue;
      }
      if (ch.type === "inbox") {
        const item = await database.inbox.create({
          notificationRecordId: notificationRecord.id,
          recipientId: recipient.id,
          notificationId: def.id,
          title: renderTemplate(ch.title, payload),
          body: ch.body !== undefined ? renderTemplate(ch.body, payload) : undefined,
          actionUrl:
            ch.actionUrl !== undefined
              ? renderTemplate(ch.actionUrl, payload)
              : undefined,
        });
        inboxItems.push(item);
        await runHook("inbox.created", { inboxItem: item });
      } else if (ch.type === "email") {
        const provider = providers?.email;
        if (!provider) {
          throw new NotifyKitError(
            `Notification "${def.id}" has an email channel but no email provider is configured.`,
          );
        }
        if (!recipient.email) {
          throw new NotifyKitError(
            `Recipient "${recipient.id}" has no email address; cannot send email notification "${def.id}".`,
          );
        }

        const renderCtx: Record<string, unknown> = { ...payload };
        if (unsubscribeConfig) {
          renderCtx._unsubscribeUrl = buildUnsubscribeUrl(
            recipient.id,
            def.id,
          );
        }
        const subject = renderTemplate(ch.subject, renderCtx);
        const body = renderTemplate(ch.body, renderCtx);

        const delivery = await database.deliveries.create({
          notificationRecordId: notificationRecord.id,
          recipientId: recipient.id,
          notificationId: def.id,
          channel: "email",
          provider: provider.id,
          status: "pending",
          to: recipient.email,
          subject,
          body,
          attempts: 0,
        });

        const job: DeliveryJob = {
          deliveryId: delivery.id,
          notificationRecordId: notificationRecord.id,
          recipientId: recipient.id,
          notificationId: def.id,
          channel: "email",
          provider: provider.id,
          to: recipient.email,
          subject,
          body,
          payload,
        };

        await queue.enqueue(job, (j) => processDeliveryJob(j));

        // Re-read after enqueue so inline queues return final state; async
        // queues return "pending" here (callers use drain() + deliveries.list).
        const latest = await database.deliveries.findById(delivery.id);
        deliveries.push(latest ?? delivery);
      } else if (ch.type === "webhook") {
        const provider = providers?.webhook;
        if (!provider) {
          throw new NotifyKitError(
            `Notification "${def.id}" has a webhook channel but no webhook provider is configured.`,
          );
        }

        const url = renderTemplate(ch.url, payload);
        const headers: Record<string, string> = {};
        if (ch.headers) {
          for (const [k, v] of Object.entries(ch.headers)) {
            headers[k] = renderTemplate(v, payload);
          }
        }

        const delivery = await database.deliveries.create({
          notificationRecordId: notificationRecord.id,
          recipientId: recipient.id,
          notificationId: def.id,
          channel: "webhook",
          provider: provider.id,
          status: "pending",
          to: url,
          body: JSON.stringify(payload),
          attempts: 0,
        });

        const job: DeliveryJob = {
          deliveryId: delivery.id,
          notificationRecordId: notificationRecord.id,
          recipientId: recipient.id,
          notificationId: def.id,
          channel: "webhook",
          provider: provider.id,
          url,
          headers,
          payload,
        };

        await queue.enqueue(job, (j) => processDeliveryJob(j));

        const latest = await database.deliveries.findById(delivery.id);
        deliveries.push(latest ?? delivery);
      }
    }

    return {
      notification: notificationRecord,
      inboxItems,
      deliveries,
      skippedChannels,
      deferredChannels,
      digested: false,
      rateLimited: false,
    };
  }

  async function processDeliveryJob(job: DeliveryJob): Promise<void> {
    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= retry.maxAttempts; attempt++) {
      const wait = retry.delayMs(attempt);
      if (wait > 0) {
        await new Promise<void>((r) => setTimeout(r, wait));
      }
      try {
        let result: { providerMessageId?: string };
        if (job.channel === "email") {
          const provider = providers?.email;
          if (!provider) {
            throw new Error("No email provider configured");
          }
          result = await provider.send({
            to: job.to,
            subject: job.subject,
            body: job.body,
          });
        } else {
          const provider = providers?.webhook;
          if (!provider) {
            throw new Error("No webhook provider configured");
          }
          result = await provider.send({
            url: job.url,
            headers: job.headers,
            payload: {
              notificationId: job.notificationId,
              recipientId: job.recipientId,
              payload: job.payload,
              sentAt: new Date().toISOString(),
            },
          });
        }

        const updated = await database.deliveries.update(job.deliveryId, {
          status: "sent",
          providerMessageId: result.providerMessageId,
          attempts: attempt,
          sentAt: new Date(),
          error: undefined,
        });
        if (updated) {
          await runHook("delivery.sent", { delivery: updated });
        }
        return;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        // Record the attempt; only mark "failed" once we've exhausted retries.
        await database.deliveries.update(job.deliveryId, {
          attempts: attempt,
          error: lastError.message,
        });
      }
    }
    const failed = await database.deliveries.update(job.deliveryId, {
      status: "failed",
      failedAt: new Date(),
    });
    if (failed) {
      await runHook("delivery.failed", {
        delivery: failed,
        error: lastError ?? new Error("Delivery failed"),
      });
    }

    // Fallback channel: when a primary delivery terminally fails, drop an
    // inbox item so the user still sees the message. Respects preferences.
    const def = byId.get(job.notificationId);
    if (def?.fallback) {
      const preference = await database.preferences.get(
        job.recipientId,
        def.id,
      );
      const inboxAllowed = !preference || preference.channels.inbox !== false;
      if (inboxAllowed) {
        const fallback = def.fallback;
        const item = await database.inbox.create({
          notificationRecordId: job.notificationRecordId,
          recipientId: job.recipientId,
          notificationId: job.notificationId,
          title: renderTemplate(fallback.title, job.payload),
          body:
            fallback.body !== undefined
              ? renderTemplate(fallback.body, job.payload)
              : undefined,
          actionUrl:
            fallback.actionUrl !== undefined
              ? renderTemplate(fallback.actionUrl, job.payload)
              : undefined,
        });
        await runHook("inbox.created", { inboxItem: item });
      }
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
      );
    }
    const recipient = await database.recipients.findById(input.recipientId);
    if (!recipient) {
      throw new NotifyKitError(
        `Unknown recipient: "${input.recipientId}". Call upsertRecipient() first.`,
      );
    }
    return database.preferences.upsert({
      recipientId: input.recipientId,
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
    return database.preferences.get(input.recipientId, input.notificationId);
  }

  async function runFlushScheduledSends(options?: {
    force?: boolean;
  }): Promise<void> {
    const force = options?.force ?? true;
    // Cancel in-memory timers. Any row that still had a pending timer is
    // by definition due or near-due; flush it inline.
    const scheduled = Array.from(scheduledSendTimers.entries());
    for (const [id, entry] of scheduled) {
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
      : await database.scheduledSends.listDue(new Date());
    for (const row of leftover) {
      // A claimed row from a crashed prior run stays claimed — skip it
      // rather than double-delivering. Operators wanting to recover stuck
      // claims should do so explicitly via release().
      if (row.status !== "pending") continue;
      await flushScheduledSend(row.id).catch(() => {});
    }
    while (pendingFlushes.size > 0) {
      await Promise.all(Array.from(pendingFlushes));
    }
    await queue.drain();
  }

  return {
    async upsertRecipient(input) {
      return database.recipients.upsert(input);
    },
    send,
    inbox: {
      list(recipientId) {
        return database.inbox.listByRecipient(recipientId);
      },
      markRead(inboxItemId) {
        return database.inbox.markRead(inboxItemId);
      },
      markReadForRecipient(inboxItemId, recipientId) {
        return database.inbox.markReadForRecipient(inboxItemId, recipientId);
      },
    },
    deliveries: {
      list(recipientId) {
        return database.deliveries.list(recipientId);
      },
    },
    preferences: {
      get: getPreference,
      list(recipientId) {
        return database.preferences.list(recipientId);
      },
      update: updatePreference,
    },
    async drain() {
      while (pendingFlushes.size > 0) {
        await Promise.all(Array.from(pendingFlushes));
      }
      await queue.drain();
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
      if (errors.length > 0) {
        throw errors[0];
      }
    },
    flushScheduledSends: runFlushScheduledSends,
    async recoverScheduledSends() {
      await runFlushScheduledSends({ force: false });
    },
    definitions: notifications,
  };
}

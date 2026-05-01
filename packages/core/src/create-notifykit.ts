import type {
  ChannelType,
  DatabaseAdapter,
  DeliveryJob,
  DeliveryRecord,
  EmailProvider,
  GetPreferenceInput,
  Hooks,
  InboxItem,
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
} from "./types.js";
import { defaultRetryPolicy, inlineQueue } from "./queues.js";
import { isWithinQuietHours, nextQuietHoursEnd } from "./quiet-hours.js";
import { NotifyKitError, renderTemplate, validatePayload } from "./utils.js";

export type CreateNotifyKitInput<
  T extends readonly NotificationDefinition<string, PayloadSchema>[],
> = {
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
   * Forces pending quiet-hours deferrals to fire now. Resolves once every
   * triggered send has completed.
   */
  flushScheduledSends(): Promise<void>;
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
      const count = await database.rateLimits.count({
        key,
        windowMs: limit.windowMs,
      });
      if (count >= limit.max) {
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
      await database.rateLimits.record({
        key,
        recipientId: recipient.id,
        notificationId: def.id,
      });
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

    // Quiet hours: inbox still delivers immediately, email defers until the
    // window ends. We schedule one row per (recipient, notification, payload);
    // the flusher calls deliver() again with `onlyChannels` when it fires.
    const deferChannels: ChannelType[] = [];
    if (recipient.quietHours && isWithinQuietHours(recipient.quietHours)) {
      for (const ch of def.channels) {
        if (ch.type === "email") deferChannels.push(ch.type);
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
    const record = await database.scheduledSends.take(id);
    if (!record) return;
    const def = byId.get(record.notificationId);
    if (!def) return;
    const recipient = await database.recipients.findById(record.recipientId);
    if (!recipient) return;
    // The payload was validated at send() time; still validate here so a
    // buggy store path surfaces loudly rather than feeding junk downstream.
    const payload = validatePayload(def.payload, record.payload, def.id);
    // The inbox item was written at send() time. Only fire the previously
    // deferred channels now. We create a fresh notification record for the
    // deferred delivery so the delivery row has a parent — matches the
    // behavior where digest flushes also create a fresh record.
    await deliver(recipient, def, payload, { onlyChannels: ["email"] });
  }

  async function flushDigestKey(
    key: string,
    def: NotificationDefinition<string, PayloadSchema>,
  ): Promise<void> {
    const entry = await database.digests.take(key);
    if (!entry) return;
    if (!def.digest) return;

    const recipient = await database.recipients.findById(entry.recipientId);
    if (!recipient) return;

    const combined = def.digest.render({
      recipientId: entry.recipientId,
      notificationId: entry.notificationId,
      payloads: entry.payloads as never,
      count: entry.payloads.length,
    }) as unknown as Record<string, unknown>;

    // Re-validate the combined payload so a buggy render() surfaces loudly.
    const validated = validatePayload(def.payload, combined, def.id);
    await deliver(recipient, def, validated);
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

        const subject = renderTemplate(ch.subject, payload);
        const body = renderTemplate(ch.body, payload);

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

        await queue.enqueue(job, (j) => processDeliveryJob(j, provider));

        // Re-read after enqueue so inline queues return final state; async
        // queues return "pending" here (callers use drain() + deliveries.list).
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

  async function processDeliveryJob(
    job: DeliveryJob,
    provider: EmailProvider,
  ): Promise<void> {
    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= retry.maxAttempts; attempt++) {
      const wait = retry.delayMs(attempt);
      if (wait > 0) {
        await new Promise<void>((r) => setTimeout(r, wait));
      }
      try {
        const result = await provider.send({
          to: job.to,
          subject: job.subject,
          body: job.body,
        });
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
      // Fire scheduled timers immediately, each resolving its outer task.
      const scheduled = Array.from(scheduledFlushes.entries());
      for (const [key, entry] of scheduled) {
        clearTimeout(entry.timer);
        scheduledFlushes.delete(key);
        await flushDigestKey(key, entry.def).catch(() => {});
        entry.resolve();
      }
      // Catch any buckets that have no timer (e.g. left over from a restart).
      const leftover = await database.digests.list();
      for (const bucket of leftover) {
        const def = byId.get(bucket.notificationId);
        if (!def) continue;
        await flushDigestKey(bucket.key, def).catch(() => {});
      }
      while (pendingFlushes.size > 0) {
        await Promise.all(Array.from(pendingFlushes));
      }
      await queue.drain();
    },
    async flushScheduledSends() {
      // Cancel timers, then flush by id. Resolves each outer task.
      const scheduled = Array.from(scheduledSendTimers.entries());
      for (const [id, entry] of scheduled) {
        clearTimeout(entry.timer);
        scheduledSendTimers.delete(id);
        await flushScheduledSend(id).catch(() => {});
        entry.resolve();
      }
      // Sweep any stored rows with no in-memory timer (post-restart case).
      const leftover = await database.scheduledSends.list();
      for (const row of leftover) {
        await flushScheduledSend(row.id).catch(() => {});
      }
      while (pendingFlushes.size > 0) {
        await Promise.all(Array.from(pendingFlushes));
      }
      await queue.drain();
    },
    definitions: notifications,
  };
}

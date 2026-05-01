import { defaultRetryPolicy, inlineQueue } from "./queues.js";
import { NotifyKitError, renderTemplate, validatePayload } from "./utils.js";
export function createNotifyKit(config) {
    const { notifications, database, providers, on } = config;
    const queue = config.queue ?? inlineQueue();
    const retry = {
        maxAttempts: config.retry?.maxAttempts ?? defaultRetryPolicy.maxAttempts,
        delayMs: config.retry?.delayMs ?? defaultRetryPolicy.delayMs,
    };
    const byId = new Map();
    for (const def of notifications) {
        if (byId.has(def.id)) {
            throw new NotifyKitError(`Duplicate notification id: "${def.id}". Notification ids must be unique.`);
        }
        byId.set(def.id, def);
    }
    async function runHook(name, ...args) {
        const fn = on?.[name];
        if (!fn)
            return;
        try {
            // @ts-expect-error — dispatch to the user-provided hook with matching args
            await fn(...args);
        }
        catch (err) {
            // Surface hook errors; userland can catch if needed
            throw err instanceof Error
                ? err
                : new Error(`Hook "${String(name)}" threw a non-error value.`);
        }
    }
    const pendingFlushes = new Set();
    const scheduledFlushes = new Map();
    async function send(rawInput) {
        const input = rawInput;
        const def = byId.get(input.notificationId);
        if (!def) {
            throw new NotifyKitError(`Unknown notification id: "${input.notificationId}".`);
        }
        const recipient = await database.recipients.findById(input.recipientId);
        if (!recipient) {
            throw new NotifyKitError(`Unknown recipient: "${input.recipientId}". Call upsertRecipient() first.`);
        }
        const payload = validatePayload(def.payload, input.payload, def.id);
        if (def.rateLimit) {
            const limit = def.rateLimit;
            const scope = limit.scope ?? "recipient";
            const key = scope === "global"
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
            const key = digest.key?.({
                recipientId: recipient.id,
                notificationId: def.id,
                payload: payload,
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
                let resolveTask;
                const task = new Promise((resolve) => {
                    resolveTask = resolve;
                });
                const timer = setTimeout(() => {
                    const scheduled = scheduledFlushes.get(key);
                    if (!scheduled)
                        return;
                    scheduledFlushes.delete(key);
                    flushDigestKey(key, def)
                        .catch(() => { })
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
                digested: true,
                rateLimited: false,
            };
        }
        return deliver(recipient, def, payload);
    }
    async function flushDigestKey(key, def) {
        const entry = await database.digests.take(key);
        if (!entry)
            return;
        if (!def.digest)
            return;
        const recipient = await database.recipients.findById(entry.recipientId);
        if (!recipient)
            return;
        const combined = def.digest.render({
            recipientId: entry.recipientId,
            notificationId: entry.notificationId,
            payloads: entry.payloads,
            count: entry.payloads.length,
        });
        // Re-validate the combined payload so a buggy render() surfaces loudly.
        const validated = validatePayload(def.payload, combined, def.id);
        await deliver(recipient, def, validated);
    }
    async function deliver(recipient, def, payload) {
        const preference = await database.preferences.get(recipient.id, def.id);
        const isChannelAllowed = (type) => {
            if (!preference)
                return true;
            const value = preference.channels[type];
            return value !== false;
        };
        const notificationRecord = await database.notifications.create({
            recipientId: recipient.id,
            notificationId: def.id,
            payload,
        });
        await runHook("notification.created", { notification: notificationRecord });
        const inboxItems = [];
        const deliveries = [];
        const skippedChannels = [];
        for (const ch of def.channels) {
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
                    actionUrl: ch.actionUrl !== undefined
                        ? renderTemplate(ch.actionUrl, payload)
                        : undefined,
                });
                inboxItems.push(item);
                await runHook("inbox.created", { inboxItem: item });
            }
            else if (ch.type === "email") {
                const provider = providers?.email;
                if (!provider) {
                    throw new NotifyKitError(`Notification "${def.id}" has an email channel but no email provider is configured.`);
                }
                if (!recipient.email) {
                    throw new NotifyKitError(`Recipient "${recipient.id}" has no email address; cannot send email notification "${def.id}".`);
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
                const job = {
                    deliveryId: delivery.id,
                    notificationRecordId: notificationRecord.id,
                    recipientId: recipient.id,
                    notificationId: def.id,
                    channel: "email",
                    provider: provider.id,
                    to: recipient.email,
                    subject,
                    body,
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
            digested: false,
            rateLimited: false,
        };
    }
    async function processDeliveryJob(job, provider) {
        let lastError = null;
        for (let attempt = 1; attempt <= retry.maxAttempts; attempt++) {
            const wait = retry.delayMs(attempt);
            if (wait > 0) {
                await new Promise((r) => setTimeout(r, wait));
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
            }
            catch (err) {
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
    }
    async function updatePreference(rawInput) {
        const input = rawInput;
        if (!byId.has(input.notificationId)) {
            throw new NotifyKitError(`Unknown notification id: "${input.notificationId}".`);
        }
        const recipient = await database.recipients.findById(input.recipientId);
        if (!recipient) {
            throw new NotifyKitError(`Unknown recipient: "${input.recipientId}". Call upsertRecipient() first.`);
        }
        return database.preferences.upsert({
            recipientId: input.recipientId,
            notificationId: input.notificationId,
            channels: input.channels,
        });
    }
    async function getPreference(rawInput) {
        const input = rawInput;
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
                await flushDigestKey(key, entry.def).catch(() => { });
                entry.resolve();
            }
            // Catch any buckets that have no timer (e.g. left over from a restart).
            const leftover = await database.digests.list();
            for (const bucket of leftover) {
                const def = byId.get(bucket.notificationId);
                if (!def)
                    continue;
                await flushDigestKey(bucket.key, def).catch(() => { });
            }
            while (pendingFlushes.size > 0) {
                await Promise.all(Array.from(pendingFlushes));
            }
            await queue.drain();
        },
        definitions: notifications,
    };
}
//# sourceMappingURL=create-notifykit.js.map
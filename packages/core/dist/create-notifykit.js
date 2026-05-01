import { defaultRetryPolicy, inlineQueue } from "./queues.js";
import { isWithinQuietHours, nextQuietHoursEnd } from "./quiet-hours.js";
import { signUnsubscribeToken } from "./unsubscribe.js";
import { NotifyKitError, renderTemplate, validatePayload } from "./utils.js";
export function createNotifyKit(config) {
    const { notifications, database, providers, on } = config;
    const queue = config.queue ?? inlineQueue();
    const retry = {
        maxAttempts: config.retry?.maxAttempts ?? defaultRetryPolicy.maxAttempts,
        delayMs: config.retry?.delayMs ?? defaultRetryPolicy.delayMs,
    };
    const unsubscribeConfig = config.unsubscribe ?? null;
    function buildUnsubscribeUrl(recipient, notificationId, scope) {
        if (!unsubscribeConfig)
            return "";
        const token = signUnsubscribeToken({
            recipientId: recipient.id,
            tenantId: scope.tenantId,
            workspaceId: scope.workspaceId,
            notificationId,
        }, unsubscribeConfig.secret);
        const base = unsubscribeConfig.baseUrl.replace(/\/+$/, "");
        return `${base}/unsubscribe?token=${encodeURIComponent(token)}`;
    }
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
    const scheduledSendTimers = new Map();
    function resolveScope(input, recipient) {
        const tenantId = input.tenantId ?? recipient.tenantId;
        const workspaceId = input.workspaceId ?? recipient.workspaceId;
        if (input.tenantId && recipient.tenantId && input.tenantId !== recipient.tenantId) {
            throw new NotifyKitError(`Recipient "${recipient.id}" belongs to tenant "${recipient.tenantId}", not "${input.tenantId}".`);
        }
        if (input.workspaceId &&
            recipient.workspaceId &&
            input.workspaceId !== recipient.workspaceId) {
            throw new NotifyKitError(`Recipient "${recipient.id}" belongs to workspace "${recipient.workspaceId}", not "${input.workspaceId}".`);
        }
        return compactScope({ tenantId, workspaceId });
    }
    function compactScope(scope) {
        const out = {};
        if (scope.tenantId)
            out.tenantId = scope.tenantId;
        if (scope.workspaceId)
            out.workspaceId = scope.workspaceId;
        return out;
    }
    function scopeKey(scope) {
        if (!scope.tenantId && !scope.workspaceId)
            return "";
        return `${scope.tenantId ?? ""}:${scope.workspaceId ?? ""}:`;
    }
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
        const scope = resolveScope(input, recipient);
        if (def.rateLimit) {
            const limit = def.rateLimit;
            const rateLimitScope = limit.scope ?? "recipient";
            const key = rateLimitScope === "global"
                ? `${scopeKey(scope)}${def.id}`
                : `${scopeKey(scope)}${recipient.id}:${def.id}`;
            // Atomic admission: count + insert happen in one adapter call so two
            // concurrent sends cannot both read N < max and both insert.
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
            const key = digest.key?.({
                recipientId: recipient.id,
                notificationId: def.id,
                payload: payload,
            }) ?? `${scopeKey(scope)}${recipient.id}:${def.id}`;
            const entry = await database.digests.append({
                key,
                recipientId: recipient.id,
                tenantId: scope.tenantId,
                workspaceId: scope.workspaceId,
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
                deferredChannels: [],
                digested: true,
                rateLimited: false,
            };
        }
        // Quiet hours: inbox still delivers immediately, email + webhook defer
        // until the window ends. Schedule one row per (recipient, notification,
        // payload); the flusher calls deliver() again with `onlyChannels` when
        // it fires.
        const deferChannels = [];
        if (recipient.quietHours && isWithinQuietHours(recipient.quietHours)) {
            for (const ch of def.channels) {
                if (ch.type === "email" || ch.type === "webhook") {
                    deferChannels.push(ch.type);
                }
            }
        }
        if (deferChannels.length > 0) {
            const scheduledFor = nextQuietHoursEnd(recipient.quietHours);
            const record = await database.scheduledSends.create({
                recipientId: recipient.id,
                tenantId: scope.tenantId,
                workspaceId: scope.workspaceId,
                notificationId: def.id,
                payload,
                scheduledFor,
                reason: "quiet_hours",
            });
            scheduleDeferredFlush(record.id, scheduledFor);
            return deliver(recipient, def, payload, { deferChannels, scope });
        }
        return deliver(recipient, def, payload, { scope });
    }
    function scheduleDeferredFlush(id, scheduledFor) {
        if (scheduledSendTimers.has(id))
            return;
        const delay = Math.max(0, scheduledFor.getTime() - Date.now());
        let resolveTask;
        const task = new Promise((resolve) => {
            resolveTask = resolve;
        });
        const timer = setTimeout(() => {
            const entry = scheduledSendTimers.get(id);
            if (!entry)
                return;
            scheduledSendTimers.delete(id);
            flushScheduledSend(id)
                .catch(() => { })
                .finally(() => entry.resolve());
        }, delay);
        scheduledSendTimers.set(id, { timer, resolve: resolveTask });
        pendingFlushes.add(task);
        task.finally(() => pendingFlushes.delete(task));
    }
    async function flushScheduledSend(id) {
        // Claim first — if we can't (already claimed / already completed / gone)
        // just bail. This makes concurrent flushers safe and keeps the row
        // around until we confirm delivery succeeded.
        const record = await database.scheduledSends.claim(id);
        if (!record)
            return;
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
            const scope = resolveScope(record, recipient);
            // The payload was validated at send() time; still validate here so a
            // buggy store path surfaces loudly rather than feeding junk downstream.
            const payload = validatePayload(def.payload, record.payload, def.id);
            // The inbox item was written at send() time. Only fire the previously
            // deferred channels now. We create a fresh notification record for the
            // deferred delivery so the delivery row has a parent — matches the
            // behavior where digest flushes also create a fresh record.
            await deliver(recipient, def, payload, {
                onlyChannels: ["email", "webhook"],
                scope,
            });
            // Only delete after delivery has been enqueued/completed successfully.
            await database.scheduledSends.complete(id);
        }
        catch (err) {
            // Something blew up after the claim. Release so a retry sweep can pick
            // the row up again — we do NOT want silent data loss.
            await database.scheduledSends.release(id).catch(() => { });
            throw err;
        }
    }
    async function flushDigestKey(key, def) {
        const entry = await database.digests.take(key);
        if (!entry)
            return;
        try {
            if (!def.digest) {
                throw new NotifyKitError(`Notification "${def.id}" has no digest config.`);
            }
            const recipient = await database.recipients.findById(entry.recipientId);
            if (!recipient) {
                throw new NotifyKitError(`Unknown recipient: "${entry.recipientId}". Cannot flush digest "${key}".`);
            }
            const scope = resolveScope(entry, recipient);
            const combined = def.digest.render({
                recipientId: entry.recipientId,
                notificationId: entry.notificationId,
                payloads: entry.payloads,
                count: entry.payloads.length,
            });
            // Re-validate the combined payload so a buggy render() surfaces loudly.
            const validated = validatePayload(def.payload, combined, def.id);
            await deliver(recipient, def, validated, { scope });
        }
        catch (err) {
            await database.digests.restore(entry);
            throw err;
        }
    }
    async function deliver(recipient, def, payload, options = {}) {
        const scope = options.scope ?? resolveScope({}, recipient);
        const preference = await database.preferences.get(recipient.id, def.id, scope);
        const isChannelAllowed = (type) => {
            if (!preference)
                return true;
            const value = preference.channels[type];
            return value !== false;
        };
        const deferSet = new Set(options.deferChannels ?? []);
        const onlySet = options.onlyChannels
            ? new Set(options.onlyChannels)
            : null;
        const notificationRecord = options.existingNotification ??
            (await database.notifications.create({
                recipientId: recipient.id,
                tenantId: scope.tenantId,
                workspaceId: scope.workspaceId,
                notificationId: def.id,
                payload,
            }));
        if (!options.existingNotification) {
            await runHook("notification.created", {
                notification: notificationRecord,
            });
        }
        const inboxItems = [];
        const deliveries = [];
        const skippedChannels = [];
        const deferredChannels = [];
        for (const ch of def.channels) {
            if (onlySet && !onlySet.has(ch.type))
                continue;
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
                    tenantId: scope.tenantId,
                    workspaceId: scope.workspaceId,
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
                const renderCtx = { ...payload };
                if (unsubscribeConfig) {
                    renderCtx._unsubscribeUrl = buildUnsubscribeUrl(recipient, def.id, scope);
                }
                const subject = renderTemplate(ch.subject, renderCtx);
                const body = renderTemplate(ch.body, renderCtx);
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
                const job = {
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
                await queue.enqueue(job, (j) => processDeliveryJob(j));
                // Re-read after enqueue so inline queues return final state; async
                // queues return "pending" here (callers use drain() + deliveries.list).
                const latest = await database.deliveries.findById(delivery.id);
                deliveries.push(latest ?? delivery);
            }
            else if (ch.type === "webhook") {
                const provider = providers?.webhook;
                if (!provider) {
                    throw new NotifyKitError(`Notification "${def.id}" has a webhook channel but no webhook provider is configured.`);
                }
                const url = renderTemplate(ch.url, payload);
                const headers = {};
                if (ch.headers) {
                    for (const [k, v] of Object.entries(ch.headers)) {
                        headers[k] = renderTemplate(v, payload);
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
                const job = {
                    deliveryId: delivery.id,
                    notificationRecordId: notificationRecord.id,
                    recipientId: recipient.id,
                    tenantId: scope.tenantId,
                    workspaceId: scope.workspaceId,
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
    async function processDeliveryJob(job) {
        let lastError = null;
        for (let attempt = 1; attempt <= retry.maxAttempts; attempt++) {
            const wait = retry.delayMs(attempt);
            if (wait > 0) {
                await new Promise((r) => setTimeout(r, wait));
            }
            try {
                let result;
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
                }
                else {
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
                            tenantId: job.tenantId,
                            workspaceId: job.workspaceId,
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
        // Fallback channel: when a primary delivery terminally fails, drop an
        // inbox item so the user still sees the message. Respects preferences.
        const def = byId.get(job.notificationId);
        if (def?.fallback) {
            const preference = await database.preferences.get(job.recipientId, def.id, { tenantId: job.tenantId, workspaceId: job.workspaceId });
            const inboxAllowed = !preference || preference.channels.inbox !== false;
            if (inboxAllowed) {
                const fallback = def.fallback;
                const item = await database.inbox.create({
                    notificationRecordId: job.notificationRecordId,
                    recipientId: job.recipientId,
                    tenantId: job.tenantId,
                    workspaceId: job.workspaceId,
                    notificationId: job.notificationId,
                    title: renderTemplate(fallback.title, job.payload),
                    body: fallback.body !== undefined
                        ? renderTemplate(fallback.body, job.payload)
                        : undefined,
                    actionUrl: fallback.actionUrl !== undefined
                        ? renderTemplate(fallback.actionUrl, job.payload)
                        : undefined,
                });
                await runHook("inbox.created", { inboxItem: item });
            }
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
        const scope = resolveScope(input, recipient);
        return database.preferences.upsert({
            recipientId: input.recipientId,
            tenantId: scope.tenantId,
            workspaceId: scope.workspaceId,
            notificationId: input.notificationId,
            channels: input.channels,
        });
    }
    async function getPreference(rawInput) {
        const input = rawInput;
        const recipient = await database.recipients.findById(input.recipientId);
        if (!recipient)
            return null;
        const scope = resolveScope(input, recipient);
        return database.preferences.get(input.recipientId, input.notificationId, scope);
    }
    async function runFlushScheduledSends(options) {
        const force = options?.force ?? true;
        // Cancel in-memory timers. Any row that still had a pending timer is
        // by definition due or near-due; flush it inline.
        const scheduled = Array.from(scheduledSendTimers.entries());
        for (const [id, entry] of scheduled) {
            clearTimeout(entry.timer);
            scheduledSendTimers.delete(id);
            await flushScheduledSend(id).catch(() => { });
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
            if (row.status !== "pending")
                continue;
            await flushScheduledSend(row.id).catch(() => { });
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
            list(recipientId, scope) {
                return database.inbox.listByRecipient(recipientId, scope);
            },
            markRead(inboxItemId) {
                return database.inbox.markRead(inboxItemId);
            },
            markReadForRecipient(inboxItemId, recipientId, scope) {
                return database.inbox.markReadForRecipient(inboxItemId, recipientId, scope);
            },
        },
        deliveries: {
            list(recipientId, scope) {
                return database.deliveries.list(recipientId, scope);
            },
        },
        preferences: {
            get: getPreference,
            list(recipientId, scope) {
                return database.preferences.list(recipientId, scope);
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
            const errors = [];
            const attempted = new Set();
            // Fire scheduled timers immediately, each resolving its outer task.
            const scheduled = Array.from(scheduledFlushes.entries());
            for (const [key, entry] of scheduled) {
                attempted.add(key);
                clearTimeout(entry.timer);
                scheduledFlushes.delete(key);
                try {
                    await flushDigestKey(key, entry.def);
                }
                catch (err) {
                    errors.push(err);
                }
                entry.resolve();
            }
            // Catch any buckets that have no timer (e.g. left over from a restart).
            const leftover = await database.digests.list();
            for (const bucket of leftover) {
                if (attempted.has(bucket.key))
                    continue;
                const def = byId.get(bucket.notificationId);
                if (!def)
                    continue;
                try {
                    await flushDigestKey(bucket.key, def);
                }
                catch (err) {
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
//# sourceMappingURL=create-notifykit.js.map
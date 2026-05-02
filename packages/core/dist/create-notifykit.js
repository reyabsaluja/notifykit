import { defaultRetryPolicy, inlineQueue } from "./queues.js";
import { isWithinQuietHours, nextQuietHoursEnd } from "./quiet-hours.js";
import { GLOBAL_PREFERENCE_KEY, categoryPreferenceKey, isSyntheticPreferenceKey, } from "./preference-keys.js";
import { resolveChannel, resolvePreferences } from "./resolve-preferences.js";
import { signUnsubscribeToken } from "./unsubscribe.js";
import { NotifyKitError, extractTemplateVars, redactPayload, renderTemplate, validatePayload } from "./utils.js";
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
        if (def.channels.length === 0) {
            throw new NotifyKitError(`Notification "${def.id}" has no channels. Add at least one channel.`);
        }
        const schemaKeys = new Set(Object.keys(def.payload));
        const builtInVars = new Set(["_unsubscribeUrl"]);
        for (const ch of def.channels) {
            const templates = [];
            if (ch.type === "inbox") {
                templates.push(ch.title);
                if (ch.body)
                    templates.push(ch.body);
                if (ch.actionUrl)
                    templates.push(ch.actionUrl);
            }
            else if (ch.type === "email") {
                templates.push(ch.subject, ch.body);
            }
            else if (ch.type === "webhook") {
                templates.push(ch.url);
                if (ch.headers) {
                    for (const v of Object.values(ch.headers))
                        templates.push(v);
                }
            }
            for (const tmpl of templates) {
                const vars = extractTemplateVars(tmpl);
                for (const v of vars) {
                    if (!schemaKeys.has(v) && !builtInVars.has(v)) {
                        throw new NotifyKitError(`Notification "${def.id}" references template variable "{{${v}}}" ` +
                            `but the payload schema only defines: ${[...schemaKeys].join(", ") || "(none)"}. ` +
                            `Add "${v}" to the payload schema or fix the template.`);
                    }
                }
            }
        }
        if (def.fallback) {
            const templates = [def.fallback.title];
            if (def.fallback.body)
                templates.push(def.fallback.body);
            if (def.fallback.actionUrl)
                templates.push(def.fallback.actionUrl);
            for (const tmpl of templates) {
                const vars = extractTemplateVars(tmpl);
                for (const v of vars) {
                    if (!schemaKeys.has(v) && !builtInVars.has(v)) {
                        throw new NotifyKitError(`Notification "${def.id}" fallback references template variable "{{${v}}}" ` +
                            `but the payload schema only defines: ${[...schemaKeys].join(", ") || "(none)"}.`);
                    }
                }
            }
        }
        if (def.redact) {
            for (const field of def.redact) {
                if (!schemaKeys.has(String(field))) {
                    throw new NotifyKitError(`Notification "${def.id}" redact list includes "${String(field)}" ` +
                        `but the payload schema only defines: ${[...schemaKeys].join(", ") || "(none)"}.`);
                }
            }
        }
        if (def.version !== undefined && (!Number.isInteger(def.version) || def.version < 1)) {
            throw new NotifyKitError(`Notification "${def.id}" version must be a positive integer, got ${def.version}.`);
        }
        const channelTypes = new Set(def.channels.map((ch) => ch.type));
        if (channelTypes.has("email") && !providers?.email) {
            throw new NotifyKitError(`Notification "${def.id}" has an email channel but no email provider is configured. ` +
                `Pass a provider via createNotifyKit({ providers: { email: ... } }).`);
        }
        if (channelTypes.has("webhook") && !providers?.webhook) {
            throw new NotifyKitError(`Notification "${def.id}" has a webhook channel but no webhook provider is configured. ` +
                `Pass a provider via createNotifyKit({ providers: { webhook: ... } }).`);
        }
        if (def.classification &&
            def.classification !== "transactional" &&
            def.classification !== "product" &&
            def.classification !== "marketing") {
            throw new NotifyKitError(`Notification "${def.id}" has invalid classification "${def.classification}". ` +
                `Must be "transactional", "product", or "marketing".`);
        }
        if (def.defaultChannels) {
            for (const ch of Object.keys(def.defaultChannels)) {
                if (!channelTypes.has(ch)) {
                    throw new NotifyKitError(`Notification "${def.id}" defaultChannels references "${ch}" but the notification ` +
                        `only declares channels: ${[...channelTypes].join(", ")}.`);
                }
            }
        }
    }
    if (config.defaults?.categories) {
        const allCategories = new Set(notifications.map((n) => n.category).filter(Boolean));
        for (const cat of Object.keys(config.defaults.categories)) {
            if (!allCategories.has(cat)) {
                throw new NotifyKitError(`Category default "${cat}" does not match any registered notification category. ` +
                    `Known categories: ${[...allCategories].join(", ") || "(none)"}.`);
            }
        }
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
            throw new NotifyKitError(`Recipient "${recipient.id}" does not belong to the specified tenant.`);
        }
        if (input.workspaceId &&
            recipient.workspaceId &&
            input.workspaceId !== recipient.workspaceId) {
            throw new NotifyKitError(`Recipient "${recipient.id}" does not belong to the specified workspace.`);
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
    function redactForDef(def, payload) {
        if (!def.redact || def.redact.length === 0)
            return payload;
        return redactPayload(payload, def.redact);
    }
    function scopeKey(scope) {
        if (!scope.tenantId && !scope.workspaceId)
            return "";
        return `${scope.tenantId ?? ""}:${scope.workspaceId ?? ""}:`;
    }
    async function buildResolutionCtx(recipient, def, scope) {
        const [userGlobal, userCategory, userNotification, tenantChannels] = await Promise.all([
            database.preferences.get(recipient.id, GLOBAL_PREFERENCE_KEY, scope),
            def.category
                ? database.preferences.get(recipient.id, categoryPreferenceKey(def.category), scope)
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
        const payload = def.validate
            ? def.validate(input.payload)
            : validatePayload(def.payload, input.payload, def.id);
        const scope = resolveScope(input, recipient);
        // Resolve preferences once, early. This determines which channels are
        // allowed before we spend rate-limit budget or create digest entries.
        const resolutionCtx = await buildResolutionCtx(recipient, def, scope);
        const prefResult = resolvePreferences(resolutionCtx);
        const hasAnyAllowed = prefResult.channels.some((ch) => ch.allowed);
        // If every channel is disabled by preferences, skip entirely — no
        // rate-limit reservation, no digest buffer, no records.
        if (!hasAnyAllowed) {
            return {
                notification: null,
                inboxItems: [],
                deliveries: [],
                skippedChannels: prefResult.channels.map((ch) => ch.channel),
                deferredChannels: [],
                digested: false,
                rateLimited: false,
            };
        }
        if (def.rateLimit) {
            const limit = def.rateLimit;
            const rateLimitScope = limit.scope ?? "recipient";
            const key = rateLimitScope === "global"
                ? `${scopeKey(scope)}${def.id}`
                : `${scopeKey(scope)}${recipient.id}:${def.id}`;
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
        // until the window ends — but only if the channel is preference-allowed.
        const deferChannels = [];
        if (recipient.quietHours && isWithinQuietHours(recipient.quietHours)) {
            for (const ch of def.channels) {
                if (ch.type === "email" || ch.type === "webhook") {
                    const resolution = prefResult.channels.find((e) => e.channel === ch.type);
                    if (resolution?.allowed) {
                        deferChannels.push(ch.type);
                    }
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
            return deliver(recipient, def, payload, { deferChannels, scope, prefResult });
        }
        return deliver(recipient, def, payload, { scope, prefResult });
    }
    async function explain(rawInput) {
        const input = rawInput;
        const def = byId.get(input.notificationId);
        if (!def) {
            throw new NotifyKitError(`Unknown notification id: "${input.notificationId}".`);
        }
        const recipient = await database.recipients.findById(input.recipientId);
        if (!recipient) {
            throw new NotifyKitError(`Unknown recipient: "${input.recipientId}". Call upsertRecipient() first.`);
        }
        const scope = resolveScope(input, recipient);
        const prefExplanation = resolvePreferences(await buildResolutionCtx(recipient, def, scope));
        let wouldRateLimit = false;
        let rateLimitInfo = null;
        if (def.rateLimit) {
            const limit = def.rateLimit;
            const rateLimitScope = limit.scope ?? "recipient";
            const key = rateLimitScope === "global"
                ? `${scopeKey(scope)}${def.id}`
                : `${scopeKey(scope)}${recipient.id}:${def.id}`;
            const current = await database.rateLimits.count({
                key,
                windowMs: limit.windowMs,
            });
            wouldRateLimit = current >= limit.max;
            rateLimitInfo = { current, max: limit.max, windowMs: limit.windowMs };
        }
        const wouldDigest = !!def.digest;
        const digestInfo = def.digest
            ? { windowMs: def.digest.windowMs }
            : null;
        let quietHoursActive = false;
        let quietHoursResumesAt = null;
        let quietHoursInfo = null;
        if (recipient.quietHours) {
            quietHoursActive = isWithinQuietHours(recipient.quietHours);
            quietHoursResumesAt = quietHoursActive
                ? nextQuietHoursEnd(recipient.quietHours)
                : null;
            quietHoursInfo = { active: quietHoursActive, resumesAt: quietHoursResumesAt };
        }
        const channels = prefExplanation.channels.map((ch) => {
            let outcome;
            if (!ch.allowed) {
                outcome = ch.resolvedBy === "destination_unavailable"
                    ? "unavailable"
                    : "disabled";
            }
            else if (wouldRateLimit) {
                outcome = "rate_limited";
            }
            else if (wouldDigest) {
                outcome = "digested";
            }
            else if (quietHoursActive &&
                (ch.channel === "email" || ch.channel === "webhook")) {
                outcome = "delayed";
            }
            else {
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
            wouldRateLimit,
            wouldDigest,
            rateLimit: rateLimitInfo,
            digest: digestInfo,
            quietHours: quietHoursInfo,
        };
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
            // The payload was already validated (and potentially transformed) by
            // send() before being stored. Re-running a custom validator could
            // apply a non-idempotent transform a second time, so we only run the
            // built-in schema check here as a corruption guard.
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
            const validated = def.validate
                ? def.validate(combined)
                : validatePayload(def.payload, combined, def.id);
            await deliver(recipient, def, validated, { scope });
        }
        catch (err) {
            await database.digests.restore(entry);
            throw err;
        }
    }
    async function deliver(recipient, def, payload, options = {}) {
        const scope = options.scope ?? resolveScope({}, recipient);
        const explanation = options.prefResult
            ?? resolvePreferences(await buildResolutionCtx(recipient, def, scope));
        const isChannelAllowed = (type) => {
            const entry = explanation.channels.find((e) => e.channel === type);
            return entry?.allowed ?? true;
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
                payloadSchema: { ...def.payload },
                definitionVersion: def.version,
            }));
        if (!options.existingNotification) {
            await runHook("notification.created", {
                notification: notificationRecord,
                redactedPayload: redactForDef(def, notificationRecord.payload),
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
                // Startup validation guarantees providers.email exists for any
                // notification that declares an email channel.
                const provider = providers.email;
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
                // Startup validation guarantees providers.webhook exists for any
                // notification that declares a webhook channel.
                const provider = providers.webhook;
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
                    const provider = providers.email;
                    result = await provider.send({
                        to: job.to,
                        subject: job.subject,
                        body: job.body,
                    });
                }
                else {
                    const provider = providers.webhook;
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
                    const jobDef = byId.get(job.notificationId);
                    await runHook("delivery.sent", {
                        delivery: updated,
                        redactedPayload: jobDef
                            ? redactForDef(jobDef, job.payload)
                            : job.payload,
                    });
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
            const failedDef = byId.get(job.notificationId);
            await runHook("delivery.failed", {
                delivery: failed,
                error: lastError ?? new Error("Delivery failed"),
                redactedPayload: failedDef
                    ? redactForDef(failedDef, job.payload)
                    : job.payload,
            });
        }
        // Fallback channel: when a primary delivery terminally fails, drop an
        // inbox item so the user still sees the message. Uses the full layered
        // preference engine so app/category/tenant/global/required all apply.
        const def = byId.get(job.notificationId);
        if (def?.fallback) {
            const fallbackScope = {
                tenantId: job.tenantId,
                workspaceId: job.workspaceId,
            };
            const fallbackRecipient = await database.recipients.findById(job.recipientId);
            const [fbGlobal, fbCategory, fbNotification, fbTenant] = await Promise.all([
                database.preferences.get(job.recipientId, GLOBAL_PREFERENCE_KEY, fallbackScope),
                def.category
                    ? database.preferences.get(job.recipientId, categoryPreferenceKey(def.category), fallbackScope)
                    : Promise.resolve(null),
                database.preferences.get(job.recipientId, def.id, fallbackScope),
                fallbackScope.tenantId && config.tenantDefaults
                    ? Promise.resolve(config.tenantDefaults(fallbackScope.tenantId))
                    : Promise.resolve(null),
            ]);
            const inboxResolution = resolveChannel("inbox", {
                def,
                recipient: fallbackRecipient ?? { id: job.recipientId, createdAt: new Date(), updatedAt: new Date() },
                scope: fallbackScope,
                appDefaults: config.defaults?.channels,
                categoryDefaults: config.defaults?.categories,
                tenantChannels: fbTenant,
                userGlobal: fbGlobal,
                userCategory: fbCategory,
                userNotification: fbNotification,
            });
            const inboxAllowed = inboxResolution.allowed;
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
        explain,
        inbox: {
            list(recipientId, scope, filter) {
                return database.inbox.listByRecipient(recipientId, scope, filter);
            },
            markReadForRecipient(inboxItemId, recipientId, scope) {
                return database.inbox.markReadForRecipient(inboxItemId, recipientId, scope);
            },
            unreadCount(recipientId, scope) {
                return database.inbox.unreadCount(recipientId, scope);
            },
            markAllRead(recipientId, scope) {
                return database.inbox.markAllRead(recipientId, scope);
            },
            archiveForRecipient(inboxItemId, recipientId, scope) {
                return database.inbox.archiveForRecipient(inboxItemId, recipientId, scope);
            },
            unarchiveForRecipient(inboxItemId, recipientId, scope) {
                return database.inbox.unarchiveForRecipient(inboxItemId, recipientId, scope);
            },
            deleteForRecipient(inboxItemId, recipientId, scope) {
                return database.inbox.deleteForRecipient(inboxItemId, recipientId, scope);
            },
        },
        deliveries: {
            list(recipientId, scope) {
                return database.deliveries.list(recipientId, scope);
            },
        },
        preferences: {
            get: getPreference,
            async list(recipientId, scope) {
                const all = await database.preferences.list(recipientId, scope);
                return all.filter((p) => !isSyntheticPreferenceKey(p.notificationId));
            },
            update: updatePreference,
            async updateGlobal(input) {
                const recipient = await database.recipients.findById(input.recipientId);
                if (!recipient) {
                    throw new NotifyKitError(`Unknown recipient: "${input.recipientId}". Call upsertRecipient() first.`);
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
                    throw new NotifyKitError(`Unknown recipient: "${input.recipientId}". Call upsertRecipient() first.`);
                }
                const knownCategories = new Set(notifications.map((n) => n.category).filter(Boolean));
                if (!knownCategories.has(input.category)) {
                    throw new NotifyKitError(`Unknown category: "${input.category}". ` +
                        `Known categories: ${[...knownCategories].join(", ") || "(none)"}.`);
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
                    throw new NotifyKitError(`Unknown notification id: "${input.notificationId}".`);
                }
                const recipient = await database.recipients.findById(input.recipientId);
                if (!recipient) {
                    throw new NotifyKitError(`Unknown recipient: "${input.recipientId}". Call upsertRecipient() first.`);
                }
                const scope = resolveScope(input, recipient);
                return resolvePreferences(await buildResolutionCtx(recipient, def, scope));
            },
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
        redactPayload(notificationId, payload) {
            const def = byId.get(notificationId);
            if (!def) {
                throw new NotifyKitError(`Unknown notification id: "${notificationId}". Cannot redact payload for an unregistered definition.`);
            }
            if (!def.redact || def.redact.length === 0)
                return payload;
            return redactPayload(payload, def.redact);
        },
    };
}
//# sourceMappingURL=create-notifykit.js.map
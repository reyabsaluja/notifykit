import { createId } from "./utils.js";
export function memoryAdapter() {
    const state = {
        recipients: [],
        notifications: [],
        inboxItems: [],
        deliveries: [],
        preferences: [],
        digests: [],
        rateLimits: [],
        scheduledSends: [],
    };
    const adapter = {
        _state: state,
        recipients: {
            async upsert(input) {
                const now = new Date();
                const existing = state.recipients.find((r) => r.id === input.id);
                if (existing) {
                    if (input.email !== undefined)
                        existing.email = input.email;
                    if (input.name !== undefined)
                        existing.name = input.name;
                    if (input.quietHours !== undefined) {
                        existing.quietHours = input.quietHours;
                    }
                    existing.updatedAt = now;
                    return existing;
                }
                const recipient = {
                    id: input.id,
                    email: input.email,
                    name: input.name,
                    quietHours: input.quietHours ?? undefined,
                    createdAt: now,
                    updatedAt: now,
                };
                state.recipients.push(recipient);
                return recipient;
            },
            async findById(id) {
                return state.recipients.find((r) => r.id === id) ?? null;
            },
        },
        notifications: {
            async create(input) {
                const record = {
                    id: createId("ntf"),
                    recipientId: input.recipientId,
                    notificationId: input.notificationId,
                    payload: input.payload,
                    createdAt: new Date(),
                };
                state.notifications.push(record);
                return record;
            },
        },
        inbox: {
            async create(input) {
                const item = {
                    id: createId("inb"),
                    notificationRecordId: input.notificationRecordId,
                    recipientId: input.recipientId,
                    notificationId: input.notificationId,
                    title: input.title,
                    body: input.body,
                    actionUrl: input.actionUrl,
                    readAt: null,
                    createdAt: new Date(),
                };
                state.inboxItems.push(item);
                return item;
            },
            async listByRecipient(recipientId) {
                return state.inboxItems
                    .filter((i) => i.recipientId === recipientId)
                    .slice()
                    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
            },
            async markRead(inboxItemId) {
                const item = state.inboxItems.find((i) => i.id === inboxItemId);
                if (!item)
                    return null;
                item.readAt = new Date();
                return item;
            },
            async markReadForRecipient(inboxItemId, recipientId) {
                const item = state.inboxItems.find((i) => i.id === inboxItemId);
                if (!item)
                    return { status: "not_found" };
                if (item.recipientId !== recipientId)
                    return { status: "forbidden" };
                item.readAt = new Date();
                return { status: "marked", item };
            },
        },
        deliveries: {
            async create(input) {
                const now = new Date();
                const record = {
                    id: createId("dlv"),
                    notificationRecordId: input.notificationRecordId,
                    recipientId: input.recipientId,
                    notificationId: input.notificationId,
                    channel: input.channel,
                    provider: input.provider,
                    status: input.status,
                    to: input.to,
                    subject: input.subject,
                    body: input.body,
                    providerMessageId: input.providerMessageId,
                    error: input.error,
                    attempts: input.attempts ?? 0,
                    createdAt: now,
                    updatedAt: now,
                    sentAt: input.sentAt ?? null,
                    failedAt: input.failedAt ?? null,
                };
                state.deliveries.push(record);
                return record;
            },
            async findById(id) {
                return state.deliveries.find((d) => d.id === id) ?? null;
            },
            async update(id, patch) {
                const existing = state.deliveries.find((d) => d.id === id);
                if (!existing)
                    return null;
                Object.assign(existing, patch);
                existing.updatedAt = new Date();
                return existing;
            },
            async list(recipientId) {
                if (recipientId === undefined) {
                    return state.deliveries
                        .slice()
                        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
                }
                return state.deliveries
                    .filter((d) => d.recipientId === recipientId)
                    .slice()
                    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
            },
        },
        preferences: {
            async get(recipientId, notificationId) {
                return (state.preferences.find((p) => p.recipientId === recipientId &&
                    p.notificationId === notificationId) ?? null);
            },
            async list(recipientId) {
                return state.preferences
                    .filter((p) => p.recipientId === recipientId)
                    .slice();
            },
            async upsert(input) {
                const existing = state.preferences.find((p) => p.recipientId === input.recipientId &&
                    p.notificationId === input.notificationId);
                const now = new Date();
                if (existing) {
                    existing.channels = { ...existing.channels, ...input.channels };
                    existing.updatedAt = now;
                    return existing;
                }
                const record = {
                    recipientId: input.recipientId,
                    notificationId: input.notificationId,
                    channels: { ...input.channels },
                    updatedAt: now,
                };
                state.preferences.push(record);
                return record;
            },
        },
        digests: {
            async append(input) {
                const now = new Date();
                const existing = state.digests.find((d) => d.key === input.key);
                if (existing) {
                    existing.payloads.push(input.payload);
                    existing.updatedAt = now;
                    return existing;
                }
                const entry = {
                    key: input.key,
                    recipientId: input.recipientId,
                    notificationId: input.notificationId,
                    payloads: [input.payload],
                    flushAt: new Date(now.getTime() + input.windowMs),
                    createdAt: now,
                    updatedAt: now,
                };
                state.digests.push(entry);
                return entry;
            },
            async take(key) {
                const idx = state.digests.findIndex((d) => d.key === key);
                if (idx < 0)
                    return null;
                const [entry] = state.digests.splice(idx, 1);
                return entry ?? null;
            },
            async restore(entry) {
                const existing = state.digests.find((d) => d.key === entry.key);
                if (existing) {
                    existing.payloads = [...entry.payloads, ...existing.payloads];
                    existing.recipientId = entry.recipientId;
                    existing.notificationId = entry.notificationId;
                    existing.flushAt = entry.flushAt;
                    existing.createdAt = entry.createdAt;
                    existing.updatedAt = new Date();
                    return existing;
                }
                state.digests.push({
                    ...entry,
                    payloads: entry.payloads.slice(),
                });
                return entry;
            },
            async list() {
                return state.digests.slice();
            },
        },
        rateLimits: {
            async reserve(input) {
                // Memory adapter runs on a single event-loop turn — this block is
                // effectively atomic because there are no awaits between count and
                // push. Prune aged rows, count, and (if under max) record in one go.
                const cutoff = Date.now() - input.windowMs;
                state.rateLimits = state.rateLimits.filter((e) => e.occurredAt.getTime() >= cutoff);
                let n = 0;
                for (const e of state.rateLimits) {
                    if (e.key === input.key)
                        n++;
                }
                if (n >= input.max)
                    return { allowed: false };
                const event = {
                    key: input.key,
                    recipientId: input.recipientId,
                    notificationId: input.notificationId,
                    occurredAt: new Date(),
                };
                state.rateLimits.push(event);
                return { allowed: true };
            },
            async count(input) {
                const cutoff = Date.now() - input.windowMs;
                state.rateLimits = state.rateLimits.filter((e) => e.occurredAt.getTime() >= cutoff);
                let n = 0;
                for (const e of state.rateLimits) {
                    if (e.key === input.key)
                        n++;
                }
                return n;
            },
        },
        scheduledSends: {
            async create(input) {
                const record = {
                    id: createId("sch"),
                    recipientId: input.recipientId,
                    notificationId: input.notificationId,
                    payload: input.payload,
                    scheduledFor: input.scheduledFor,
                    reason: input.reason,
                    status: input.status ?? "pending",
                    claimedAt: null,
                    createdAt: new Date(),
                };
                state.scheduledSends.push(record);
                return record;
            },
            async claim(id) {
                const record = state.scheduledSends.find((s) => s.id === id);
                if (!record)
                    return null;
                if (record.status !== "pending")
                    return null;
                record.status = "claimed";
                record.claimedAt = new Date();
                return { ...record };
            },
            async complete(id) {
                const idx = state.scheduledSends.findIndex((s) => s.id === id);
                if (idx >= 0)
                    state.scheduledSends.splice(idx, 1);
            },
            async release(id) {
                const record = state.scheduledSends.find((s) => s.id === id);
                if (!record)
                    return;
                record.status = "pending";
                record.claimedAt = null;
            },
            async listDue(now) {
                const t = now.getTime();
                return state.scheduledSends
                    .filter((s) => s.status === "pending" && s.scheduledFor.getTime() <= t)
                    .map((s) => ({ ...s }));
            },
            async list() {
                return state.scheduledSends.map((s) => ({ ...s }));
            },
        },
    };
    return adapter;
}
//# sourceMappingURL=memory-adapter.js.map
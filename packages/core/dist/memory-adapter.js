import { createId } from "./utils.js";
export function memoryAdapter() {
    const state = {
        recipients: [],
        notifications: [],
        inboxItems: [],
        deliveries: [],
        preferences: [],
        digests: [],
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
                    existing.updatedAt = now;
                    return existing;
                }
                const recipient = {
                    id: input.id,
                    email: input.email,
                    name: input.name,
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
            async list() {
                return state.digests.slice();
            },
        },
    };
    return adapter;
}
//# sourceMappingURL=memory-adapter.js.map
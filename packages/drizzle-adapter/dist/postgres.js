import { and, desc, eq, gte, lt, lte, sql } from "drizzle-orm";
import { deliveries, digestBuffers, inboxItems, notifications, preferences, rateLimitEvents, recipients, scheduledSends, } from "./schema/postgres.js";
function createId(prefix) {
    const rand = Math.random().toString(36).slice(2, 10);
    const time = Date.now().toString(36);
    return `${prefix}_${time}${rand}`;
}
export function drizzlePostgresAdapter(db) {
    return {
        _schema: {
            recipients,
            notifications,
            inboxItems,
            deliveries,
            preferences,
            digestBuffers,
            rateLimitEvents,
            scheduledSends,
        },
        recipients: {
            async upsert(input) {
                // Postgres ON CONFLICT upsert. Columns are coalesced so that
                // omitted (undefined) fields preserve their current value. For
                // quietHours we treat null as "clear explicitly" — distinguishing
                // it from undefined requires a two-step approach.
                const now = new Date();
                // Fast path: if all optional fields are undefined, we still need to
                // preserve them on update; coalesce handles that via EXCLUDED.
                const rows = await db
                    .insert(recipients)
                    .values({
                    id: input.id,
                    email: input.email ?? null,
                    name: input.name ?? null,
                    quietHours: input.quietHours ?? null,
                    createdAt: now,
                    updatedAt: now,
                })
                    .onConflictDoUpdate({
                    target: recipients.id,
                    set: {
                        email: input.email !== undefined
                            ? input.email ?? null
                            : sql `${recipients.email}`,
                        name: input.name !== undefined
                            ? input.name ?? null
                            : sql `${recipients.name}`,
                        quietHours: input.quietHours !== undefined
                            ? (input.quietHours ?? null)
                            : sql `${recipients.quietHours}`,
                        updatedAt: now,
                    },
                })
                    .returning();
                const row = rows[0];
                return {
                    id: row.id,
                    email: row.email ?? undefined,
                    name: row.name ?? undefined,
                    quietHours: row.quietHours ?? undefined,
                    createdAt: row.createdAt,
                    updatedAt: row.updatedAt,
                };
            },
            async findById(id) {
                const rows = await db
                    .select()
                    .from(recipients)
                    .where(eq(recipients.id, id))
                    .limit(1);
                const row = rows[0];
                if (!row)
                    return null;
                return {
                    id: row.id,
                    email: row.email ?? undefined,
                    name: row.name ?? undefined,
                    quietHours: row.quietHours ?? undefined,
                    createdAt: row.createdAt,
                    updatedAt: row.updatedAt,
                };
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
                await db.insert(notifications).values(record);
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
                await db.insert(inboxItems).values({
                    id: item.id,
                    notificationRecordId: item.notificationRecordId,
                    recipientId: item.recipientId,
                    notificationId: item.notificationId,
                    title: item.title,
                    body: item.body ?? null,
                    actionUrl: item.actionUrl ?? null,
                    readAt: null,
                    createdAt: item.createdAt,
                });
                return item;
            },
            async listByRecipient(recipientId) {
                const rows = await db
                    .select()
                    .from(inboxItems)
                    .where(eq(inboxItems.recipientId, recipientId))
                    .orderBy(desc(inboxItems.createdAt));
                return rows.map((r) => ({
                    id: r.id,
                    notificationRecordId: r.notificationRecordId,
                    recipientId: r.recipientId,
                    notificationId: r.notificationId,
                    title: r.title,
                    body: r.body ?? undefined,
                    actionUrl: r.actionUrl ?? undefined,
                    readAt: r.readAt ?? null,
                    createdAt: r.createdAt,
                }));
            },
            async markRead(inboxItemId) {
                const now = new Date();
                const updated = await db
                    .update(inboxItems)
                    .set({ readAt: now })
                    .where(eq(inboxItems.id, inboxItemId))
                    .returning();
                const row = updated[0];
                if (!row)
                    return null;
                return {
                    id: row.id,
                    notificationRecordId: row.notificationRecordId,
                    recipientId: row.recipientId,
                    notificationId: row.notificationId,
                    title: row.title,
                    body: row.body ?? undefined,
                    actionUrl: row.actionUrl ?? undefined,
                    readAt: row.readAt ?? null,
                    createdAt: row.createdAt,
                };
            },
            async markReadForRecipient(inboxItemId, recipientId) {
                const now = new Date();
                const updated = await db
                    .update(inboxItems)
                    .set({ readAt: now })
                    .where(and(eq(inboxItems.id, inboxItemId), eq(inboxItems.recipientId, recipientId)))
                    .returning();
                const row = updated[0];
                if (row) {
                    return {
                        status: "marked",
                        item: {
                            id: row.id,
                            notificationRecordId: row.notificationRecordId,
                            recipientId: row.recipientId,
                            notificationId: row.notificationId,
                            title: row.title,
                            body: row.body ?? undefined,
                            actionUrl: row.actionUrl ?? undefined,
                            readAt: row.readAt ?? null,
                            createdAt: row.createdAt,
                        },
                    };
                }
                const existing = await db
                    .select({ id: inboxItems.id })
                    .from(inboxItems)
                    .where(eq(inboxItems.id, inboxItemId))
                    .limit(1);
                return existing[0] ? { status: "forbidden" } : { status: "not_found" };
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
                await db.insert(deliveries).values({
                    id: record.id,
                    notificationRecordId: record.notificationRecordId,
                    recipientId: record.recipientId,
                    notificationId: record.notificationId,
                    channel: record.channel,
                    provider: record.provider,
                    status: record.status,
                    to: record.to ?? null,
                    subject: record.subject ?? null,
                    body: record.body ?? null,
                    providerMessageId: record.providerMessageId ?? null,
                    error: record.error ?? null,
                    attempts: record.attempts,
                    createdAt: record.createdAt,
                    updatedAt: record.updatedAt,
                    sentAt: record.sentAt ?? null,
                    failedAt: record.failedAt ?? null,
                });
                return record;
            },
            async findById(id) {
                const rows = await db
                    .select()
                    .from(deliveries)
                    .where(eq(deliveries.id, id))
                    .limit(1);
                const row = rows[0];
                return row ? rowToDelivery(row) : null;
            },
            async update(id, patch) {
                const set = { ...patch, updatedAt: new Date() };
                const updated = await db
                    .update(deliveries)
                    .set(set)
                    .where(eq(deliveries.id, id))
                    .returning();
                const row = updated[0];
                if (!row)
                    return null;
                return rowToDelivery(row);
            },
            async list(recipientId) {
                const query = db.select().from(deliveries);
                const rows = recipientId
                    ? await query
                        .where(eq(deliveries.recipientId, recipientId))
                        .orderBy(desc(deliveries.createdAt))
                    : await query.orderBy(desc(deliveries.createdAt));
                return rows.map(rowToDelivery);
            },
        },
        preferences: {
            async get(recipientId, notificationId) {
                const rows = await db
                    .select()
                    .from(preferences)
                    .where(and(eq(preferences.recipientId, recipientId), eq(preferences.notificationId, notificationId)))
                    .limit(1);
                const row = rows[0];
                if (!row)
                    return null;
                return {
                    recipientId: row.recipientId,
                    notificationId: row.notificationId,
                    channels: row.channels,
                    updatedAt: row.updatedAt,
                };
            },
            async list(recipientId) {
                const rows = await db
                    .select()
                    .from(preferences)
                    .where(eq(preferences.recipientId, recipientId));
                return rows.map((r) => ({
                    recipientId: r.recipientId,
                    notificationId: r.notificationId,
                    channels: r.channels,
                    updatedAt: r.updatedAt,
                }));
            },
            async upsert(input) {
                // Native upsert that merges channel flags via jsonb concatenation.
                // `EXCLUDED.channels` is the incoming object; `||` merges keys with
                // the incoming side taking precedence. This matches the sqlite
                // adapter's semantics (shallow merge) but is a single atomic row op.
                const now = new Date();
                const rows = await db
                    .insert(preferences)
                    .values({
                    recipientId: input.recipientId,
                    notificationId: input.notificationId,
                    channels: input.channels,
                    updatedAt: now,
                })
                    .onConflictDoUpdate({
                    target: [preferences.recipientId, preferences.notificationId],
                    set: {
                        channels: sql `${preferences.channels} || EXCLUDED.channels`,
                        updatedAt: now,
                    },
                })
                    .returning();
                const row = rows[0];
                return {
                    recipientId: row.recipientId,
                    notificationId: row.notificationId,
                    channels: row.channels,
                    updatedAt: row.updatedAt,
                };
            },
        },
        digests: {
            // Native atomic upsert. Postgres evaluates ON CONFLICT DO UPDATE as a
            // single row-level operation under a row lock, so concurrent appends
            // to the same key cannot clobber each other — no JS mutex required.
            // The jsonb `||` concatenation merges the incoming single-element
            // array with the existing buffer.
            async append(input) {
                const now = new Date();
                const flushAt = new Date(now.getTime() + input.windowMs);
                const rows = await db
                    .insert(digestBuffers)
                    .values({
                    key: input.key,
                    recipientId: input.recipientId,
                    notificationId: input.notificationId,
                    payloads: [input.payload],
                    flushAt,
                    createdAt: now,
                    updatedAt: now,
                })
                    .onConflictDoUpdate({
                    target: digestBuffers.key,
                    set: {
                        payloads: sql `${digestBuffers.payloads} || EXCLUDED.payloads`,
                        updatedAt: now,
                    },
                })
                    .returning();
                const row = rows[0];
                return {
                    key: row.key,
                    recipientId: row.recipientId,
                    notificationId: row.notificationId,
                    payloads: row.payloads,
                    flushAt: row.flushAt,
                    createdAt: row.createdAt,
                    updatedAt: row.updatedAt,
                };
            },
            async take(key) {
                const rows = await db
                    .delete(digestBuffers)
                    .where(eq(digestBuffers.key, key))
                    .returning();
                const row = rows[0];
                if (!row)
                    return null;
                return {
                    key: row.key,
                    recipientId: row.recipientId,
                    notificationId: row.notificationId,
                    payloads: row.payloads,
                    flushAt: row.flushAt,
                    createdAt: row.createdAt,
                    updatedAt: row.updatedAt,
                };
            },
            async restore(entry) {
                // If a newer bucket showed up for the same key between take() and
                // restore(), prepend the restored payloads so nothing is lost.
                // Doing this in a single SQL statement keeps it race-free against
                // further concurrent appends: the row lock Postgres takes for
                // INSERT ... ON CONFLICT DO UPDATE serializes with any concurrent
                // appends targeting the same primary key.
                const now = new Date();
                const rows = await db
                    .insert(digestBuffers)
                    .values({
                    key: entry.key,
                    recipientId: entry.recipientId,
                    notificationId: entry.notificationId,
                    payloads: entry.payloads,
                    flushAt: entry.flushAt,
                    createdAt: entry.createdAt,
                    updatedAt: entry.updatedAt,
                })
                    .onConflictDoUpdate({
                    target: digestBuffers.key,
                    set: {
                        payloads: sql `EXCLUDED.payloads || ${digestBuffers.payloads}`,
                        updatedAt: now,
                    },
                })
                    .returning();
                const row = rows[0];
                return {
                    key: row.key,
                    recipientId: row.recipientId,
                    notificationId: row.notificationId,
                    payloads: row.payloads,
                    flushAt: row.flushAt,
                    createdAt: row.createdAt,
                    updatedAt: row.updatedAt,
                };
            },
            async list() {
                const rows = await db.select().from(digestBuffers);
                return rows.map((row) => ({
                    key: row.key,
                    recipientId: row.recipientId,
                    notificationId: row.notificationId,
                    payloads: row.payloads,
                    flushAt: row.flushAt,
                    createdAt: row.createdAt,
                    updatedAt: row.updatedAt,
                }));
            },
        },
        rateLimits: {
            async reserve(input) {
                // Multi-process safe: a transaction-scoped advisory lock keyed by
                // hashtext(key) serializes read-modify-write across every connection
                // reserving the same key. The lock is released on COMMIT. No rows
                // need to exist yet — the lock namespace is independent.
                return await db.transaction(async (tx) => {
                    await tx.execute(sql `SELECT pg_advisory_xact_lock(hashtext(${input.key}))`);
                    const cutoff = new Date(Date.now() - input.windowMs);
                    await tx
                        .delete(rateLimitEvents)
                        .where(lt(rateLimitEvents.occurredAt, cutoff));
                    const rows = await tx
                        .select({ id: rateLimitEvents.id })
                        .from(rateLimitEvents)
                        .where(and(eq(rateLimitEvents.key, input.key), gte(rateLimitEvents.occurredAt, cutoff)));
                    if (rows.length >= input.max) {
                        return { allowed: false };
                    }
                    await tx.insert(rateLimitEvents).values({
                        id: createId("rlm"),
                        key: input.key,
                        recipientId: input.recipientId,
                        notificationId: input.notificationId,
                        occurredAt: new Date(),
                    });
                    return { allowed: true };
                });
            },
            async count(input) {
                const cutoff = new Date(Date.now() - input.windowMs);
                await db
                    .delete(rateLimitEvents)
                    .where(lt(rateLimitEvents.occurredAt, cutoff));
                const rows = await db
                    .select()
                    .from(rateLimitEvents)
                    .where(and(eq(rateLimitEvents.key, input.key), gte(rateLimitEvents.occurredAt, cutoff)));
                return rows.length;
            },
        },
        scheduledSends: {
            async create(input) {
                const status = input.status ?? "pending";
                const record = {
                    id: createId("sch"),
                    recipientId: input.recipientId,
                    notificationId: input.notificationId,
                    payload: input.payload,
                    scheduledFor: input.scheduledFor,
                    reason: input.reason,
                    status,
                    claimedAt: null,
                    createdAt: new Date(),
                };
                await db.insert(scheduledSends).values({
                    id: record.id,
                    recipientId: record.recipientId,
                    notificationId: record.notificationId,
                    payload: record.payload,
                    scheduledFor: record.scheduledFor,
                    reason: record.reason,
                    status,
                    claimedAt: null,
                    createdAt: record.createdAt,
                });
                return record;
            },
            async claim(id) {
                // Atomic compare-and-set. UPDATE ... WHERE status = 'pending'
                // + RETURNING is race-free across workers; at most one wins.
                const now = new Date();
                const rows = await db
                    .update(scheduledSends)
                    .set({ status: "claimed", claimedAt: now })
                    .where(and(eq(scheduledSends.id, id), eq(scheduledSends.status, "pending")))
                    .returning();
                const row = rows[0];
                if (!row)
                    return null;
                return {
                    id: row.id,
                    recipientId: row.recipientId,
                    notificationId: row.notificationId,
                    payload: row.payload,
                    scheduledFor: row.scheduledFor,
                    reason: row.reason,
                    status: row.status,
                    claimedAt: row.claimedAt ?? null,
                    createdAt: row.createdAt,
                };
            },
            async complete(id) {
                await db.delete(scheduledSends).where(eq(scheduledSends.id, id));
            },
            async release(id) {
                await db
                    .update(scheduledSends)
                    .set({ status: "pending", claimedAt: null })
                    .where(eq(scheduledSends.id, id));
            },
            async listDue(now) {
                const rows = await db
                    .select()
                    .from(scheduledSends)
                    .where(and(eq(scheduledSends.status, "pending"), lte(scheduledSends.scheduledFor, now)));
                return rows.map((row) => ({
                    id: row.id,
                    recipientId: row.recipientId,
                    notificationId: row.notificationId,
                    payload: row.payload,
                    scheduledFor: row.scheduledFor,
                    reason: row.reason,
                    status: row.status,
                    claimedAt: row.claimedAt ?? null,
                    createdAt: row.createdAt,
                }));
            },
            async list() {
                const rows = await db.select().from(scheduledSends);
                return rows.map((row) => ({
                    id: row.id,
                    recipientId: row.recipientId,
                    notificationId: row.notificationId,
                    payload: row.payload,
                    scheduledFor: row.scheduledFor,
                    reason: row.reason,
                    status: row.status,
                    claimedAt: row.claimedAt ?? null,
                    createdAt: row.createdAt,
                }));
            },
        },
    };
}
function rowToDelivery(row) {
    return {
        id: row.id,
        notificationRecordId: row.notificationRecordId,
        recipientId: row.recipientId,
        notificationId: row.notificationId,
        channel: row.channel,
        provider: row.provider,
        status: row.status,
        to: row.to ?? undefined,
        subject: row.subject ?? undefined,
        body: row.body ?? undefined,
        providerMessageId: row.providerMessageId ?? undefined,
        error: row.error ?? undefined,
        attempts: row.attempts,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        sentAt: row.sentAt ?? null,
        failedAt: row.failedAt ?? null,
    };
}
//# sourceMappingURL=postgres.js.map
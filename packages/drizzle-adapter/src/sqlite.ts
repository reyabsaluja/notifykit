import type {
  ChannelPreferenceMap,
  DatabaseAdapter,
  DeliveryRecord,
  DigestBufferEntry,
  InboxDeleteForRecipientResult,
  InboxItem,
  InboxItemForRecipientResult,
  InboxListFilter,
  NotificationRecord,
  QuietHours,
  Recipient,
  RecipientPreference,
  ScheduledSend,
  SecurityScope,
  UpsertRecipientInput,
} from "notifykit";
import { and, count as drizzleCount, desc, eq, gte, isNull, isNotNull, lt, lte } from "drizzle-orm";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";

import {
  deliveries,
  digestBuffers,
  inboxItems,
  notifications,
  preferences,
  rateLimitEvents,
  recipients,
  scheduledSends,
} from "./schema/sqlite.js";

function createId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 10);
  const time = Date.now().toString(36);
  return `${prefix}_${time}${rand}`;
}

function scopeValue(value: string | undefined): string {
  return value ?? "";
}

function emptyToUndefined(value: string | null | undefined): string | undefined {
  return value ? value : undefined;
}

function scopedConditions(
  table: { tenantId: any; workspaceId: any },
  scope?: SecurityScope,
) {
  const conditions = [];
  if (scope?.tenantId !== undefined) {
    conditions.push(eq(table.tenantId, scope.tenantId));
  }
  if (scope?.workspaceId !== undefined) {
    conditions.push(eq(table.workspaceId, scope.workspaceId));
  }
  return conditions;
}

function preferenceScopeConditions(scope?: SecurityScope) {
  return [
    eq(preferences.tenantId, scopeValue(scope?.tenantId)),
    eq(preferences.workspaceId, scopeValue(scope?.workspaceId)),
  ];
}

/**
 * Process-local serialization for the adapter's atomic operations.
 *
 * drizzle-orm's `db.transaction(async ...)` on sync drivers (Bun SQLite,
 * better-sqlite3) commits the underlying transaction before the async body
 * yields back, so wrapping a check-then-write in `transaction(async)` does
 * NOT prevent two concurrent callers from seeing the same pre-write state.
 *
 * A JS-level mutex is both simple and correct for the single-process case:
 * it serializes our read-modify-write blocks so at most one is active at a
 * time. For multi-process deployments you'd add SELECT ... FOR UPDATE
 * (Postgres) or rely on SQLite's writer lock with BEGIN IMMEDIATE — both are
 * separate adapter variants.
 */
function createMutex() {
  let tail: Promise<unknown> = Promise.resolve();
  return async function run<T>(fn: () => Promise<T>): Promise<T> {
    const prev = tail;
    let release!: () => void;
    const mine = new Promise<void>((r) => (release = r));
    tail = mine;
    try {
      await prev;
      return await fn();
    } finally {
      release();
    }
  };
}

type SqliteDb = BaseSQLiteDatabase<"sync" | "async", unknown, any, any>;

export type DrizzleSqliteAdapter = DatabaseAdapter & {
  _schema: {
    recipients: typeof recipients;
    notifications: typeof notifications;
    inboxItems: typeof inboxItems;
    deliveries: typeof deliveries;
    preferences: typeof preferences;
    digestBuffers: typeof digestBuffers;
    rateLimitEvents: typeof rateLimitEvents;
    scheduledSends: typeof scheduledSends;
  };
};

export function drizzleSqliteAdapter(db: SqliteDb): DrizzleSqliteAdapter {
  const atomic = createMutex();
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
      async upsert(input: UpsertRecipientInput): Promise<Recipient> {
        return atomic(async () => {
          const now = new Date();
          const existing = await db
            .select()
            .from(recipients)
            .where(eq(recipients.id, input.id))
            .limit(1);

          const current = existing[0];
          if (current) {
            const next = {
              tenantId:
                input.tenantId !== undefined ? input.tenantId : current.tenantId,
              workspaceId:
                input.workspaceId !== undefined
                  ? input.workspaceId
                  : current.workspaceId,
              email: input.email !== undefined ? input.email : current.email,
              name: input.name !== undefined ? input.name : current.name,
              quietHours:
                input.quietHours !== undefined
                  ? input.quietHours
                  : current.quietHours,
              updatedAt: now,
            };
            await db
              .update(recipients)
              .set(next)
              .where(eq(recipients.id, input.id));
            return {
              id: current.id,
              tenantId: next.tenantId ?? undefined,
              workspaceId: next.workspaceId ?? undefined,
              email: next.email ?? undefined,
              name: next.name ?? undefined,
              quietHours: (next.quietHours as QuietHours | null | undefined) ?? undefined,
              createdAt: current.createdAt,
              updatedAt: now,
            };
          }

          await db.insert(recipients).values({
            id: input.id,
            tenantId: input.tenantId,
            workspaceId: input.workspaceId,
            email: input.email,
            name: input.name,
            quietHours: input.quietHours ?? null,
            createdAt: now,
            updatedAt: now,
          });
          return {
            id: input.id,
            tenantId: input.tenantId,
            workspaceId: input.workspaceId,
            email: input.email,
            name: input.name,
            quietHours: input.quietHours ?? undefined,
            createdAt: now,
            updatedAt: now,
          };
        });
      },

      async findById(id: string): Promise<Recipient | null> {
        const rows = await db
          .select()
          .from(recipients)
          .where(eq(recipients.id, id))
          .limit(1);
        const row = rows[0];
        if (!row) return null;
        return {
          id: row.id,
          tenantId: row.tenantId ?? undefined,
          workspaceId: row.workspaceId ?? undefined,
          email: row.email ?? undefined,
          name: row.name ?? undefined,
          quietHours: (row.quietHours as QuietHours | null | undefined) ?? undefined,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        };
      },
    },

    notifications: {
      async create(input): Promise<NotificationRecord> {
        const record: NotificationRecord = {
          id: createId("ntf"),
          recipientId: input.recipientId,
          tenantId: input.tenantId,
          workspaceId: input.workspaceId,
          notificationId: input.notificationId,
          payload: input.payload,
          payloadSchema: input.payloadSchema,
          definitionVersion: input.definitionVersion,
          createdAt: new Date(),
        };
        await db.insert(notifications).values({
          ...record,
          tenantId: record.tenantId ?? null,
          workspaceId: record.workspaceId ?? null,
          payloadSchema: record.payloadSchema ?? null,
          definitionVersion: record.definitionVersion ?? null,
        });
        return record;
      },
    },

    inbox: {
      async create(input): Promise<InboxItem> {
        const item: InboxItem = {
          id: createId("inb"),
          notificationRecordId: input.notificationRecordId,
          recipientId: input.recipientId,
          tenantId: input.tenantId,
          workspaceId: input.workspaceId,
          notificationId: input.notificationId,
          title: input.title,
          body: input.body,
          actionUrl: input.actionUrl,
          readAt: null,
          archivedAt: null,
          createdAt: new Date(),
        };
        await db.insert(inboxItems).values({
          id: item.id,
          notificationRecordId: item.notificationRecordId,
          recipientId: item.recipientId,
          tenantId: item.tenantId ?? null,
          workspaceId: item.workspaceId ?? null,
          notificationId: item.notificationId,
          title: item.title,
          body: item.body ?? null,
          actionUrl: item.actionUrl ?? null,
          readAt: null,
          archivedAt: null,
          createdAt: item.createdAt,
        });
        return item;
      },

      async listByRecipient(
        recipientId: string,
        scope?: SecurityScope,
        filter?: InboxListFilter,
      ): Promise<InboxItem[]> {
        const conditions = [
          eq(inboxItems.recipientId, recipientId),
          ...scopedConditions(inboxItems, scope),
        ];
        if (filter?.archived === true) {
          conditions.push(isNotNull(inboxItems.archivedAt));
        } else {
          conditions.push(isNull(inboxItems.archivedAt));
        }
        const rows = await db
          .select()
          .from(inboxItems)
          .where(and(...conditions))
          .orderBy(desc(inboxItems.createdAt));
        return rows.map(rowToInboxItem);
      },

      async markReadForRecipient(
        inboxItemId: string,
        recipientId: string,
        scope?: SecurityScope,
      ) {
        const now = new Date();
        const conditions = [
          eq(inboxItems.id, inboxItemId),
          eq(inboxItems.recipientId, recipientId),
          ...scopedConditions(inboxItems, scope),
        ];
        const updated = await db
          .update(inboxItems)
          .set({ readAt: now })
          .where(and(...conditions))
          .returning();
        const row = updated[0];
        if (row) {
          return { status: "marked", item: rowToInboxItem(row) };
        }

        const existing = await db
          .select({ id: inboxItems.id })
          .from(inboxItems)
          .where(eq(inboxItems.id, inboxItemId))
          .limit(1);
        return existing[0] ? { status: "forbidden" } : { status: "not_found" };
      },

      async unreadCount(
        recipientId: string,
        scope?: SecurityScope,
      ): Promise<number> {
        const conditions = [
          eq(inboxItems.recipientId, recipientId),
          isNull(inboxItems.readAt),
          isNull(inboxItems.archivedAt),
          ...scopedConditions(inboxItems, scope),
        ];
        const rows = await db
          .select({ value: drizzleCount() })
          .from(inboxItems)
          .where(and(...conditions));
        return rows[0]?.value ?? 0;
      },

      async markAllRead(
        recipientId: string,
        scope?: SecurityScope,
      ): Promise<number> {
        const now = new Date();
        const conditions = [
          eq(inboxItems.recipientId, recipientId),
          isNull(inboxItems.readAt),
          isNull(inboxItems.archivedAt),
          ...scopedConditions(inboxItems, scope),
        ];
        const updated = await db
          .update(inboxItems)
          .set({ readAt: now })
          .where(and(...conditions))
          .returning({ id: inboxItems.id });
        return updated.length;
      },

      async archiveForRecipient(
        inboxItemId: string,
        recipientId: string,
        scope?: SecurityScope,
      ): Promise<InboxItemForRecipientResult> {
        const now = new Date();
        const conditions = [
          eq(inboxItems.id, inboxItemId),
          eq(inboxItems.recipientId, recipientId),
          ...scopedConditions(inboxItems, scope),
        ];
        const updated = await db
          .update(inboxItems)
          .set({ archivedAt: now })
          .where(and(...conditions))
          .returning();
        const row = updated[0];
        if (row) {
          return { status: "ok", item: rowToInboxItem(row) };
        }
        const existing = await db
          .select({ id: inboxItems.id })
          .from(inboxItems)
          .where(eq(inboxItems.id, inboxItemId))
          .limit(1);
        return existing[0] ? { status: "forbidden" } : { status: "not_found" };
      },

      async unarchiveForRecipient(
        inboxItemId: string,
        recipientId: string,
        scope?: SecurityScope,
      ): Promise<InboxItemForRecipientResult> {
        const conditions = [
          eq(inboxItems.id, inboxItemId),
          eq(inboxItems.recipientId, recipientId),
          ...scopedConditions(inboxItems, scope),
        ];
        const updated = await db
          .update(inboxItems)
          .set({ archivedAt: null })
          .where(and(...conditions))
          .returning();
        const row = updated[0];
        if (row) {
          return { status: "ok", item: rowToInboxItem(row) };
        }
        const existing = await db
          .select({ id: inboxItems.id })
          .from(inboxItems)
          .where(eq(inboxItems.id, inboxItemId))
          .limit(1);
        return existing[0] ? { status: "forbidden" } : { status: "not_found" };
      },

      async deleteForRecipient(
        inboxItemId: string,
        recipientId: string,
        scope?: SecurityScope,
      ): Promise<InboxDeleteForRecipientResult> {
        const conditions = [
          eq(inboxItems.id, inboxItemId),
          eq(inboxItems.recipientId, recipientId),
          ...scopedConditions(inboxItems, scope),
        ];
        const deleted = await db
          .delete(inboxItems)
          .where(and(...conditions))
          .returning({ id: inboxItems.id });
        if (deleted[0]) {
          return { status: "deleted" };
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
      async create(input): Promise<DeliveryRecord> {
        const now = new Date();
        const record: DeliveryRecord = {
          id: createId("dlv"),
          notificationRecordId: input.notificationRecordId,
          recipientId: input.recipientId,
          tenantId: input.tenantId,
          workspaceId: input.workspaceId,
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
          tenantId: record.tenantId ?? null,
          workspaceId: record.workspaceId ?? null,
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

      async findById(id: string): Promise<DeliveryRecord | null> {
        const rows = await db
          .select()
          .from(deliveries)
          .where(eq(deliveries.id, id))
          .limit(1);
        const row = rows[0];
        return row ? rowToDelivery(row) : null;
      },
      async update(id, patch): Promise<DeliveryRecord | null> {
        const set: Record<string, unknown> = { ...patch, updatedAt: new Date() };
        const updated = await db
          .update(deliveries)
          .set(set)
          .where(eq(deliveries.id, id))
          .returning();
        const row = updated[0];
        if (!row) return null;
        return rowToDelivery(row);
      },

      async list(
        recipientId?: string,
        scope?: SecurityScope,
      ): Promise<DeliveryRecord[]> {
        const query = db.select().from(deliveries);
        const conditions = [
          ...(recipientId ? [eq(deliveries.recipientId, recipientId)] : []),
          ...scopedConditions(deliveries, scope),
        ];
        const rows = recipientId
          ? await query.where(and(...conditions)).orderBy(desc(deliveries.createdAt))
          : conditions.length > 0
            ? await query.where(and(...conditions)).orderBy(desc(deliveries.createdAt))
          : await query.orderBy(desc(deliveries.createdAt));
        return rows.map(rowToDelivery);
      },
    },

    preferences: {
      async get(
        recipientId,
        notificationId,
        scope,
      ): Promise<RecipientPreference | null> {
        const rows = await db
          .select()
          .from(preferences)
          .where(
            and(
              eq(preferences.recipientId, recipientId),
              eq(preferences.notificationId, notificationId),
              ...preferenceScopeConditions(scope),
            ),
          )
          .limit(1);
        const row = rows[0];
        if (!row) return null;
        return {
          recipientId: row.recipientId,
          tenantId: emptyToUndefined(row.tenantId),
          workspaceId: emptyToUndefined(row.workspaceId),
          notificationId: row.notificationId,
          channels: row.channels as ChannelPreferenceMap,
          updatedAt: row.updatedAt,
        };
      },

      async list(recipientId, scope): Promise<RecipientPreference[]> {
        const conditions = [
          eq(preferences.recipientId, recipientId),
          ...(scope ? preferenceScopeConditions(scope) : []),
        ];
        const rows = await db
          .select()
          .from(preferences)
          .where(and(...conditions));
        return rows.map((r) => ({
          recipientId: r.recipientId,
          tenantId: emptyToUndefined(r.tenantId),
          workspaceId: emptyToUndefined(r.workspaceId),
          notificationId: r.notificationId,
          channels: r.channels as ChannelPreferenceMap,
          updatedAt: r.updatedAt,
        }));
      },

      async upsert(input): Promise<RecipientPreference> {
        const now = new Date();
        const existing = await db
          .select()
          .from(preferences)
          .where(
            and(
              eq(preferences.recipientId, input.recipientId),
              eq(preferences.notificationId, input.notificationId),
              ...preferenceScopeConditions(input),
            ),
          )
          .limit(1);

        if (existing[0]) {
          const merged: ChannelPreferenceMap = {
            ...(existing[0].channels as ChannelPreferenceMap),
            ...input.channels,
          };
          await db
            .update(preferences)
            .set({
              channels: merged as Record<string, boolean>,
              updatedAt: now,
            })
            .where(
              and(
                eq(preferences.recipientId, input.recipientId),
                eq(preferences.notificationId, input.notificationId),
                ...preferenceScopeConditions(input),
              ),
            );
          return {
            recipientId: input.recipientId,
            tenantId: input.tenantId,
            workspaceId: input.workspaceId,
            notificationId: input.notificationId,
            channels: merged,
            updatedAt: now,
          };
        }

        await db.insert(preferences).values({
          recipientId: input.recipientId,
          tenantId: scopeValue(input.tenantId),
          workspaceId: scopeValue(input.workspaceId),
          notificationId: input.notificationId,
          channels: input.channels as Record<string, boolean>,
          updatedAt: now,
        });
        return {
          recipientId: input.recipientId,
          tenantId: input.tenantId,
          workspaceId: input.workspaceId,
          notificationId: input.notificationId,
          channels: { ...input.channels },
          updatedAt: now,
        };
      },
    },

    digests: {
      async append(input): Promise<DigestBufferEntry> {
        // Serialize read-modify-write against the same bucket. See createMutex
        // comment — drizzle's async transaction wrapper on a sync driver does
        // NOT serialize the JS-level awaits between read and write, so two
        // concurrent appends to the same key can both see the pre-insert
        // state and clobber each other.
        return atomic(async () => {
          const now = new Date();
          const existing = await db
            .select()
            .from(digestBuffers)
            .where(eq(digestBuffers.key, input.key))
            .limit(1);
          const current = existing[0];
          if (current) {
            const merged = [
              ...(current.payloads as Record<string, unknown>[]),
              input.payload,
            ];
            await db
              .update(digestBuffers)
              .set({ payloads: merged, updatedAt: now })
              .where(eq(digestBuffers.key, input.key));
            return {
              key: current.key,
              recipientId: current.recipientId,
              tenantId: current.tenantId ?? undefined,
              workspaceId: current.workspaceId ?? undefined,
              notificationId: current.notificationId,
              payloads: merged,
              flushAt: current.flushAt,
              createdAt: current.createdAt,
              updatedAt: now,
            };
          }
          const flushAt = new Date(now.getTime() + input.windowMs);
          await db.insert(digestBuffers).values({
            key: input.key,
            recipientId: input.recipientId,
            tenantId: input.tenantId ?? null,
            workspaceId: input.workspaceId ?? null,
            notificationId: input.notificationId,
            payloads: [input.payload],
            flushAt,
            createdAt: now,
            updatedAt: now,
          });
          return {
            key: input.key,
            recipientId: input.recipientId,
            tenantId: input.tenantId,
            workspaceId: input.workspaceId,
            notificationId: input.notificationId,
            payloads: [input.payload],
            flushAt,
            createdAt: now,
            updatedAt: now,
          };
        });
      },

      async take(key: string): Promise<DigestBufferEntry | null> {
        const rows = await db
          .delete(digestBuffers)
          .where(eq(digestBuffers.key, key))
          .returning();
        const row = rows[0];
        if (!row) return null;
        return {
          key: row.key,
          recipientId: row.recipientId,
          tenantId: row.tenantId ?? undefined,
          workspaceId: row.workspaceId ?? undefined,
          notificationId: row.notificationId,
          payloads: row.payloads as Record<string, unknown>[],
          flushAt: row.flushAt,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        };
      },

      async restore(entry: DigestBufferEntry): Promise<DigestBufferEntry> {
        return atomic(async () => {
          const now = new Date();
          const existing = await db
            .select()
            .from(digestBuffers)
            .where(eq(digestBuffers.key, entry.key))
            .limit(1);
          const current = existing[0];
          if (current) {
            const payloads = [
              ...entry.payloads,
              ...(current.payloads as Record<string, unknown>[]),
            ];
            await db
              .update(digestBuffers)
              .set({
                recipientId: entry.recipientId,
                tenantId: entry.tenantId ?? null,
                workspaceId: entry.workspaceId ?? null,
                notificationId: entry.notificationId,
                payloads,
                flushAt: entry.flushAt,
                createdAt: entry.createdAt,
                updatedAt: now,
              })
              .where(eq(digestBuffers.key, entry.key));
            return {
              key: entry.key,
              recipientId: entry.recipientId,
              tenantId: entry.tenantId,
              workspaceId: entry.workspaceId,
              notificationId: entry.notificationId,
              payloads,
              flushAt: entry.flushAt,
              createdAt: entry.createdAt,
              updatedAt: now,
            };
          }
          await db.insert(digestBuffers).values({
            key: entry.key,
            recipientId: entry.recipientId,
            tenantId: entry.tenantId ?? null,
            workspaceId: entry.workspaceId ?? null,
            notificationId: entry.notificationId,
            payloads: entry.payloads,
            flushAt: entry.flushAt,
            createdAt: entry.createdAt,
            updatedAt: entry.updatedAt,
          });
          return entry;
        });
      },

      async list(): Promise<DigestBufferEntry[]> {
        const rows = await db.select().from(digestBuffers);
        return rows.map((row) => ({
          key: row.key,
          recipientId: row.recipientId,
          tenantId: row.tenantId ?? undefined,
          workspaceId: row.workspaceId ?? undefined,
          notificationId: row.notificationId,
          payloads: row.payloads as Record<string, unknown>[],
          flushAt: row.flushAt,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        }));
      },
    },

    rateLimits: {
      async reserve(input): Promise<{ allowed: boolean }> {
        // Atomic via the adapter mutex: prune → count → conditionally insert.
        // Under concurrent callers at most `max` reservations succeed per
        // window. See createMutex() for why `db.transaction(async …)` alone
        // is not enough on sync sqlite drivers.
        return atomic(async () => {
          const cutoff = new Date(Date.now() - input.windowMs);
          await db
            .delete(rateLimitEvents)
            .where(
              and(
                eq(rateLimitEvents.key, input.key),
                lt(rateLimitEvents.occurredAt, cutoff),
              ),
            );
          const rows = await db
            .select({ id: rateLimitEvents.id })
            .from(rateLimitEvents)
            .where(
              and(
                eq(rateLimitEvents.key, input.key),
                gte(rateLimitEvents.occurredAt, cutoff),
              ),
            );
          if (rows.length >= input.max) {
            return { allowed: false };
          }
          await db.insert(rateLimitEvents).values({
            id: createId("rlm"),
            key: input.key,
            recipientId: input.recipientId,
            tenantId: input.tenantId ?? null,
            workspaceId: input.workspaceId ?? null,
            notificationId: input.notificationId,
            occurredAt: new Date(),
          });
          return { allowed: true };
        });
      },

      async count(input): Promise<number> {
        const cutoff = new Date(Date.now() - input.windowMs);
        await db
          .delete(rateLimitEvents)
          .where(
            and(
              eq(rateLimitEvents.key, input.key),
              lt(rateLimitEvents.occurredAt, cutoff),
            ),
          );
        const rows = await db
          .select()
          .from(rateLimitEvents)
          .where(
            and(
              eq(rateLimitEvents.key, input.key),
              gte(rateLimitEvents.occurredAt, cutoff),
            ),
          );
        return rows.length;
      },
    },

    scheduledSends: {
      async create(input): Promise<ScheduledSend> {
        const status = input.status ?? "pending";
        const record: ScheduledSend = {
          id: createId("sch"),
          recipientId: input.recipientId,
          tenantId: input.tenantId,
          workspaceId: input.workspaceId,
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
          tenantId: record.tenantId ?? null,
          workspaceId: record.workspaceId ?? null,
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
      async claim(id: string): Promise<ScheduledSend | null> {
        // Atomic compare-and-set: only flip to "claimed" if still "pending".
        // Returning rows let us detect whether we won the race.
        const now = new Date();
        const rows = await db
          .update(scheduledSends)
          .set({ status: "claimed", claimedAt: now })
          .where(
            and(
              eq(scheduledSends.id, id),
              eq(scheduledSends.status, "pending"),
            ),
          )
          .returning();
        const row = rows[0];
        if (!row) return null;
        return {
          id: row.id,
          recipientId: row.recipientId,
          tenantId: row.tenantId ?? undefined,
          workspaceId: row.workspaceId ?? undefined,
          notificationId: row.notificationId,
          payload: row.payload as Record<string, unknown>,
          scheduledFor: row.scheduledFor,
          reason: row.reason,
          status: row.status,
          claimedAt: row.claimedAt ?? null,
          createdAt: row.createdAt,
        };
      },
      async complete(id: string): Promise<void> {
        await db.delete(scheduledSends).where(eq(scheduledSends.id, id));
      },
      async release(id: string): Promise<void> {
        await db
          .update(scheduledSends)
          .set({ status: "pending", claimedAt: null })
          .where(eq(scheduledSends.id, id));
      },
      async listDue(now: Date): Promise<ScheduledSend[]> {
        const rows = await db
          .select()
          .from(scheduledSends)
          .where(
            and(
              eq(scheduledSends.status, "pending"),
              lte(scheduledSends.scheduledFor, now),
            ),
          );
        return rows.map((row) => ({
          id: row.id,
          recipientId: row.recipientId,
          tenantId: row.tenantId ?? undefined,
          workspaceId: row.workspaceId ?? undefined,
          notificationId: row.notificationId,
          payload: row.payload as Record<string, unknown>,
          scheduledFor: row.scheduledFor,
          reason: row.reason,
          status: row.status,
          claimedAt: row.claimedAt ?? null,
          createdAt: row.createdAt,
        }));
      },
      async list(): Promise<ScheduledSend[]> {
        const rows = await db.select().from(scheduledSends);
        return rows.map((row) => ({
          id: row.id,
          recipientId: row.recipientId,
          tenantId: row.tenantId ?? undefined,
          workspaceId: row.workspaceId ?? undefined,
          notificationId: row.notificationId,
          payload: row.payload as Record<string, unknown>,
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

function rowToInboxItem(row: typeof inboxItems.$inferSelect): InboxItem {
  return {
    id: row.id,
    notificationRecordId: row.notificationRecordId,
    recipientId: row.recipientId,
    tenantId: row.tenantId ?? undefined,
    workspaceId: row.workspaceId ?? undefined,
    notificationId: row.notificationId,
    title: row.title,
    body: row.body ?? undefined,
    actionUrl: row.actionUrl ?? undefined,
    readAt: row.readAt ?? null,
    archivedAt: row.archivedAt ?? null,
    createdAt: row.createdAt,
  };
}

function rowToDelivery(row: typeof deliveries.$inferSelect): DeliveryRecord {
  return {
    id: row.id,
    notificationRecordId: row.notificationRecordId,
    recipientId: row.recipientId,
    tenantId: row.tenantId ?? undefined,
    workspaceId: row.workspaceId ?? undefined,
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

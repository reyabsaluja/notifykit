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
  SkipReason,
  TimelineEvent,
  UpsertRecipientInput,
} from "notifykit";
import { SKIP_REASONS, createId } from "notifykit";
import { and, asc, count as drizzleCount, desc, eq, gte, isNull, isNotNull, lt, lte, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

import {
  dedupeRecords,
  deliveries,
  digestBuffers,
  inboxItems,
  notifications,
  preferences,
  rateLimitEvents,
  recipients,
  scheduledSends,
  timelineEvents,
} from "./schema/postgres.js";
import { rowToTimelineEvent } from "./timeline-utils.js";

function scopeValue(value: string | undefined): string {
  return value ?? "";
}

function emptyToUndefined(value: string | null | undefined): string | undefined {
  return value === "" || value == null ? undefined : value;
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

type PgDb = PgDatabase<PgQueryResultHKT, any, any>;

export type DrizzlePostgresAdapter = DatabaseAdapter & {
  _schema: {
    recipients: typeof recipients;
    notifications: typeof notifications;
    inboxItems: typeof inboxItems;
    deliveries: typeof deliveries;
    preferences: typeof preferences;
    digestBuffers: typeof digestBuffers;
    rateLimitEvents: typeof rateLimitEvents;
    scheduledSends: typeof scheduledSends;
    dedupeRecords: typeof dedupeRecords;
    timelineEvents: typeof timelineEvents;
  };
};

export function drizzlePostgresAdapter(db: PgDb): DrizzlePostgresAdapter {
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
      dedupeRecords,
      timelineEvents,
    },

    recipients: {
      async upsert(input: UpsertRecipientInput): Promise<Recipient> {
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
            tenantId: input.tenantId ?? null,
            workspaceId: input.workspaceId ?? null,
            email: input.email ?? null,
            phone: input.phone ?? null,
            name: input.name ?? null,
            quietHours: input.quietHours ?? null,
            createdAt: now,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: recipients.id,
            set: {
              tenantId:
                input.tenantId !== undefined
                  ? input.tenantId ?? null
                  : sql`${recipients.tenantId}`,
              workspaceId:
                input.workspaceId !== undefined
                  ? input.workspaceId ?? null
                  : sql`${recipients.workspaceId}`,
              email:
                input.email !== undefined
                  ? input.email ?? null
                  : sql`${recipients.email}`,
              phone:
                input.phone !== undefined
                  ? input.phone ?? null
                  : sql`${recipients.phone}`,
              name:
                input.name !== undefined
                  ? input.name ?? null
                  : sql`${recipients.name}`,
              quietHours:
                input.quietHours !== undefined
                  ? (input.quietHours ?? null)
                  : sql`${recipients.quietHours}`,
              updatedAt: now,
            },
          })
          .returning();
        const row = rows[0]!;
        return {
          id: row.id,
          tenantId: row.tenantId ?? undefined,
          workspaceId: row.workspaceId ?? undefined,
          email: row.email ?? undefined,
          phone: row.phone ?? undefined,
          name: row.name ?? undefined,
          quietHours:
            (row.quietHours as QuietHours | null | undefined) ?? undefined,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        };
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
          phone: row.phone ?? undefined,
          name: row.name ?? undefined,
          quietHours:
            (row.quietHours as QuietHours | null | undefined) ?? undefined,
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
          idempotencyKey: input.idempotencyKey,
          createdAt: new Date(),
        };
        await db.insert(notifications).values({
          ...record,
          tenantId: record.tenantId ?? null,
          workspaceId: record.workspaceId ?? null,
          payloadSchema: record.payloadSchema ?? null,
          definitionVersion: record.definitionVersion ?? null,
          idempotencyKey: record.idempotencyKey ?? null,
        });
        return record;
      },
      async findByIdempotencyKey(key: string): Promise<NotificationRecord | null> {
        const rows = await db
          .select()
          .from(notifications)
          .where(eq(notifications.idempotencyKey, key))
          .limit(1);
        const row = rows[0];
        if (!row) return null;
        return {
          id: row.id,
          recipientId: row.recipientId,
          tenantId: row.tenantId ?? undefined,
          workspaceId: row.workspaceId ?? undefined,
          notificationId: row.notificationId,
          payload: row.payload,
          payloadSchema: row.payloadSchema ?? undefined,
          definitionVersion: row.definitionVersion ?? undefined,
          idempotencyKey: row.idempotencyKey ?? undefined,
          createdAt: row.createdAt,
        };
      },
      async clearIdempotencyKey(id: string): Promise<void> {
        await db
          .update(notifications)
          .set({ idempotencyKey: null })
          .where(eq(notifications.id, id));
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
        limit?: number,
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
        let query = db
          .select()
          .from(inboxItems)
          .where(and(...conditions))
          .orderBy(desc(inboxItems.createdAt));
        const cap = Math.min(limit ?? 200, 1000);
        const rows = await query.limit(cap);
        return rows.map(rowToInboxItem);
      },

      async listByNotificationRecordId(notificationRecordId: string): Promise<InboxItem[]> {
        const rows = await db
          .select()
          .from(inboxItems)
          .where(eq(inboxItems.notificationRecordId, notificationRecordId));
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
          skipReason: input.skipReason,
          skipDetails: input.skipDetails,
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
          skipReason: record.skipReason ?? null,
          skipDetails: record.skipDetails ?? null,
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
      async listByNotificationRecordId(notificationRecordId: string): Promise<DeliveryRecord[]> {
        const rows = await db
          .select()
          .from(deliveries)
          .where(eq(deliveries.notificationRecordId, notificationRecordId));
        return rows.map(rowToDelivery);
      },

      async update(id, patch): Promise<DeliveryRecord | null> {
        const ALLOWED = ["status", "providerMessageId", "error", "attempts", "sentAt", "failedAt", "skipReason", "skipDetails"] as const;
        const set: Record<string, unknown> = { updatedAt: new Date() };
        for (const key of ALLOWED) {
          if (key in patch) set[key] = (patch as Record<string, unknown>)[key];
        }
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
        limit?: number,
      ): Promise<DeliveryRecord[]> {
        const cap = Math.min(limit ?? 200, 1000);
        const conditions = [
          ...(recipientId ? [eq(deliveries.recipientId, recipientId)] : []),
          ...scopedConditions(deliveries, scope),
        ];
        const rows = conditions.length > 0
          ? await db.select().from(deliveries).where(and(...conditions)).orderBy(desc(deliveries.createdAt)).limit(cap)
          : await db.select().from(deliveries).orderBy(desc(deliveries.createdAt)).limit(cap);
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
          ...preferenceScopeConditions(scope),
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
        // Native upsert that merges channel flags via jsonb concatenation.
        // `EXCLUDED.channels` is the incoming object; `||` merges keys with
        // the incoming side taking precedence. This matches the sqlite
        // adapter's semantics (shallow merge) but is a single atomic row op.
        const now = new Date();
        const rows = await db
          .insert(preferences)
          .values({
            recipientId: input.recipientId,
            tenantId: scopeValue(input.tenantId),
            workspaceId: scopeValue(input.workspaceId),
            notificationId: input.notificationId,
            channels: input.channels as Record<string, boolean>,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: [
              preferences.recipientId,
              preferences.notificationId,
              preferences.tenantId,
              preferences.workspaceId,
            ],
            set: {
              channels: sql`${preferences.channels} || EXCLUDED.channels`,
              updatedAt: now,
            },
          })
          .returning();
        const row = rows[0]!;
        return {
          recipientId: row.recipientId,
          tenantId: emptyToUndefined(row.tenantId),
          workspaceId: emptyToUndefined(row.workspaceId),
          notificationId: row.notificationId,
          channels: row.channels as ChannelPreferenceMap,
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
      async append(input): Promise<DigestBufferEntry> {
        const now = new Date();
        const flushAt = new Date(now.getTime() + input.windowMs);
        const rows = await db
          .insert(digestBuffers)
          .values({
            key: input.key,
            recipientId: input.recipientId,
            tenantId: input.tenantId ?? null,
            workspaceId: input.workspaceId ?? null,
            notificationId: input.notificationId,
            payloads: [input.payload],
            flushAt,
            createdAt: now,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: digestBuffers.key,
            set: {
              payloads: sql`${digestBuffers.payloads} || EXCLUDED.payloads`,
              updatedAt: now,
            },
          })
          .returning();
        const row = rows[0]!;
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
            tenantId: entry.tenantId ?? null,
            workspaceId: entry.workspaceId ?? null,
            notificationId: entry.notificationId,
            payloads: entry.payloads,
            flushAt: entry.flushAt,
            createdAt: entry.createdAt,
            updatedAt: entry.updatedAt,
          })
          .onConflictDoUpdate({
            target: digestBuffers.key,
            set: {
              payloads: sql`EXCLUDED.payloads || ${digestBuffers.payloads}`,
              updatedAt: now,
            },
          })
          .returning();
        const row = rows[0]!;
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

      async list(): Promise<DigestBufferEntry[]> {
        const rows = await db.select().from(digestBuffers).limit(10000);
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
        // Multi-process safe: a transaction-scoped advisory lock keyed by
        // hashtext(key) serializes read-modify-write across every connection
        // reserving the same key. The lock is released on COMMIT. No rows
        // need to exist yet — the lock namespace is independent.
        return await db.transaction(async (tx) => {
          await tx.execute(
            sql`SELECT pg_advisory_xact_lock(hashtext(${input.key}))`,
          );
          const cutoff = new Date(Date.now() - input.windowMs);
          await tx
            .delete(rateLimitEvents)
            .where(
              and(
                eq(rateLimitEvents.key, input.key),
                lt(rateLimitEvents.occurredAt, cutoff),
              ),
            );
          const countResult = await tx
            .select({ value: drizzleCount() })
            .from(rateLimitEvents)
            .where(
              and(
                eq(rateLimitEvents.key, input.key),
                gte(rateLimitEvents.occurredAt, cutoff),
              ),
            );
          if ((countResult[0]?.value ?? 0) >= input.max) {
            return { allowed: false };
          }
          await tx.insert(rateLimitEvents).values({
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
        return await db.transaction(async (tx) => {
          await tx.execute(
            sql`SELECT pg_advisory_xact_lock(hashtext(${input.key}))`,
          );
          const cutoff = new Date(Date.now() - input.windowMs);
          await tx
            .delete(rateLimitEvents)
            .where(
              and(
                eq(rateLimitEvents.key, input.key),
                lt(rateLimitEvents.occurredAt, cutoff),
              ),
            );
          const rows = await tx
            .select({ value: drizzleCount() })
            .from(rateLimitEvents)
            .where(
              and(
                eq(rateLimitEvents.key, input.key),
                gte(rateLimitEvents.occurredAt, cutoff),
              ),
            );
          return rows[0]?.value ?? 0;
        });
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
          notificationRecordId: input.notificationRecordId,
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
          notificationRecordId: record.notificationRecordId ?? null,
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
        // Atomic compare-and-set. UPDATE ... WHERE status = 'pending'
        // + RETURNING is race-free across workers; at most one wins.
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
          notificationRecordId: row.notificationRecordId ?? undefined,
          payload: row.payload as Record<string, unknown>,
          scheduledFor: row.scheduledFor,
          reason: row.reason,
          status: row.status,
          claimedAt: row.claimedAt ?? null,
          createdAt: row.createdAt,
        };
      },

      async complete(id: string): Promise<void> {
        await db
          .delete(scheduledSends)
          .where(and(eq(scheduledSends.id, id), eq(scheduledSends.status, "claimed")));
      },

      async release(id: string): Promise<void> {
        await db
          .update(scheduledSends)
          .set({ status: "pending", claimedAt: null })
          .where(and(eq(scheduledSends.id, id), eq(scheduledSends.status, "claimed")));
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
          )
          .orderBy(asc(scheduledSends.scheduledFor))
          .limit(1000);
        return rows.map((row) => ({
          id: row.id,
          recipientId: row.recipientId,
          tenantId: row.tenantId ?? undefined,
          workspaceId: row.workspaceId ?? undefined,
          notificationId: row.notificationId,
          notificationRecordId: row.notificationRecordId ?? undefined,
          payload: row.payload as Record<string, unknown>,
          scheduledFor: row.scheduledFor,
          reason: row.reason,
          status: row.status,
          claimedAt: row.claimedAt ?? null,
          createdAt: row.createdAt,
        }));
      },

      async list(): Promise<ScheduledSend[]> {
        const rows = await db.select().from(scheduledSends).limit(10000);
        return rows.map((row) => ({
          id: row.id,
          recipientId: row.recipientId,
          tenantId: row.tenantId ?? undefined,
          workspaceId: row.workspaceId ?? undefined,
          notificationId: row.notificationId,
          notificationRecordId: row.notificationRecordId ?? undefined,
          payload: row.payload as Record<string, unknown>,
          scheduledFor: row.scheduledFor,
          reason: row.reason,
          status: row.status,
          claimedAt: row.claimedAt ?? null,
          createdAt: row.createdAt,
        }));
      },
    },

    dedupe: {
      async check(input): Promise<{ duplicate: boolean }> {
        return db.transaction(async (tx) => {
          await tx.execute(
            sql`SELECT pg_advisory_xact_lock(hashtext(${input.key}))`,
          );
          const now = new Date();
          const existing = await tx
            .select()
            .from(dedupeRecords)
            .where(eq(dedupeRecords.key, input.key))
            .limit(1);
          const row = existing[0];
          if (row && row.expiresAt.getTime() > now.getTime()) {
            return { duplicate: true };
          }
          if (row) {
            await tx.delete(dedupeRecords).where(eq(dedupeRecords.key, input.key));
          }
          await tx.insert(dedupeRecords).values({
            key: input.key,
            recipientId: input.recipientId,
            tenantId: input.tenantId ?? null,
            workspaceId: input.workspaceId ?? null,
            notificationId: input.notificationId,
            expiresAt: new Date(now.getTime() + input.windowMs),
            createdAt: now,
          });
          return { duplicate: false };
        });
      },
      async exists(key: string): Promise<boolean> {
        const now = new Date();
        const rows = await db
          .select()
          .from(dedupeRecords)
          .where(and(eq(dedupeRecords.key, key), gte(dedupeRecords.expiresAt, now)))
          .limit(1);
        return rows.length > 0;
      },
      async prune(): Promise<void> {
        const now = new Date();
        await db.delete(dedupeRecords).where(lt(dedupeRecords.expiresAt, now));
      },
    },
    timeline: {
      async append(events): Promise<TimelineEvent[]> {
        const now = new Date();
        const records: TimelineEvent[] = events.map((e, i) => ({
          id: createId("tl"),
          seq: i,
          notificationRecordId: e.notificationRecordId,
          deliveryId: e.deliveryId,
          recipientId: e.recipientId,
          tenantId: e.tenantId,
          workspaceId: e.workspaceId,
          notificationId: e.notificationId,
          channel: e.channel as TimelineEvent["channel"],
          provider: e.provider,
          event: e.event,
          message: e.message,
          metadata: e.metadata,
          timestamp: now,
        }));
        if (records.length > 0) {
          await db.transaction(async (tx) => {
            await tx.execute(sql`SELECT pg_advisory_xact_lock(4832719)`);
            const maxRow = await tx
              .select({ maxSeq: timelineEvents.seq })
              .from(timelineEvents)
              .orderBy(desc(timelineEvents.seq))
              .limit(1);
            const baseSeq = maxRow.length > 0 ? maxRow[0]!.maxSeq + 1 : 0;
            for (let i = 0; i < records.length; i++) records[i]!.seq = baseSeq + i;
            await tx.insert(timelineEvents).values(
              records.map((r) => ({
                id: r.id,
                seq: r.seq,
                notificationRecordId: r.notificationRecordId,
                deliveryId: r.deliveryId ?? null,
                recipientId: r.recipientId,
                tenantId: r.tenantId ?? null,
                workspaceId: r.workspaceId ?? null,
                notificationId: r.notificationId,
                channel: r.channel ?? null,
                provider: r.provider ?? null,
                event: r.event,
                message: r.message,
                metadata: r.metadata ?? null,
                timestamp: r.timestamp,
              })),
            );
          });
        }
        return records;
      },
      async listByNotificationRecordId(notificationRecordId: string): Promise<TimelineEvent[]> {
        const rows = await db
          .select()
          .from(timelineEvents)
          .where(eq(timelineEvents.notificationRecordId, notificationRecordId))
          .orderBy(asc(timelineEvents.timestamp), asc(timelineEvents.seq));
        return rows.map(rowToTimelineEvent);
      },
      async listByDeliveryId(deliveryId: string, notificationRecordId?: string): Promise<TimelineEvent[]> {
        const conditions = [eq(timelineEvents.deliveryId, deliveryId)];
        if (notificationRecordId) conditions.push(eq(timelineEvents.notificationRecordId, notificationRecordId));
        const rows = await db
          .select()
          .from(timelineEvents)
          .where(and(...conditions))
          .orderBy(asc(timelineEvents.timestamp), asc(timelineEvents.seq));
        return rows.map(rowToTimelineEvent);
      },
      async prune(olderThan: Date): Promise<number> {
        const result: { rowCount?: number } = await db.execute(
          sql`DELETE FROM notifykit_timeline_events WHERE timestamp < ${olderThan}`,
        ) as any;
        return Number(result.rowCount ?? 0);
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

const VALID_SKIP_REASONS: ReadonlySet<string> = new Set(SKIP_REASONS);

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
    skipReason: row.skipReason && VALID_SKIP_REASONS.has(row.skipReason) ? row.skipReason as SkipReason : undefined,
    skipDetails: row.skipDetails ?? undefined,
    attempts: row.attempts,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    sentAt: row.sentAt ?? null,
    failedAt: row.failedAt ?? null,
  };
}

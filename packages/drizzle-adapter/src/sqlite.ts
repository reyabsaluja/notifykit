import type {
  ChannelPreferenceMap,
  DatabaseAdapter,
  DeliveryRecord,
  DigestBufferEntry,
  InboxItem,
  NotificationRecord,
  RateLimitEvent,
  Recipient,
  RecipientPreference,
  UpsertRecipientInput,
} from "notifykit";
import { and, desc, eq, gte, lt } from "drizzle-orm";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";

import {
  deliveries,
  digestBuffers,
  inboxItems,
  notifications,
  preferences,
  rateLimitEvents,
  recipients,
} from "./schema/sqlite.js";

function createId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 10);
  const time = Date.now().toString(36);
  return `${prefix}_${time}${rand}`;
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
  };
};

export function drizzleSqliteAdapter(db: SqliteDb): DrizzleSqliteAdapter {
  return {
    _schema: {
      recipients,
      notifications,
      inboxItems,
      deliveries,
      preferences,
      digestBuffers,
      rateLimitEvents,
    },

    recipients: {
      async upsert(input: UpsertRecipientInput): Promise<Recipient> {
        const now = new Date();
        const existing = await db
          .select()
          .from(recipients)
          .where(eq(recipients.id, input.id))
          .limit(1);

        const current = existing[0];
        if (current) {
          const next = {
            email: input.email !== undefined ? input.email : current.email,
            name: input.name !== undefined ? input.name : current.name,
            updatedAt: now,
          };
          await db
            .update(recipients)
            .set(next)
            .where(eq(recipients.id, input.id));
          return {
            id: current.id,
            email: next.email ?? undefined,
            name: next.name ?? undefined,
            createdAt: current.createdAt,
            updatedAt: now,
          };
        }

        await db.insert(recipients).values({
          id: input.id,
          email: input.email,
          name: input.name,
          createdAt: now,
          updatedAt: now,
        });
        return {
          id: input.id,
          email: input.email,
          name: input.name,
          createdAt: now,
          updatedAt: now,
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
          email: row.email ?? undefined,
          name: row.name ?? undefined,
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
          notificationId: input.notificationId,
          payload: input.payload,
          createdAt: new Date(),
        };
        await db.insert(notifications).values(record);
        return record;
      },
    },

    inbox: {
      async create(input): Promise<InboxItem> {
        const item: InboxItem = {
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

      async listByRecipient(recipientId: string): Promise<InboxItem[]> {
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

      async markRead(inboxItemId: string): Promise<InboxItem | null> {
        const now = new Date();
        const updated = await db
          .update(inboxItems)
          .set({ readAt: now })
          .where(eq(inboxItems.id, inboxItemId))
          .returning();
        const row = updated[0];
        if (!row) return null;
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
    },

    deliveries: {
      async create(input): Promise<DeliveryRecord> {
        const now = new Date();
        const record: DeliveryRecord = {
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

      async list(recipientId?: string): Promise<DeliveryRecord[]> {
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
      async get(recipientId, notificationId): Promise<RecipientPreference | null> {
        const rows = await db
          .select()
          .from(preferences)
          .where(
            and(
              eq(preferences.recipientId, recipientId),
              eq(preferences.notificationId, notificationId),
            ),
          )
          .limit(1);
        const row = rows[0];
        if (!row) return null;
        return {
          recipientId: row.recipientId,
          notificationId: row.notificationId,
          channels: row.channels as ChannelPreferenceMap,
          updatedAt: row.updatedAt,
        };
      },

      async list(recipientId): Promise<RecipientPreference[]> {
        const rows = await db
          .select()
          .from(preferences)
          .where(eq(preferences.recipientId, recipientId));
        return rows.map((r) => ({
          recipientId: r.recipientId,
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
              ),
            );
          return {
            recipientId: input.recipientId,
            notificationId: input.notificationId,
            channels: merged,
            updatedAt: now,
          };
        }

        await db.insert(preferences).values({
          recipientId: input.recipientId,
          notificationId: input.notificationId,
          channels: input.channels as Record<string, boolean>,
          updatedAt: now,
        });
        return {
          recipientId: input.recipientId,
          notificationId: input.notificationId,
          channels: { ...input.channels },
          updatedAt: now,
        };
      },
    },

    digests: {
      async append(input): Promise<DigestBufferEntry> {
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
            .set({
              payloads: merged,
              updatedAt: now,
            })
            .where(eq(digestBuffers.key, input.key));
          return {
            key: current.key,
            recipientId: current.recipientId,
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
          notificationId: input.notificationId,
          payloads: [input.payload],
          flushAt,
          createdAt: now,
          updatedAt: now,
        });
        return {
          key: input.key,
          recipientId: input.recipientId,
          notificationId: input.notificationId,
          payloads: [input.payload],
          flushAt,
          createdAt: now,
          updatedAt: now,
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
          notificationId: row.notificationId,
          payloads: row.payloads as Record<string, unknown>[],
          flushAt: row.flushAt,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        };
      },

      async list(): Promise<DigestBufferEntry[]> {
        const rows = await db.select().from(digestBuffers);
        return rows.map((row) => ({
          key: row.key,
          recipientId: row.recipientId,
          notificationId: row.notificationId,
          payloads: row.payloads as Record<string, unknown>[],
          flushAt: row.flushAt,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        }));
      },
    },

    rateLimits: {
      async record(input): Promise<RateLimitEvent> {
        const event: RateLimitEvent = {
          key: input.key,
          recipientId: input.recipientId,
          notificationId: input.notificationId,
          occurredAt: new Date(),
        };
        await db.insert(rateLimitEvents).values({
          id: createId("rlm"),
          key: event.key,
          recipientId: event.recipientId,
          notificationId: event.notificationId,
          occurredAt: event.occurredAt,
        });
        return event;
      },

      async count(input): Promise<number> {
        const cutoff = new Date(Date.now() - input.windowMs);
        // Opportunistic pruning: drop anything older than the window across
        // all keys. Keeps the table from growing unbounded without a cron.
        await db
          .delete(rateLimitEvents)
          .where(lt(rateLimitEvents.occurredAt, cutoff));
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
  };
}

function rowToDelivery(row: typeof deliveries.$inferSelect): DeliveryRecord {
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

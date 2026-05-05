import { sql } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

// Foreign keys are intentionally omitted. Deliveries and notifications are
// historical/audit records that must survive recipient deletion. Application
// code handles cleanup via the adapter's delete methods.
export const recipients = pgTable("notifykit_recipients", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id"),
  workspaceId: text("workspace_id"),
  email: text("email"),
  phone: text("phone"),
  name: text("name"),
  quietHours: jsonb("quiet_hours").$type<{
    start: string;
    end: string;
    timezone?: string;
  } | null>(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .notNull()
    .default(sql`now()`),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .notNull()
    .default(sql`now()`),
});

export const notifications = pgTable(
  "notifykit_notifications",
  {
    id: text("id").primaryKey(),
    recipientId: text("recipient_id").notNull(),
    tenantId: text("tenant_id"),
    workspaceId: text("workspace_id"),
    notificationId: text("notification_id").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    /** @since 0.1 – migration: ALTER TABLE notifykit_notifications ADD COLUMN payload_schema JSONB; */
    payloadSchema: jsonb("payload_schema").$type<Record<string, string>>(),
    /** @since 0.1 – migration: ALTER TABLE notifykit_notifications ADD COLUMN definition_version INTEGER; */
    definitionVersion: integer("definition_version"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
  },
  (table) => ({
    recipientIdx: index("idx_notifykit_notifications_recipient").on(
      table.recipientId,
    ),
  }),
);

export const inboxItems = pgTable(
  "notifykit_inbox_items",
  {
    id: text("id").primaryKey(),
    notificationRecordId: text("notification_record_id").notNull(),
    recipientId: text("recipient_id").notNull(),
    tenantId: text("tenant_id"),
    workspaceId: text("workspace_id"),
    notificationId: text("notification_id").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    actionUrl: text("action_url"),
    readAt: timestamp("read_at", { withTimezone: true, mode: "date" }),
    /** @since 0.1 – migration: ALTER TABLE notifykit_inbox_items ADD COLUMN archived_at TIMESTAMP WITH TIME ZONE; */
    archivedAt: timestamp("archived_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
  },
  (table) => ({
    recipientIdx: index("idx_notifykit_inbox_recipient").on(table.recipientId),
    recipientActiveIdx: index("idx_notifykit_inbox_recipient_active").on(
      table.recipientId,
      table.archivedAt,
      table.createdAt,
    ),
    recipientUnreadIdx: index("idx_notifykit_inbox_recipient_unread").on(
      table.recipientId,
      table.readAt,
      table.archivedAt,
    ),
  }),
);

export const deliveries = pgTable(
  "notifykit_deliveries",
  {
    id: text("id").primaryKey(),
    notificationRecordId: text("notification_record_id").notNull(),
    recipientId: text("recipient_id").notNull(),
    tenantId: text("tenant_id"),
    workspaceId: text("workspace_id"),
    notificationId: text("notification_id").notNull(),
    channel: text("channel").notNull().$type<"email" | "webhook" | "sms">(),
    provider: text("provider").notNull(),
    status: text("status").notNull().$type<"pending" | "sent" | "failed">(),
    to: text("to"),
    subject: text("subject"),
    body: text("body"),
    providerMessageId: text("provider_message_id"),
    error: text("error"),
    attempts: integer("attempts").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true, mode: "date" }),
    failedAt: timestamp("failed_at", { withTimezone: true, mode: "date" }),
  },
  (table) => ({
    recipientIdx: index("idx_notifykit_deliveries_recipient").on(
      table.recipientId,
    ),
  }),
);

export const preferences = pgTable(
  "notifykit_preferences",
  {
    recipientId: text("recipient_id").notNull(),
    tenantId: text("tenant_id").notNull().default(""),
    workspaceId: text("workspace_id").notNull().default(""),
    notificationId: text("notification_id").notNull(),
    channels: jsonb("channels").$type<Record<string, boolean>>().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull(),
  },
  (table) => ({
    pk: primaryKey({
      columns: [
        table.recipientId,
        table.notificationId,
        table.tenantId,
        table.workspaceId,
      ],
    }),
  }),
);

export const scheduledSends = pgTable(
  "notifykit_scheduled_sends",
  {
    id: text("id").primaryKey(),
    recipientId: text("recipient_id").notNull(),
    tenantId: text("tenant_id"),
    workspaceId: text("workspace_id"),
    notificationId: text("notification_id").notNull(),
    notificationRecordId: text("notification_record_id"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    scheduledFor: timestamp("scheduled_for", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    reason: text("reason").notNull().$type<"quiet_hours">(),
    status: text("status")
      .notNull()
      .$type<"pending" | "claimed">()
      .default("pending"),
    claimedAt: timestamp("claimed_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
  },
  (table) => ({
    scheduledForIdx: index(
      "idx_notifykit_scheduled_sends_scheduled_for",
    ).on(table.scheduledFor),
    statusDueIdx: index("idx_notifykit_scheduled_sends_status_due").on(
      table.status,
      table.scheduledFor,
    ),
  }),
);

export const rateLimitEvents = pgTable(
  "notifykit_rate_limit_events",
  {
    id: text("id").primaryKey(),
    key: text("key").notNull(),
    recipientId: text("recipient_id").notNull(),
    tenantId: text("tenant_id"),
    workspaceId: text("workspace_id"),
    notificationId: text("notification_id").notNull(),
    occurredAt: timestamp("occurred_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
  },
  (table) => ({
    keyTimeIdx: index("idx_notifykit_rate_limits_key_time").on(
      table.key,
      table.occurredAt,
    ),
  }),
);

export const digestBuffers = pgTable(
  "notifykit_digest_buffers",
  {
    key: text("key").primaryKey(),
    recipientId: text("recipient_id").notNull(),
    tenantId: text("tenant_id"),
    workspaceId: text("workspace_id"),
    notificationId: text("notification_id").notNull(),
    payloads: jsonb("payloads")
      .$type<Record<string, unknown>[]>()
      .notNull(),
    flushAt: timestamp("flush_at", { withTimezone: true, mode: "date" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull(),
  },
  (table) => ({
    flushAtIdx: index("idx_notifykit_digests_flush_at").on(table.flushAt),
  }),
);

export const notifyKitPgSchema = {
  recipients,
  notifications,
  inboxItems,
  deliveries,
  preferences,
  digestBuffers,
  rateLimitEvents,
  scheduledSends,
};

export type NotifyKitPgSchema = typeof notifyKitPgSchema;

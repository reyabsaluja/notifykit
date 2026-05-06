import { sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

// Foreign keys are intentionally omitted. Deliveries and notifications are
// historical/audit records that must survive recipient deletion. Application
// code handles cleanup via the adapter's delete methods.
export const recipients = sqliteTable("notifykit_recipients", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id"),
  workspaceId: text("workspace_id"),
  email: text("email"),
  phone: text("phone"),
  name: text("name"),
  quietHours: text("quiet_hours", { mode: "json" }).$type<{
    start: string;
    end: string;
    timezone?: string;
  } | null>(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

export const notifications = sqliteTable(
  "notifykit_notifications",
  {
    id: text("id").primaryKey(),
    recipientId: text("recipient_id").notNull(),
    tenantId: text("tenant_id"),
    workspaceId: text("workspace_id"),
    notificationId: text("notification_id").notNull(),
    payload: text("payload", { mode: "json" })
      .$type<Record<string, unknown>>()
      .notNull(),
    /** @since 0.1 – migration: ALTER TABLE notifykit_notifications ADD COLUMN payload_schema TEXT; (json) */
    payloadSchema: text("payload_schema", { mode: "json" })
      .$type<Record<string, string>>(),
    /** @since 0.1 – migration: ALTER TABLE notifykit_notifications ADD COLUMN definition_version INTEGER; */
    definitionVersion: integer("definition_version"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => ({
    recipientIdx: index("idx_notifykit_notifications_recipient").on(
      table.recipientId,
    ),
  }),
);

export const inboxItems = sqliteTable(
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
    readAt: integer("read_at", { mode: "timestamp_ms" }),
    /** @since 0.1 – migration: ALTER TABLE notifykit_inbox_items ADD COLUMN archived_at INTEGER; */
    archivedAt: integer("archived_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => ({
    recipientIdx: index("idx_notifykit_inbox_recipient").on(
      table.recipientId,
    ),
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

export const deliveries = sqliteTable(
  "notifykit_deliveries",
  {
    id: text("id").primaryKey(),
    notificationRecordId: text("notification_record_id").notNull(),
    recipientId: text("recipient_id").notNull(),
    tenantId: text("tenant_id"),
    workspaceId: text("workspace_id"),
    notificationId: text("notification_id").notNull(),
    channel: text("channel").notNull().$type<"email" | "webhook" | "sms" | "inbox">(),
    provider: text("provider").notNull(),
    status: text("status")
      .notNull()
      .$type<"pending" | "sent" | "failed" | "skipped">(),
    to: text("to"),
    subject: text("subject"),
    body: text("body"),
    providerMessageId: text("provider_message_id"),
    error: text("error"),
    skipReason: text("skip_reason"),
    skipDetails: text("skip_details"),
    attempts: integer("attempts").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
    sentAt: integer("sent_at", { mode: "timestamp_ms" }),
    failedAt: integer("failed_at", { mode: "timestamp_ms" }),
  },
  (table) => ({
    recipientIdx: index("idx_notifykit_deliveries_recipient").on(
      table.recipientId,
    ),
  }),
);

export const preferences = sqliteTable(
  "notifykit_preferences",
  {
    recipientId: text("recipient_id").notNull(),
    tenantId: text("tenant_id").notNull().default(""),
    workspaceId: text("workspace_id").notNull().default(""),
    notificationId: text("notification_id").notNull(),
    channels: text("channels", { mode: "json" })
      .$type<Record<string, boolean>>()
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
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

export const scheduledSends = sqliteTable(
  "notifykit_scheduled_sends",
  {
    id: text("id").primaryKey(),
    recipientId: text("recipient_id").notNull(),
    tenantId: text("tenant_id"),
    workspaceId: text("workspace_id"),
    notificationId: text("notification_id").notNull(),
    notificationRecordId: text("notification_record_id"),
    payload: text("payload", { mode: "json" })
      .$type<Record<string, unknown>>()
      .notNull(),
    scheduledFor: integer("scheduled_for", { mode: "timestamp_ms" }).notNull(),
    reason: text("reason").notNull().$type<"quiet_hours">(),
    status: text("status")
      .notNull()
      .$type<"pending" | "claimed">()
      .default("pending"),
    claimedAt: integer("claimed_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => ({
    scheduledForIdx: index("idx_notifykit_scheduled_sends_scheduled_for").on(
      table.scheduledFor,
    ),
    statusDueIdx: index("idx_notifykit_scheduled_sends_status_due").on(
      table.status,
      table.scheduledFor,
    ),
  }),
);

export const rateLimitEvents = sqliteTable(
  "notifykit_rate_limit_events",
  {
    id: text("id").primaryKey(),
    key: text("key").notNull(),
    recipientId: text("recipient_id").notNull(),
    tenantId: text("tenant_id"),
    workspaceId: text("workspace_id"),
    notificationId: text("notification_id").notNull(),
    occurredAt: integer("occurred_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => ({
    keyTimeIdx: index("idx_notifykit_rate_limits_key_time").on(
      table.key,
      table.occurredAt,
    ),
  }),
);

export const digestBuffers = sqliteTable(
  "notifykit_digest_buffers",
  {
    key: text("key").primaryKey(),
    recipientId: text("recipient_id").notNull(),
    tenantId: text("tenant_id"),
    workspaceId: text("workspace_id"),
    notificationId: text("notification_id").notNull(),
    payloads: text("payloads", { mode: "json" })
      .$type<Record<string, unknown>[]>()
      .notNull(),
    flushAt: integer("flush_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => ({
    flushAtIdx: index("idx_notifykit_digests_flush_at").on(table.flushAt),
  }),
);

export const notifyKitSchema = {
  recipients,
  notifications,
  inboxItems,
  deliveries,
  preferences,
  digestBuffers,
  rateLimitEvents,
  scheduledSends,
};

export type NotifyKitSqliteSchema = typeof notifyKitSchema;

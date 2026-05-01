import { sql } from "drizzle-orm";
import {
  integer,
  primaryKey,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

export const recipients = sqliteTable("notifykit_recipients", {
  id: text("id").primaryKey(),
  email: text("email"),
  name: text("name"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

export const notifications = sqliteTable("notifykit_notifications", {
  id: text("id").primaryKey(),
  recipientId: text("recipient_id").notNull(),
  notificationId: text("notification_id").notNull(),
  payload: text("payload", { mode: "json" })
    .$type<Record<string, unknown>>()
    .notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

export const inboxItems = sqliteTable("notifykit_inbox_items", {
  id: text("id").primaryKey(),
  notificationRecordId: text("notification_record_id").notNull(),
  recipientId: text("recipient_id").notNull(),
  notificationId: text("notification_id").notNull(),
  title: text("title").notNull(),
  body: text("body"),
  actionUrl: text("action_url"),
  readAt: integer("read_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

export const deliveries = sqliteTable("notifykit_deliveries", {
  id: text("id").primaryKey(),
  notificationRecordId: text("notification_record_id").notNull(),
  recipientId: text("recipient_id").notNull(),
  notificationId: text("notification_id").notNull(),
  channel: text("channel").notNull().$type<"email">(),
  provider: text("provider").notNull(),
  status: text("status")
    .notNull()
    .$type<"pending" | "sent" | "failed">(),
  to: text("to"),
  subject: text("subject"),
  body: text("body"),
  providerMessageId: text("provider_message_id"),
  error: text("error"),
  attempts: integer("attempts").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  sentAt: integer("sent_at", { mode: "timestamp_ms" }),
  failedAt: integer("failed_at", { mode: "timestamp_ms" }),
});

export const preferences = sqliteTable(
  "notifykit_preferences",
  {
    recipientId: text("recipient_id").notNull(),
    notificationId: text("notification_id").notNull(),
    channels: text("channels", { mode: "json" })
      .$type<Record<string, boolean>>()
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.recipientId, table.notificationId] }),
  }),
);

export const digestBuffers = sqliteTable("notifykit_digest_buffers", {
  key: text("key").primaryKey(),
  recipientId: text("recipient_id").notNull(),
  notificationId: text("notification_id").notNull(),
  payloads: text("payloads", { mode: "json" })
    .$type<Record<string, unknown>[]>()
    .notNull(),
  flushAt: integer("flush_at", { mode: "timestamp_ms" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const notifyKitSchema = {
  recipients,
  notifications,
  inboxItems,
  deliveries,
  preferences,
  digestBuffers,
};

export type NotifyKitSqliteSchema = typeof notifyKitSchema;

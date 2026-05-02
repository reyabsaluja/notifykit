import { sql } from "drizzle-orm";
import { integer, primaryKey, sqliteTable, text, } from "drizzle-orm/sqlite-core";
export const recipients = sqliteTable("notifykit_recipients", {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id"),
    workspaceId: text("workspace_id"),
    email: text("email"),
    name: text("name"),
    quietHours: text("quiet_hours", { mode: "json" }).$type(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
        .notNull()
        .default(sql `(unixepoch() * 1000)`),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
        .notNull()
        .default(sql `(unixepoch() * 1000)`),
});
export const notifications = sqliteTable("notifykit_notifications", {
    id: text("id").primaryKey(),
    recipientId: text("recipient_id").notNull(),
    tenantId: text("tenant_id"),
    workspaceId: text("workspace_id"),
    notificationId: text("notification_id").notNull(),
    payload: text("payload", { mode: "json" })
        .$type()
        .notNull(),
    /** @since 0.1 – migration: ALTER TABLE notifykit_notifications ADD COLUMN payload_schema TEXT; (json) */
    payloadSchema: text("payload_schema", { mode: "json" })
        .$type(),
    /** @since 0.1 – migration: ALTER TABLE notifykit_notifications ADD COLUMN definition_version INTEGER; */
    definitionVersion: integer("definition_version"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});
export const inboxItems = sqliteTable("notifykit_inbox_items", {
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
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});
export const deliveries = sqliteTable("notifykit_deliveries", {
    id: text("id").primaryKey(),
    notificationRecordId: text("notification_record_id").notNull(),
    recipientId: text("recipient_id").notNull(),
    tenantId: text("tenant_id"),
    workspaceId: text("workspace_id"),
    notificationId: text("notification_id").notNull(),
    channel: text("channel").notNull().$type(),
    provider: text("provider").notNull(),
    status: text("status")
        .notNull()
        .$type(),
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
export const preferences = sqliteTable("notifykit_preferences", {
    recipientId: text("recipient_id").notNull(),
    tenantId: text("tenant_id").notNull().default(""),
    workspaceId: text("workspace_id").notNull().default(""),
    notificationId: text("notification_id").notNull(),
    channels: text("channels", { mode: "json" })
        .$type()
        .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => ({
    pk: primaryKey({
        columns: [
            table.recipientId,
            table.notificationId,
            table.tenantId,
            table.workspaceId,
        ],
    }),
}));
export const scheduledSends = sqliteTable("notifykit_scheduled_sends", {
    id: text("id").primaryKey(),
    recipientId: text("recipient_id").notNull(),
    tenantId: text("tenant_id"),
    workspaceId: text("workspace_id"),
    notificationId: text("notification_id").notNull(),
    payload: text("payload", { mode: "json" })
        .$type()
        .notNull(),
    scheduledFor: integer("scheduled_for", { mode: "timestamp_ms" }).notNull(),
    reason: text("reason").notNull().$type(),
    status: text("status")
        .notNull()
        .$type()
        .default("pending"),
    claimedAt: integer("claimed_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});
export const rateLimitEvents = sqliteTable("notifykit_rate_limit_events", {
    id: text("id").primaryKey(),
    key: text("key").notNull(),
    recipientId: text("recipient_id").notNull(),
    tenantId: text("tenant_id"),
    workspaceId: text("workspace_id"),
    notificationId: text("notification_id").notNull(),
    occurredAt: integer("occurred_at", { mode: "timestamp_ms" }).notNull(),
});
export const digestBuffers = sqliteTable("notifykit_digest_buffers", {
    key: text("key").primaryKey(),
    recipientId: text("recipient_id").notNull(),
    tenantId: text("tenant_id"),
    workspaceId: text("workspace_id"),
    notificationId: text("notification_id").notNull(),
    payloads: text("payloads", { mode: "json" })
        .$type()
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
    rateLimitEvents,
    scheduledSends,
};
//# sourceMappingURL=sqlite.js.map
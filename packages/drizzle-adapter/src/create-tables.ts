import { sql } from "drizzle-orm";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";

/**
 * Create NotifyKit's SQLite tables if they don't exist.
 *
 * This is meant for quick starts, tests, and prototypes. Production
 * apps should generate migrations with drizzle-kit instead.
 */
export async function createSqliteTables(
  db: BaseSQLiteDatabase<"sync" | "async", unknown, any, any>,
): Promise<void> {
  const statements = [
    `CREATE TABLE IF NOT EXISTS notifykit_recipients (
      id TEXT PRIMARY KEY,
      tenant_id TEXT,
      workspace_id TEXT,
      email TEXT,
      name TEXT,
      quiet_hours TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS notifykit_notifications (
      id TEXT PRIMARY KEY,
      recipient_id TEXT NOT NULL,
      tenant_id TEXT,
      workspace_id TEXT,
      notification_id TEXT NOT NULL,
      payload TEXT NOT NULL,
      payload_schema TEXT,
      definition_version INTEGER,
      created_at INTEGER NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_notifykit_notifications_recipient
      ON notifykit_notifications (recipient_id)`,
    `CREATE TABLE IF NOT EXISTS notifykit_inbox_items (
      id TEXT PRIMARY KEY,
      notification_record_id TEXT NOT NULL,
      recipient_id TEXT NOT NULL,
      tenant_id TEXT,
      workspace_id TEXT,
      notification_id TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT,
      action_url TEXT,
      read_at INTEGER,
      archived_at INTEGER,
      created_at INTEGER NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_notifykit_inbox_recipient
      ON notifykit_inbox_items (recipient_id)`,
    `CREATE TABLE IF NOT EXISTS notifykit_deliveries (
      id TEXT PRIMARY KEY,
      notification_record_id TEXT NOT NULL,
      recipient_id TEXT NOT NULL,
      tenant_id TEXT,
      workspace_id TEXT,
      notification_id TEXT NOT NULL,
      channel TEXT NOT NULL,
      provider TEXT NOT NULL,
      status TEXT NOT NULL,
      "to" TEXT,
      subject TEXT,
      body TEXT,
      provider_message_id TEXT,
      error TEXT,
      attempts INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      sent_at INTEGER,
      failed_at INTEGER
    )`,
    `CREATE INDEX IF NOT EXISTS idx_notifykit_deliveries_recipient
      ON notifykit_deliveries (recipient_id)`,
    `CREATE TABLE IF NOT EXISTS notifykit_preferences (
      recipient_id TEXT NOT NULL,
      tenant_id TEXT NOT NULL DEFAULT '',
      workspace_id TEXT NOT NULL DEFAULT '',
      notification_id TEXT NOT NULL,
      channels TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (recipient_id, notification_id, tenant_id, workspace_id)
    )`,
    `CREATE TABLE IF NOT EXISTS notifykit_digest_buffers (
      key TEXT PRIMARY KEY,
      recipient_id TEXT NOT NULL,
      tenant_id TEXT,
      workspace_id TEXT,
      notification_id TEXT NOT NULL,
      payloads TEXT NOT NULL,
      flush_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_notifykit_digests_flush_at
      ON notifykit_digest_buffers (flush_at)`,
    `CREATE TABLE IF NOT EXISTS notifykit_rate_limit_events (
      id TEXT PRIMARY KEY,
      key TEXT NOT NULL,
      recipient_id TEXT NOT NULL,
      tenant_id TEXT,
      workspace_id TEXT,
      notification_id TEXT NOT NULL,
      occurred_at INTEGER NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_notifykit_rate_limits_key_time
      ON notifykit_rate_limit_events (key, occurred_at)`,
    `CREATE TABLE IF NOT EXISTS notifykit_scheduled_sends (
      id TEXT PRIMARY KEY,
      recipient_id TEXT NOT NULL,
      tenant_id TEXT,
      workspace_id TEXT,
      notification_id TEXT NOT NULL,
      notification_record_id TEXT,
      payload TEXT NOT NULL,
      scheduled_for INTEGER NOT NULL,
      reason TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      claimed_at INTEGER,
      created_at INTEGER NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_notifykit_scheduled_sends_scheduled_for
      ON notifykit_scheduled_sends (scheduled_for)`,
    `CREATE INDEX IF NOT EXISTS idx_notifykit_scheduled_sends_status_due
      ON notifykit_scheduled_sends (status, scheduled_for)`,
  ];

  for (const stmt of statements) {
    await db.run(sql.raw(stmt));
  }

  // Backfill columns for tables created before these were added.
  const backfills = [
    `ALTER TABLE notifykit_inbox_items ADD COLUMN archived_at INTEGER`,
    `ALTER TABLE notifykit_recipients ADD COLUMN tenant_id TEXT`,
    `ALTER TABLE notifykit_recipients ADD COLUMN workspace_id TEXT`,
    `ALTER TABLE notifykit_notifications ADD COLUMN tenant_id TEXT`,
    `ALTER TABLE notifykit_notifications ADD COLUMN workspace_id TEXT`,
    `ALTER TABLE notifykit_inbox_items ADD COLUMN tenant_id TEXT`,
    `ALTER TABLE notifykit_inbox_items ADD COLUMN workspace_id TEXT`,
    `ALTER TABLE notifykit_deliveries ADD COLUMN tenant_id TEXT`,
    `ALTER TABLE notifykit_deliveries ADD COLUMN workspace_id TEXT`,
    `ALTER TABLE notifykit_digest_buffers ADD COLUMN tenant_id TEXT`,
    `ALTER TABLE notifykit_digest_buffers ADD COLUMN workspace_id TEXT`,
    `ALTER TABLE notifykit_rate_limit_events ADD COLUMN tenant_id TEXT`,
    `ALTER TABLE notifykit_rate_limit_events ADD COLUMN workspace_id TEXT`,
    `ALTER TABLE notifykit_scheduled_sends ADD COLUMN tenant_id TEXT`,
    `ALTER TABLE notifykit_scheduled_sends ADD COLUMN workspace_id TEXT`,
  ];
  for (const stmt of backfills) {
    try {
      await db.run(sql.raw(stmt));
    } catch {
      // Column already exists — expected for fresh tables.
    }
  }

  // Migrate preferences PK from (recipient_id, notification_id) to
  // (recipient_id, notification_id, tenant_id, workspace_id) for pre-tenant
  // databases. SQLite can't ALTER a PK, so we rebuild via a temp table.
  const tableInfo = await db.all<{ name: string }>(
    sql.raw(`PRAGMA table_info(notifykit_preferences)`),
  );
  const colNames = tableInfo.map((c) => c.name);
  if (!colNames.includes("tenant_id")) {
    await db.run(sql.raw(`ALTER TABLE notifykit_preferences RENAME TO _notifykit_preferences_old`));
    await db.run(sql.raw(`CREATE TABLE notifykit_preferences (
      recipient_id TEXT NOT NULL,
      tenant_id TEXT NOT NULL DEFAULT '',
      workspace_id TEXT NOT NULL DEFAULT '',
      notification_id TEXT NOT NULL,
      channels TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (recipient_id, notification_id, tenant_id, workspace_id)
    )`));
    await db.run(sql.raw(`INSERT INTO notifykit_preferences (recipient_id, notification_id, channels, updated_at, tenant_id, workspace_id)
      SELECT recipient_id, notification_id, channels, updated_at, '', '' FROM _notifykit_preferences_old`));
    await db.run(sql.raw(`DROP TABLE _notifykit_preferences_old`));
  }
}

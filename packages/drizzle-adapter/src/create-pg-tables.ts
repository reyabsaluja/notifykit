import { sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

/**
 * Create NotifyKit's Postgres tables if they don't exist.
 *
 * This is meant for quick starts, tests, and prototypes. Production
 * apps should generate migrations with drizzle-kit instead.
 */
export async function createPgTables(
  db: PgDatabase<PgQueryResultHKT, any, any>,
): Promise<void> {
  const statements = [
    `CREATE TABLE IF NOT EXISTS notifykit_recipients (
      id TEXT PRIMARY KEY,
      tenant_id TEXT,
      workspace_id TEXT,
      email TEXT,
      name TEXT,
      quiet_hours JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS notifykit_notifications (
      id TEXT PRIMARY KEY,
      recipient_id TEXT NOT NULL,
      tenant_id TEXT,
      workspace_id TEXT,
      notification_id TEXT NOT NULL,
      payload JSONB NOT NULL,
      payload_schema JSONB,
      definition_version INTEGER,
      created_at TIMESTAMPTZ NOT NULL
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
      read_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL
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
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL,
      sent_at TIMESTAMPTZ,
      failed_at TIMESTAMPTZ
    )`,
    `CREATE INDEX IF NOT EXISTS idx_notifykit_deliveries_recipient
      ON notifykit_deliveries (recipient_id)`,
    `CREATE TABLE IF NOT EXISTS notifykit_preferences (
      recipient_id TEXT NOT NULL,
      tenant_id TEXT NOT NULL DEFAULT '',
      workspace_id TEXT NOT NULL DEFAULT '',
      notification_id TEXT NOT NULL,
      channels JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL,
      PRIMARY KEY (recipient_id, notification_id, tenant_id, workspace_id)
    )`,
    `CREATE TABLE IF NOT EXISTS notifykit_digest_buffers (
      key TEXT PRIMARY KEY,
      recipient_id TEXT NOT NULL,
      tenant_id TEXT,
      workspace_id TEXT,
      notification_id TEXT NOT NULL,
      payloads JSONB NOT NULL,
      flush_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL
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
      occurred_at TIMESTAMPTZ NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_notifykit_rate_limits_key_time
      ON notifykit_rate_limit_events (key, occurred_at)`,
    `CREATE TABLE IF NOT EXISTS notifykit_scheduled_sends (
      id TEXT PRIMARY KEY,
      recipient_id TEXT NOT NULL,
      tenant_id TEXT,
      workspace_id TEXT,
      notification_id TEXT NOT NULL,
      payload JSONB NOT NULL,
      scheduled_for TIMESTAMPTZ NOT NULL,
      reason TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      claimed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_notifykit_scheduled_sends_scheduled_for
      ON notifykit_scheduled_sends (scheduled_for)`,
    `CREATE INDEX IF NOT EXISTS idx_notifykit_scheduled_sends_status_due
      ON notifykit_scheduled_sends (status, scheduled_for)`,
  ];

  for (const stmt of statements) {
    await db.execute(sql.raw(stmt));
  }
}

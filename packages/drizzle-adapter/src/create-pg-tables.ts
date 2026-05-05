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
      phone TEXT,
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
      archived_at TIMESTAMPTZ,
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
      notification_record_id TEXT,
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

  // Backfill columns for tables created before these were added.
  const backfills = [
    `ALTER TABLE notifykit_inbox_items ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ`,
    `ALTER TABLE notifykit_recipients ADD COLUMN IF NOT EXISTS tenant_id TEXT`,
    `ALTER TABLE notifykit_recipients ADD COLUMN IF NOT EXISTS workspace_id TEXT`,
    `ALTER TABLE notifykit_recipients ADD COLUMN IF NOT EXISTS phone TEXT`,
    `ALTER TABLE notifykit_notifications ADD COLUMN IF NOT EXISTS tenant_id TEXT`,
    `ALTER TABLE notifykit_notifications ADD COLUMN IF NOT EXISTS workspace_id TEXT`,
    `ALTER TABLE notifykit_inbox_items ADD COLUMN IF NOT EXISTS tenant_id TEXT`,
    `ALTER TABLE notifykit_inbox_items ADD COLUMN IF NOT EXISTS workspace_id TEXT`,
    `ALTER TABLE notifykit_deliveries ADD COLUMN IF NOT EXISTS tenant_id TEXT`,
    `ALTER TABLE notifykit_deliveries ADD COLUMN IF NOT EXISTS workspace_id TEXT`,
    `ALTER TABLE notifykit_digest_buffers ADD COLUMN IF NOT EXISTS tenant_id TEXT`,
    `ALTER TABLE notifykit_digest_buffers ADD COLUMN IF NOT EXISTS workspace_id TEXT`,
    `ALTER TABLE notifykit_rate_limit_events ADD COLUMN IF NOT EXISTS tenant_id TEXT`,
    `ALTER TABLE notifykit_rate_limit_events ADD COLUMN IF NOT EXISTS workspace_id TEXT`,
    `ALTER TABLE notifykit_scheduled_sends ADD COLUMN IF NOT EXISTS tenant_id TEXT`,
    `ALTER TABLE notifykit_scheduled_sends ADD COLUMN IF NOT EXISTS workspace_id TEXT`,
  ];
  for (const stmt of backfills) {
    await db.execute(sql.raw(stmt));
  }

  // Migrate preferences PK from (recipient_id, notification_id) to
  // (recipient_id, notification_id, tenant_id, workspace_id) for pre-tenant
  // databases. Postgres doesn't support ADD COLUMN IF NOT EXISTS for PK
  // changes, so we detect the old schema and rebuild.
  const pkCheck = await db.execute(sql.raw(`
    SELECT a.attname FROM pg_index i
    JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
    WHERE i.indrelid = 'notifykit_preferences'::regclass AND i.indisprimary
    ORDER BY array_position(i.indkey, a.attnum)
  `));
  const pkCols = (pkCheck as { rows: Array<{ attname: string }> }).rows.map(
    (r) => r.attname,
  );
  if (!pkCols.includes("tenant_id")) {
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(
        `ALTER TABLE notifykit_preferences ADD COLUMN IF NOT EXISTS tenant_id TEXT`
      ));
      await tx.execute(sql.raw(
        `ALTER TABLE notifykit_preferences ADD COLUMN IF NOT EXISTS workspace_id TEXT`
      ));
      await tx.execute(sql.raw(
        `UPDATE notifykit_preferences SET tenant_id = '' WHERE tenant_id IS NULL`
      ));
      await tx.execute(sql.raw(
        `UPDATE notifykit_preferences SET workspace_id = '' WHERE workspace_id IS NULL`
      ));
      await tx.execute(sql.raw(
        `ALTER TABLE notifykit_preferences ALTER COLUMN tenant_id SET NOT NULL`
      ));
      await tx.execute(sql.raw(
        `ALTER TABLE notifykit_preferences ALTER COLUMN tenant_id SET DEFAULT ''`
      ));
      await tx.execute(sql.raw(
        `ALTER TABLE notifykit_preferences ALTER COLUMN workspace_id SET NOT NULL`
      ));
      await tx.execute(sql.raw(
        `ALTER TABLE notifykit_preferences ALTER COLUMN workspace_id SET DEFAULT ''`
      ));
      await tx.execute(sql.raw(
        `ALTER TABLE notifykit_preferences DROP CONSTRAINT IF EXISTS notifykit_preferences_pkey`
      ));
      await tx.execute(sql.raw(
        `ALTER TABLE notifykit_preferences ADD PRIMARY KEY (recipient_id, notification_id, tenant_id, workspace_id)`
      ));
    });
  }
}

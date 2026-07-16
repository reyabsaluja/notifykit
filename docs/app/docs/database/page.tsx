import Link from "next/link";
import { createDocsMetadata } from "../../../lib/site";
import { Code } from "../../_components/code";

export const metadata = createDocsMetadata("database");

export default function DatabasePage() {
  return (
    <article>
      <h1>Database adapters</h1>
      <p>
        NotifyKit stores all state (recipients, notifications, inbox items,
        deliveries, preferences) in your database via a pluggable adapter.
        The memory adapter is great for development; Drizzle adapters provide
        persistent SQLite and PostgreSQL storage.
      </p>

      <h2>Which adapter?</h2>
      <div className="features">
        <div className="feature-card">
          <h3>Memory</h3>
          <p><strong>Dev &amp; tests.</strong> Zero config, instant startup, resets on restart. No database required — state lives in-process.</p>
          <table style={{ fontSize: "0.85em", marginTop: "0.5rem" }}>
            <tbody>
              <tr><td>Persistence</td><td>None (in-process)</td></tr>
              <tr><td>Concurrency</td><td>Single process</td></tr>
              <tr><td>Setup</td><td>Zero — built into core</td></tr>
            </tbody>
          </table>
        </div>
        <div className="feature-card">
          <h3>SQLite</h3>
          <p><strong>Prototypes &amp; single-server.</strong> File-based persistence without a running database process. Fast reads, simple deploys.</p>
          <table style={{ fontSize: "0.85em", marginTop: "0.5rem" }}>
            <tbody>
              <tr><td>Persistence</td><td>File on disk</td></tr>
              <tr><td>Concurrency</td><td>Single writer</td></tr>
              <tr><td>Setup</td><td><code>better-sqlite3</code></td></tr>
            </tbody>
          </table>
        </div>
        <div className="feature-card">
          <h3>PostgreSQL</h3>
          <p><strong>Persistent multi-instance deployments.</strong> Supports concurrent writers and uses your existing Postgres operations and backups.</p>
          <table style={{ fontSize: "0.85em", marginTop: "0.5rem" }}>
            <tbody>
              <tr><td>Persistence</td><td>Networked DB</td></tr>
              <tr><td>Concurrency</td><td>Multi-writer</td></tr>
              <tr><td>Setup</td><td><code>postgres</code> + connection URL</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="callout callout-tip">
        <strong>Start with memory, graduate to Postgres.</strong> The adapter
        swap is a one-line change in <code>lib/notifykit.ts</code>. All
        behavior stays identical — only the storage layer changes.
      </div>

      <div className="overview-flow">
        <div className="overview-flow-step">
          <span className="overview-flow-number">1</span>
          <div>
            <strong>Your app calls <code>notify.send()</code></strong>
            <p>All reads and writes go through the adapter interface — NotifyKit never touches your DB directly.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">2</span>
          <div>
            <strong>Adapter translates to queries</strong>
            <p>The adapter maps operations (create inbox item, update preference) to your ORM or raw SQL.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">3</span>
          <div>
            <strong>Data lives in your database</strong>
            <p>Same connection pool, same backup strategy, same access controls as the rest of your app.</p>
          </div>
        </div>
      </div>

      <h2>Memory adapter</h2>
      <p>
        Zero-config, no database required. State lives in-process and resets
        on restart. Perfect for local dev and tests.
      </p>
      <Code
        code={`import { memoryAdapter } from "@notifykitjs/core"

const notify = createNotifyKit({
  // ...
  database: memoryAdapter(),
})`}
      />

      <h2>Drizzle SQLite</h2>
      <Code
        lang="bash"
        code={`npm install @notifykitjs/drizzle drizzle-orm better-sqlite3`}
      />
      <Code
        filename="lib/notifykit.ts"
        code={`import Database from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"
import { createSqliteTables, drizzleSqliteAdapter } from "@notifykitjs/drizzle"

const sqlite = new Database("app.db")
const db = drizzle(sqlite)

// Create tables (run once, or use drizzle-kit migrations in production)
await createSqliteTables(db)

export const notify = createNotifyKit({
  // ...
  database: drizzleSqliteAdapter(db),
})`}
      />

      <h2>Drizzle PostgreSQL</h2>
      <Code
        lang="bash"
        code={`npm install @notifykitjs/drizzle drizzle-orm postgres`}
      />
      <Code
        filename="lib/notifykit.ts"
        code={`import postgres from "postgres"
import { drizzle } from "drizzle-orm/postgres-js"
import { createPgTables, drizzlePostgresAdapter } from "@notifykitjs/drizzle"

const client = postgres(process.env.DATABASE_URL!)
const db = drizzle(client)

// Create tables (run once, or use drizzle-kit migrations)
await createPgTables(db)

export const notify = createNotifyKit({
  // ...
  database: drizzlePostgresAdapter(db),
})`}
      />

      <h2>Connection pool sizing</h2>
      <p>
        NotifyKit uses your existing database connection — it doesn&apos;t open its
        own pool. But notification sends add database load, especially under
        burst traffic. Size the pool from measurements in your deployment, not
        a generic sends-per-second table.
      </p>
      <table>
        <thead>
          <tr><th>Signal</th><th>What to inspect</th><th>Possible response</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>Connections wait during send bursts</td>
            <td>Pool wait time and <code>pg_stat_activity</code></td>
            <td>Reduce concurrency, increase the pool within database limits, or queue work</td>
          </tr>
          <tr>
            <td>Many application instances exhaust total connections</td>
            <td>Aggregate pool size across every instance</td>
            <td>Use a pooler and set a smaller per-instance maximum</td>
          </tr>
          <tr>
            <td>Queries are slow without pool waits</td>
            <td><code>EXPLAIN ANALYZE</code>, locks, and database I/O</td>
            <td>Tune the query/index or reduce contention before adding connections</td>
          </tr>
        </tbody>
      </table>
      <Code
        code={`// postgres.js — set pool size explicitly
const client = postgres(process.env.DATABASE_URL!, {
  max: 10, // connections in the pool
  idle_timeout: 20, // seconds before idle connections close
  connect_timeout: 10, // seconds to wait for a connection
})`}
      />
      <div className="callout callout-tip">
        <strong>Load test the real pipeline.</strong> Query count varies with
        channels, preferences, rate limits, digests, and fallbacks. Measure the
        exact notification mix you expect at peak rather than relying on a
        fixed pool recommendation.
      </div>

      <h2>Production migrations</h2>
      <p>
        The <code>createPgTables</code> / <code>createSqliteTables</code> helpers
        are fine for quick setup. For production, export the schema and use
        drizzle-kit for versioned migrations:
      </p>
      <Code
        lang="bash"
        code={`# Generate a migration from the NotifyKit schema
npx drizzle-kit generate

# Apply it (same as your app migrations)
npx drizzle-kit migrate`}
      />
      <div className="callout callout-tip">
        <strong>Why versioned migrations?</strong> Future NotifyKit versions may
        add columns or tables. With drizzle-kit, you get a diff you can review
        before applying — no surprise schema changes in production.
      </div>
      <div className="callout callout-warn">
        <strong>The preview does not yet ship a versioned migration history.</strong>{" "}
        Generate and commit migrations in your application, review the diff on
        every NotifyKit upgrade, and do not run table-creation helpers during
        production startup.
      </div>

      <h2>Joining NotifyKit tables with your app</h2>
      <p>
        The Drizzle adapter exports the full schema so you can join
        NotifyKit tables against your own:
      </p>
      <Code
        code={`import { notifyKitSchema } from "@notifykitjs/drizzle"
import { eq } from "drizzle-orm"

// Get all inbox items for a user with their notification details
const items = await db
  .select()
  .from(notifyKitSchema.inboxItems)
  .where(eq(notifyKitSchema.inboxItems.recipientId, user.id))
  .orderBy(notifyKitSchema.inboxItems.createdAt)`}
      />

      <h3>Common queries</h3>
      <p>
        Patterns you&apos;ll likely need when building admin dashboards,
        analytics, or custom UI on top of NotifyKit data:
      </p>
      <table>
        <thead>
          <tr><th>Query</th><th>Use case</th></tr>
        </thead>
        <tbody>
          <tr><td>Unread count per user</td><td>Dashboard badges, nav indicators outside React hooks</td></tr>
          <tr><td>Failed deliveries in last hour</td><td>Incident detection, provider health checks</td></tr>
          <tr><td>Recipients with no recent inbox items</td><td>Churn detection, stale account cleanup</td></tr>
          <tr><td>Delivery success rate by channel</td><td>Provider monitoring, cost/reliability analysis</td></tr>
        </tbody>
      </table>
      <Code
        code={`import { notifyKitSchema } from "@notifykitjs/drizzle"
import { eq, isNull, gt, sql, and, count } from "drizzle-orm"

const { inboxItems, deliveries, recipients } = notifyKitSchema

// Unread count for a specific user (server-side, outside hooks)
const [{ unread }] = await db
  .select({ unread: count() })
  .from(inboxItems)
  .where(and(
    eq(inboxItems.recipientId, userId),
    isNull(inboxItems.readAt),
    isNull(inboxItems.archivedAt),
  ))

// Failed deliveries in the last hour (incident detection)
const oneHourAgo = new Date(Date.now() - 60 * 60_000)
const failures = await db
  .select()
  .from(deliveries)
  .where(and(
    eq(deliveries.status, "failed"),
    gt(deliveries.failedAt, oneHourAgo),
  ))

// Delivery success rate by channel (last 24h)
const oneDayAgo = new Date(Date.now() - 24 * 60 * 60_000)
const stats = await db
  .select({
    channel: deliveries.channel,
    total: count(),
    sent: sql\`count(*) filter (where \${deliveries.status} = 'sent')\`,
  })
  .from(deliveries)
  .where(gt(deliveries.createdAt, oneDayAgo))
  .groupBy(deliveries.channel)`}
      />
      <div className="callout callout-tip">
        <strong>Prefer the SDK for user-facing reads.</strong> Use direct queries
        for admin dashboards, analytics jobs, and monitoring — not for building
        inbox UIs. The SDK handles pagination, scoping, and realtime; raw queries
        bypass those guarantees.
      </div>

      <h2>Schema overview</h2>
      <table>
        <thead>
          <tr>
            <th>Table</th>
            <th>Growth</th>
            <th>Retention strategy</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>notifykit_recipients</code></td>
            <td>1 row per user (stable)</td>
            <td>None needed — grows with user base only</td>
          </tr>
          <tr>
            <td><code>notifykit_notifications</code></td>
            <td>1 row per send (linear)</td>
            <td>Archive or delete after 90 days for analytics-only data</td>
          </tr>
          <tr>
            <td><code>notifykit_inbox_items</code></td>
            <td>1 row per send × inbox channel</td>
            <td>Users delete via UI. Optionally purge archived items older than 30 days.</td>
          </tr>
          <tr>
            <td><code>notifykit_deliveries</code></td>
            <td>1 row per channel per send</td>
            <td>Useful for debugging — prune <code>status = &apos;sent&apos;</code> after 30 days, keep failures longer</td>
          </tr>
          <tr>
            <td><code>notifykit_preferences</code></td>
            <td>1 row per (user, notification) pair</td>
            <td>None needed — bounded by user count × notification count</td>
          </tr>
          <tr>
            <td><code>notifykit_scheduled_sends</code></td>
            <td>Transient — consumed on flush</td>
            <td>Self-cleaning. Rows disappear after quiet hours end.</td>
          </tr>
          <tr>
            <td><code>notifykit_rate_limit_events</code></td>
            <td>Transient — expires per window</td>
            <td>Self-cleaning. Purge events older than your longest window.</td>
          </tr>
          <tr>
            <td><code>notifykit_digest_buffers</code></td>
            <td>Transient — consumed on digest flush</td>
            <td>Self-cleaning. Rows disappear after digest window fires.</td>
          </tr>
          <tr>
            <td><code>notifykit_timeline_events</code></td>
            <td>3–8 rows per send (fastest grower)</td>
            <td><code>pruneTimeline()</code> on a cron — set <code>timelineRetentionMs</code></td>
          </tr>
        </tbody>
      </table>
      <div className="callout callout-warn">
        <strong>Timeline is the table to watch.</strong> It grows 3–8× faster
        than notifications (multiple events per send). Set{" "}
        <code>timelineRetentionMs</code> to 7–14 days and run{" "}
        <code>pruneTimeline()</code> on a daily cron. Without pruning, a
        100 sends/day app accumulates ~20k rows/month in this table alone.
      </div>

      <h2>Data retention automation</h2>
      <p>
        The schema overview above tells you <em>what</em> to prune — here&apos;s
        the <em>how</em>. Set up a daily cron job that cleans up old records
        without affecting active data:
      </p>
      <Code
        filename="scripts/prune-notifykit.ts"
        code={`// Run daily: npx tsx scripts/prune-notifykit.ts
// Or schedule via cron: 0 3 * * * npx tsx scripts/prune-notifykit.ts
import { notify } from "@/lib/notifykit"
import { notifyKitSchema } from "@notifykitjs/drizzle"
import { lt, and, eq, isNotNull } from "drizzle-orm"
import { db } from "@/lib/db"

const { deliveries, inboxItems, timelineEvents } = notifyKitSchema

const RETENTION = {
  timeline: 14,            // days — fastest-growing table
  sentDeliveries: 30,      // days — keep failures longer
  archivedInbox: 30,       // days — user already dismissed these
}

async function prune() {
  const now = Date.now()

  // 1. Timeline events (3-8 rows per send — biggest growth)
  const timelineCutoff = new Date(now - RETENTION.timeline * 86_400_000)
  const timelineResult = await db
    .delete(timelineEvents)
    .where(lt(timelineEvents.createdAt, timelineCutoff))
  console.log(\`Timeline: pruned \${timelineResult.rowCount ?? 0} rows (>\${RETENTION.timeline}d)\`)

  // 2. Successful deliveries (keep failures for debugging)
  const deliveryCutoff = new Date(now - RETENTION.sentDeliveries * 86_400_000)
  const deliveryResult = await db
    .delete(deliveries)
    .where(and(
      eq(deliveries.status, "sent"),
      lt(deliveries.createdAt, deliveryCutoff),
    ))
  console.log(\`Deliveries (sent): pruned \${deliveryResult.rowCount ?? 0} rows (>\${RETENTION.sentDeliveries}d)\`)

  // 3. Archived inbox items (user already read + archived)
  const archiveCutoff = new Date(now - RETENTION.archivedInbox * 86_400_000)
  const archiveResult = await db
    .delete(inboxItems)
    .where(and(
      isNotNull(inboxItems.archivedAt),
      lt(inboxItems.archivedAt, archiveCutoff),
    ))
  console.log(\`Archived inbox: pruned \${archiveResult.rowCount ?? 0} rows (>\${RETENTION.archivedInbox}d)\`)
}

prune().catch(err => {
  console.error("Prune failed:", err)
  process.exit(1)
})`}
      />
      <table>
        <thead>
          <tr><th>Table</th><th>What gets pruned</th><th>Safe because</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><code>timeline_events</code></td>
            <td>All events older than 14 days</td>
            <td>Timeline is for debugging — old events have no runtime effect</td>
          </tr>
          <tr>
            <td><code>deliveries</code></td>
            <td>Only <code>status: &quot;sent&quot;</code> older than 30 days</td>
            <td>Failed deliveries stay for investigation; sent records are just audit trail</td>
          </tr>
          <tr>
            <td><code>inbox_items</code></td>
            <td>Only archived items older than 30 days</td>
            <td>User already dismissed them; active/unread items are never touched</td>
          </tr>
        </tbody>
      </table>
      <div className="callout callout-warn">
        <strong>Run during low-traffic hours.</strong> Large DELETEs can lock
        rows and spike I/O. Schedule the cron for 3 AM (or your quietest window).
        For tables with 100k+ rows to prune, batch with{" "}
        <code>LIMIT 10000</code> in a loop to avoid long-running transactions.
      </div>
      <div className="callout callout-tip">
        <strong>Monitor what you prune.</strong> Log row counts to your metrics
        system. A sudden jump in pruned rows means either a traffic spike (normal)
        or a bug creating excessive records (investigate). Flat-lining at zero
        means the job stopped running.
      </div>

      <h2>Custom adapter</h2>
      <p>
        Implement the <code>DatabaseAdapter</code> interface to use any
        database (Prisma, Kysely, raw SQL, DynamoDB, etc). The interface is
        split into logical sections:
      </p>
      <table>
        <thead>
          <tr><th>Section</th><th>Methods</th><th>Priority</th></tr>
        </thead>
        <tbody>
          <tr><td>Recipients</td><td><code>upsert</code>, <code>findById</code></td><td>Required</td></tr>
          <tr><td>Notifications</td><td><code>create</code>, <code>findByIdempotencyKey</code>, <code>clearIdempotencyKey</code></td><td>Required</td></tr>
          <tr><td>Inbox</td><td><code>create</code>, list/count, recipient-safe mutations</td><td>Required</td></tr>
          <tr><td>Deliveries</td><td><code>create</code>, <code>findById</code>, <code>list</code>, <code>update</code></td><td>Required</td></tr>
          <tr><td>Preferences</td><td><code>get</code>, <code>list</code>, <code>upsert</code></td><td>Required</td></tr>
          <tr><td>Rate limits</td><td><code>reserve</code>, <code>count</code></td><td>Required; reservation must be atomic</td></tr>
          <tr><td>Digests</td><td><code>append</code>, <code>take</code>, <code>restore</code>, <code>list</code></td><td>Required</td></tr>
          <tr><td>Scheduled</td><td><code>create</code>, <code>claim</code>, <code>complete</code>, <code>release</code>, list methods</td><td>Required</td></tr>
          <tr><td>Dedupe</td><td><code>check</code>, <code>exists</code>, <code>prune</code></td><td>Required; check-and-insert must be atomic</td></tr>
          <tr><td>Timeline</td><td>append, list, prune methods</td><td>Optional; enables persisted diagnostics</td></tr>
        </tbody>
      </table>

      <h3>Implementation approach</h3>
      <p>
        Import <code>DatabaseAdapter</code> and implement its nested stores:
        <code> recipients</code>, <code>notifications</code>, <code>inbox</code>,
        <code> deliveries</code>, <code>preferences</code>, <code>digests</code>,
        <code> rateLimits</code>, <code>scheduledSends</code>, and
        <code> dedupe</code>. The optional <code>timeline</code> store enables
        persisted diagnostics. TypeScript reports every missing method and its
        exact input/result contract.
      </p>
      <Code
        code={`import type { DatabaseAdapter } from "@notifykitjs/core"

export function customAdapter(): DatabaseAdapter {
  return {
    recipients: createRecipientStore(),
    notifications: createNotificationStore(),
    inbox: createInboxStore(),
    deliveries: createDeliveryStore(),
    preferences: createPreferenceStore(),
    digests: createDigestStore(),
    rateLimits: createRateLimitStore(),
    scheduledSends: createScheduledSendStore(),
    dedupe: createDedupeStore(),
    timeline: createTimelineStore(), // optional
  }
}`}
      />
      <div className="callout callout-tip">
        <strong>Use the shipped adapters as executable specifications.</strong>{" "}
        Copy <code>memoryAdapter()</code> for the simplest complete contract, or
        the SQLite/Postgres adapter matching your concurrency needs. Atomic
        dedupe, rate-limit reservations, digest take/restore, and scheduled-send
        claims are correctness boundaries.
      </div>
      <h3>Implementation tips</h3>
      <table>
        <thead>
          <tr><th>Concern</th><th>Guidance</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>ID generation</strong></td>
            <td>Adapter <code>create</code> methods receive inputs without generated IDs/timestamps. Generate them consistently with the reference adapters.</td>
          </tr>
          <tr>
            <td><strong>Scope filtering</strong></td>
            <td>Apply every supplied <code>tenantId</code> and <code>workspaceId</code> on reads and mutations. Scope handling is a security boundary.</td>
          </tr>
          <tr>
            <td><strong>Atomic operations</strong></td>
            <td>Implement <code>dedupe.check</code>, <code>rateLimits.reserve</code>, <code>digests.take</code>, and <code>scheduledSends.claim</code> atomically across workers.</td>
          </tr>
          <tr>
            <td><strong>Failure recovery</strong></td>
            <td>Digest <code>restore</code> must preserve payload order, and scheduled sends must be completed only after delivery succeeds.</td>
          </tr>
          <tr>
            <td><strong>Testing</strong></td>
            <td>Run the same behavioral scenarios as <code>memoryAdapter()</code>, including concurrency, tenant isolation, and claim/release recovery.</td>
          </tr>
        </tbody>
      </table>

      <h2>Switching adapters by environment</h2>
      <p>
        A common pattern: use memory for tests (fast, isolated, no cleanup),
        SQLite for local dev (persistent between restarts), and Postgres in
        production.
      </p>
      <Code
        code={`import { memoryAdapter } from "@notifykitjs/core"
import { drizzleSqliteAdapter } from "@notifykitjs/drizzle"
import { drizzlePostgresAdapter } from "@notifykitjs/drizzle"

function getAdapter() {
  if (process.env.NODE_ENV === "test") return memoryAdapter()
  if (process.env.DATABASE_URL) return drizzlePostgresAdapter(pgDb)
  return drizzleSqliteAdapter(sqliteDb)
}

export const notify = createNotifyKit({
  notifications: [...] as const,
  database: getAdapter(),
})`}
      />
      <div className="callout callout-tip">
        <strong>Memory keeps unit tests isolated.</strong> There is no disk I/O,
        connection pool, or teardown. Each test gets a fresh{" "}
        <code>memoryAdapter()</code> with zero state — no cleanup needed between
        runs.
      </div>

      <h2>Performance at scale</h2>
      <p>
        NotifyKit queries are straightforward — but as volume grows, certain
        access patterns become slow without proper indexing or query tuning.
        Use this table to diagnose common performance symptoms:
      </p>
      <table>
        <thead>
          <tr><th>Symptom</th><th>Likely cause</th><th>Fix</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>Inbox list slow for high-volume users</td>
            <td>Missing composite index on <code>(recipientId, archivedAt, createdAt)</code></td>
            <td>Add the index — the Drizzle adapter creates it by default, but custom adapters may not</td>
          </tr>
          <tr>
            <td><code>send()</code> latency spikes during broadcasts</td>
            <td>Connection pool exhausted — too many concurrent writes</td>
            <td>Batch with <code>Promise.allSettled</code> in chunks of 10–20, or use an external queue</td>
          </tr>
          <tr>
            <td><code>flushDigests()</code> slows as the buffer grows</td>
            <td>Large digest buffer table with no index on <code>expiresAt</code></td>
            <td>Add index on <code>(expiresAt)</code> — the flush query scans by expiry time</td>
          </tr>
          <tr>
            <td><code>unreadCount()</code> regresses as inbox history grows</td>
            <td>Table scan on <code>inbox_items</code> for users with 1000+ items</td>
            <td>The default index covers this, but verify with <code>EXPLAIN ANALYZE</code></td>
          </tr>
          <tr>
            <td>Timeline queries slow after months of data</td>
            <td>Timeline table grew unbounded — no pruning configured</td>
            <td>Run <code>pruneTimeline()</code> on a cron and set <code>timelineRetentionMs</code></td>
          </tr>
          <tr>
            <td>Preference resolution dominates send latency</td>
            <td>Multiple round-trips for global + category + notification preferences</td>
            <td>The Drizzle adapter fetches all preferences for a recipient in one query — verify your custom adapter does the same</td>
          </tr>
        </tbody>
      </table>

      <h3>Key indexes for PostgreSQL</h3>
      <p>
        The Drizzle adapter creates these automatically. If you&apos;re using a
        custom adapter, verify they exist:
      </p>
      <Code
        code={`-- Inbox queries (list by recipient, filter archived, sort by time)
CREATE INDEX idx_inbox_recipient_active
  ON notifykit_inbox_items (recipient_id, created_at DESC)
  WHERE archived_at IS NULL;

-- Delivery queries (find failures for incident investigation)
CREATE INDEX idx_deliveries_status_time
  ON notifykit_deliveries (status, created_at DESC)
  WHERE status = 'failed';

-- Timeline pruning (prune by age without full table scan)
CREATE INDEX idx_timeline_created
  ON notifykit_timeline_events (created_at);

-- Rate limit counting (sliding window lookups)
CREATE INDEX idx_rate_limits_key_time
  ON notifykit_rate_limit_events (key, created_at);`}
      />
      <div className="callout callout-tip">
        <strong>Measure before you optimize.</strong> Run{" "}
        <code>EXPLAIN ANALYZE</code> on slow queries before adding indexes.
        Establish a baseline with your data volume and alert on meaningful
        regression against that baseline.
      </div>

      <h2>Migration checklist</h2>
      <p>
        Moving from memory → production adapter? Walk through this:
      </p>
      <table>
        <thead>
          <tr><th>Step</th><th>Action</th><th>Verify</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>1</td>
            <td>Install <code>@notifykitjs/drizzle</code> + your driver</td>
            <td><code>npm ls @notifykitjs/drizzle</code> shows it installed</td>
          </tr>
          <tr>
            <td>2</td>
            <td>Run <code>createPgTables(db)</code> or generate a migration</td>
            <td>All <code>notifykit_*</code> tables exist in your database</td>
          </tr>
          <tr>
            <td>3</td>
            <td>Swap <code>memoryAdapter()</code> for the Drizzle adapter</td>
            <td>App boots without errors</td>
          </tr>
          <tr>
            <td>4</td>
            <td>Send a test notification</td>
            <td>Row appears in <code>notifykit_notifications</code></td>
          </tr>
          <tr>
            <td>5</td>
            <td>Open the inbox UI</td>
            <td>Item renders — confirms reads work too</td>
          </tr>
        </tbody>
      </table>
      <div className="callout callout-warn">
        <strong>Memory data doesn&apos;t migrate.</strong> When you switch
        adapters, all existing inbox items, preferences, and delivery records
        start fresh. Plan the switch before you have real user data — or export
        and replay via <code>upsertRecipient()</code> and preference writes.
      </div>

      <div className="page-nav">
        <Link href="/docs/production-readiness">
          <span className="page-nav-label">Previous</span>
          <span className="page-nav-title">Production readiness</span>
        </Link>
        <Link href="/docs/providers">
          <span className="page-nav-label">Next</span>
          <span className="page-nav-title">Email & webhook providers</span>
        </Link>
      </div>
    </article>
  );
}

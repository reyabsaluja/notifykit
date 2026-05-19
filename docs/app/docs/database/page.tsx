import type { Metadata } from "next";
import Link from "next/link";
import { Code } from "../../_components/code";

export const metadata: Metadata = { title: "Database adapters" };

export default function DatabasePage() {
  return (
    <article>
      <h1>Database adapters</h1>
      <p>
        NotifyKit stores all state (recipients, notifications, inbox items,
        deliveries, preferences) in your database via a pluggable adapter.
        The memory adapter is great for development; Drizzle adapters are
        available for SQLite and PostgreSQL in production.
      </p>

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

      <h2>Schema overview</h2>
      <table>
        <thead>
          <tr>
            <th>Table</th>
            <th>Purpose</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>notifykit_recipients</code></td>
            <td>Recipient profiles (email, phone, quiet hours)</td>
          </tr>
          <tr>
            <td><code>notifykit_notifications</code></td>
            <td>Notification records (one per send)</td>
          </tr>
          <tr>
            <td><code>notifykit_inbox_items</code></td>
            <td>Inbox entries with read/archive state</td>
          </tr>
          <tr>
            <td><code>notifykit_deliveries</code></td>
            <td>Delivery attempts (email, SMS, webhook)</td>
          </tr>
          <tr>
            <td><code>notifykit_preferences</code></td>
            <td>Per-recipient channel preferences</td>
          </tr>
          <tr>
            <td><code>notifykit_scheduled_sends</code></td>
            <td>Deferred sends (quiet hours)</td>
          </tr>
          <tr>
            <td><code>notifykit_rate_limit_events</code></td>
            <td>Rate limit counters</td>
          </tr>
          <tr>
            <td><code>notifykit_digest_buffers</code></td>
            <td>Digest accumulation buckets</td>
          </tr>
          <tr>
            <td><code>notifykit_timeline_events</code></td>
            <td>Debug timeline for each notification</td>
          </tr>
        </tbody>
      </table>

      <h2>Custom adapter</h2>
      <p>
        Implement the <code>DatabaseAdapter</code> interface to use any
        database. The interface has sections for recipients, notifications,
        inbox, deliveries, preferences, digests, rate limits, scheduled sends,
        dedupe, and timeline. See the{" "}
        <Link href="/docs/types">TypeScript types</Link> page for the full
        interface definition.
      </p>

      <div className="page-nav">
        <Link href="/docs/realtime">
          <span className="page-nav-label">Previous</span>
          <span className="page-nav-title">Realtime</span>
        </Link>
        <Link href="/docs/providers">
          <span className="page-nav-label">Next</span>
          <span className="page-nav-title">Email & webhook providers</span>
        </Link>
      </div>
    </article>
  );
}

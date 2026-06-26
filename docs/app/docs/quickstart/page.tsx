import type { Metadata } from "next";
import Link from "next/link";
import { Code } from "../../_components/code";

export const metadata: Metadata = { title: "Quickstart" };

export default function QuickstartPage() {
  return (
    <article>
      <h1>Quickstart</h1>
      <p>
        Get a working notification system in under 5 minutes. This guide
        uses the starter scaffold — a Next.js app with everything wired up.
      </p>

      <h2>Create the app</h2>
      <Code
        lang="bash"
        code={`npx create-notifykit-app my-app
cd my-app
cp .env.example .env.local
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# paste the output as NOTIFYKIT_SECRET in .env.local
npm install
npm run dev`}
      />
      <p>
        Open <code>http://localhost:3000</code>. The scaffold uses the
        in-memory adapter and a fake email provider — everything works
        offline.
      </p>

      <table>
        <thead>
          <tr><th>Step</th><th>Takes</th><th>You know it worked when</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><code>npx create-notifykit-app</code></td>
            <td>~10s</td>
            <td>Directory created with <code>package.json</code></td>
          </tr>
          <tr>
            <td><code>npm install</code></td>
            <td>~15s</td>
            <td>No errors in terminal, <code>node_modules</code> exists</td>
          </tr>
          <tr>
            <td><code>npm run dev</code></td>
            <td>~3s</td>
            <td>Terminal shows <code>Ready on http://localhost:3000</code></td>
          </tr>
          <tr>
            <td>Open browser</td>
            <td>Instant</td>
            <td>You see the scaffold homepage with an inbox UI and a &quot;Send test&quot; button</td>
          </tr>
        </tbody>
      </table>

      <h2>What you get</h2>
      <div className="features">
        <div className="feature-card">
          <h3>Notification definitions</h3>
          <p><code>lib/notifykit.ts</code> with typed payloads and channel configs ready to edit.</p>
        </div>
        <div className="feature-card">
          <h3>API route handler</h3>
          <p><code>/api/notifykit/[...route]</code> — inbox, preferences, and unsubscribe endpoints wired up.</p>
        </div>
        <div className="feature-card">
          <h3>Preferences UI</h3>
          <p>A settings page where users toggle channels per notification, with optimistic updates.</p>
        </div>
        <div className="feature-card">
          <h3>Realtime inbox</h3>
          <p>New notifications appear instantly. Read/unread, archive, and delete out of the box.</p>
        </div>
        <div className="feature-card">
          <h3>Signed unsubscribes</h3>
          <p>HMAC-SHA256 one-click unsubscribe links in every email. RFC 8058 compliant.</p>
        </div>
        <div className="feature-card">
          <h3>Works offline</h3>
          <p>In-memory adapter + fake email provider. No API keys, no database setup for local dev.</p>
        </div>
      </div>

      <h2>Send your first notification</h2>
      <p>
        From a server action, API route, or anywhere on the server:
      </p>
      <Code
        code={`import { notify } from "@/lib/notifykit"

await notify.upsertRecipient({
  id: user.id,
  email: user.email,
  name: user.name,
})

const result = await notify.send({
  recipientId: user.id,
  notificationId: "welcome",
  payload: { name: user.name },
})

console.log(result.inboxItems) // inbox row created
console.log(result.deliveries) // email delivery record`}
      />

      <h3>What just happened</h3>
      <p>
        That single <code>send()</code> triggered the full pipeline. Here&apos;s
        the path your notification took through the engine:
      </p>

      <div className="overview-flow">
        <div className="overview-flow-step">
          <span className="overview-flow-number">1</span>
          <div>
            <strong>Validate payload</strong>
            <p><code>{`{ name: user.name }`}</code> checked against the notification schema. Passes.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">2</span>
          <div>
            <strong>Resolve preferences</strong>
            <p>No opt-outs configured — inbox and email both allowed.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">3</span>
          <div>
            <strong>Render templates</strong>
            <p>Channel templates interpolate the payload into a title, body, and email HTML.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">4</span>
          <div>
            <strong>Deliver</strong>
            <p>Inbox row written to the database. Email handed to the provider (fake in dev).</p>
          </div>
        </div>
      </div>

      <div className="callout">
        <strong>Stages that didn&apos;t fire:</strong> dedup, rate limit, digest, and quiet hours
        are all off by default. They activate when you configure them on the notification definition.
        See the <Link href="/docs">full pipeline overview</Link> for all 10 stages.
      </div>

      <p>And here&apos;s what the result object tells you:</p>
      <table>
        <thead>
          <tr><th>Field</th><th>You&apos;ll see</th><th>It means</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><code>result.notification</code></td>
            <td>A <code>NotificationRecord</code> with an ID</td>
            <td>The send was recorded — you can look it up later via timeline</td>
          </tr>
          <tr>
            <td><code>result.inboxItems[0]</code></td>
            <td>An <code>InboxItem</code> with title, body, timestamps</td>
            <td>The inbox channel wrote a row — the React hooks will pick it up</td>
          </tr>
          <tr>
            <td><code>result.deliveries[0]</code></td>
            <td>A <code>DeliveryRecord</code> with <code>status: &quot;sent&quot;</code></td>
            <td>Email was queued and the (fake) provider confirmed delivery</td>
          </tr>
          <tr>
            <td><code>result.skipped</code></td>
            <td>Empty array <code>[]</code></td>
            <td>No channels were blocked — preferences allow everything by default</td>
          </tr>
        </tbody>
      </table>
      <div className="callout callout-tip">
        <strong>Try disabling email.</strong> Open <code>/settings/notifications</code>{" "}
        in the scaffold, uncheck email for the &quot;welcome&quot; notification,
        then send again. You&apos;ll see <code>result.skipped</code> include
        email with reason <code>&quot;preferences_disabled&quot;</code> — the
        pipeline is working.
      </div>

      <h2>Go to production</h2>
      <p>
        When you&apos;re ready to ship, swap three things:
      </p>
      <div className="overview-flow">
        <div className="overview-flow-step">
          <span className="overview-flow-number">1</span>
          <div>
            <strong>Database</strong>
            <p>Replace <code>memoryAdapter()</code> with <Link href="/docs/database">Drizzle SQLite or Postgres</Link>.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">2</span>
          <div>
            <strong>Email provider</strong>
            <p>Replace <code>fakeEmailProvider()</code> with <Link href="/docs/providers">Resend, Postmark, or your own</Link>.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">3</span>
          <div>
            <strong>Auth</strong>
            <p>Wire your real session into <code>identify()</code> in the <Link href="/docs/nextjs">route handler</Link>.</p>
          </div>
        </div>
      </div>

      <p>
        Here&apos;s the concrete diff in <code>lib/notifykit.ts</code>:
      </p>
      <Code
        code={`// BEFORE (dev — in-memory, fake email):
import {
  createNotifyKit, memoryAdapter, fakeEmailProvider, channel, notification,
} from "@notifykitjs/core"

export const notify = createNotifyKit({
  notifications: [commentMentioned] as const,
  database: memoryAdapter(),
  providers: { email: fakeEmailProvider() },
  unsubscribe: { secret: process.env.NOTIFYKIT_SECRET!, baseUrl: "http://localhost:3000/api/notifykit" },
})

// AFTER (production — Drizzle + Resend):
import { createNotifyKit, channel, notification } from "@notifykitjs/core"
import { drizzlePostgresAdapter } from "@notifykitjs/drizzle"
import { resendProvider } from "@notifykitjs/resend"
import { db } from "@/lib/db"

export const notify = createNotifyKit({
  notifications: [commentMentioned] as const,
  database: drizzlePostgresAdapter(db),
  providers: { email: resendProvider({ apiKey: process.env.RESEND_API_KEY!, from: "notifications@yourapp.com" }) },
  unsubscribe: { secret: process.env.NOTIFYKIT_SECRET!, baseUrl: "https://yourapp.com/api/notifykit" },
})`}
      />
      <table>
        <thead>
          <tr><th>What changed</th><th>Dev value</th><th>Production value</th><th>New package</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><code>database</code></td>
            <td><code>memoryAdapter()</code></td>
            <td><code>drizzlePostgresAdapter(db)</code></td>
            <td><code>@notifykitjs/drizzle</code></td>
          </tr>
          <tr>
            <td><code>providers.email</code></td>
            <td><code>fakeEmailProvider()</code></td>
            <td><code>resendProvider({`{...}`})</code></td>
            <td><code>@notifykitjs/resend</code></td>
          </tr>
          <tr>
            <td><code>unsubscribe.baseUrl</code></td>
            <td><code>http://localhost:3000/...</code></td>
            <td><code>https://yourapp.com/...</code></td>
            <td>—</td>
          </tr>
          <tr>
            <td><code>identify()</code></td>
            <td>Demo user / hardcoded</td>
            <td>Your real auth session</td>
            <td>—</td>
          </tr>
        </tbody>
      </table>
      <div className="callout callout-tip">
        <strong>That&apos;s it.</strong> No migration scripts, no config files,
        no environment matrix. The same code that worked locally works in prod
        with real providers. Notification definitions, channel templates, and
        all pipeline behavior stay identical.
      </div>

      <h2>What to try next</h2>
      <table>
        <thead>
          <tr><th>Goal</th><th>Page</th><th>What you&apos;ll learn</th></tr>
        </thead>
        <tbody>
          <tr><td>Add a second notification type</td><td><Link href="/docs/defining">Defining</Link></td><td>Payload schemas, categories, optional fields</td></tr>
          <tr><td>Let users opt out of email</td><td><Link href="/docs/preferences">Preferences</Link></td><td>Per-channel toggles, unsubscribe links</td></tr>
          <tr><td>Batch noisy events</td><td><Link href="/docs/digests">Digests</Link></td><td>Window-based coalescing with <code>render()</code></td></tr>
          <tr><td>Show a live notification bell</td><td><Link href="/docs/react">React hooks</Link></td><td><code>useInbox()</code>, realtime updates</td></tr>
          <tr><td>Understand why something was skipped</td><td><Link href="/docs/explain">Explain</Link></td><td>Dry-run a send and inspect the resolution trail</td></tr>
        </tbody>
      </table>

      <div className="page-nav">
        <Link href="/docs/installation">
          <span className="page-nav-label">Previous</span>
          <span className="page-nav-title">Installation</span>
        </Link>
        <Link href="/docs/defining">
          <span className="page-nav-label">Next</span>
          <span className="page-nav-title">Defining notifications</span>
        </Link>
      </div>
    </article>
  );
}

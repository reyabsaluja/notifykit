import type { Metadata } from "next";
import Link from "next/link";
import { Code } from "../../_components/code";

export const metadata: Metadata = { title: "API reference" };

export default function ApiPage() {
  return (
    <article>
      <h1>API reference</h1>
      <p>
        Complete reference for the <code>createNotifyKit()</code> instance.
        All methods below are available on the object returned by{" "}
        <code>createNotifyKit()</code>.
      </p>

      <table>
        <thead>
          <tr><th>Category</th><th>Methods</th></tr>
        </thead>
        <tbody>
          <tr><td><strong>Sending</strong></td><td><code>send()</code>, <code>explain()</code>, <code>check()</code></td></tr>
          <tr><td><strong>Recipients</strong></td><td><code>upsertRecipient()</code></td></tr>
          <tr><td><strong>Inbox</strong></td><td><code>inbox.list()</code>, <code>inbox.markReadForRecipient()</code>, <code>inbox.markAllRead()</code>, <code>inbox.archiveForRecipient()</code>, <code>inbox.deleteForRecipient()</code></td></tr>
          <tr><td><strong>Preferences</strong></td><td><code>preferences.list()</code>, <code>preferences.get()</code>, <code>preferences.update()</code>, <code>preferences.explain()</code></td></tr>
          <tr><td><strong>Deliveries</strong></td><td><code>deliveries.list()</code></td></tr>
          <tr><td><strong>Debugging</strong></td><td><code>timeline()</code>, <code>pruneTimeline()</code>, <code>redactPayload()</code></td></tr>
          <tr><td><strong>Lifecycle</strong></td><td><code>drain()</code>, <code>flushScheduledSends()</code>, <code>flushDigests()</code></td></tr>
        </tbody>
      </table>

      <h2>createNotifyKit(config)</h2>
      <p>
        Creates the NotifyKit instance. All options except{" "}
        <code>notifications</code> and <code>database</code> are optional:
      </p>
      <table>
        <thead>
          <tr><th>Option</th><th>Required</th><th>Purpose</th></tr>
        </thead>
        <tbody>
          <tr><td><code>notifications</code></td><td>Yes</td><td>Array of notification definitions (use <code>as const</code> for type inference)</td></tr>
          <tr><td><code>database</code></td><td>Yes</td><td>Adapter — <code>memoryAdapter()</code>, <code>drizzleSqliteAdapter()</code>, or <code>drizzlePostgresAdapter()</code></td></tr>
          <tr><td><code>providers</code></td><td>No</td><td><code>{`{ email?, sms?, webhook? }`}</code> — channel providers</td></tr>
          <tr><td><code>queue</code></td><td>No</td><td>Delivery queue — <code>inlineQueue()</code> (default) or <code>setTimeoutQueue()</code></td></tr>
          <tr><td><code>retry</code></td><td>No</td><td><code>{`{ maxAttempts, delayMs }`}</code> — retry policy for failed deliveries</td></tr>
          <tr><td><code>realtime</code></td><td>No</td><td>Realtime adapter for SSE push</td></tr>
          <tr><td><code>unsubscribe</code></td><td>No</td><td><code>{`{ secret, baseUrl }`}</code> — enables HMAC unsubscribe links</td></tr>
          <tr><td><code>defaults</code></td><td>No</td><td><code>{`{ channels }`}</code> — app-wide default channel preferences</td></tr>
          <tr><td><code>tenantDefaults</code></td><td>No</td><td><code>(tenantId) =&gt; ChannelMap | null</code> — per-tenant overrides</td></tr>
          <tr><td><code>on</code></td><td>No</td><td>Hook handlers — see <Link href="/docs/hooks">Hooks</Link></td></tr>
          <tr><td><code>idempotencyKeyTtlMs</code></td><td>No</td><td>TTL for idempotency keys (default: 24h)</td></tr>
          <tr><td><code>timelineRetentionMs</code></td><td>No</td><td>Auto-prune window for <code>pruneTimeline()</code></td></tr>
          <tr><td><code>devMode</code></td><td>No</td><td><code>true</code> to block all real sends in development</td></tr>
        </tbody>
      </table>
      <Code
        code={`import { createNotifyKit, memoryAdapter, setTimeoutQueue } from "@notifykitjs/core"

export const notify = createNotifyKit({
  notifications: [commentMentioned, orderShipped] as const,
  database: memoryAdapter(),
  providers: { email: resendProvider({ apiKey, from }) },
  queue: setTimeoutQueue(),
  retry: { maxAttempts: 5, delayMs: (n) => 1000 * 2 ** (n - 1) },
  unsubscribe: { secret: process.env.NOTIFYKIT_SECRET!, baseUrl },
  devMode: process.env.NODE_ENV !== "production",
})`}
      />

      <h2>notify.send(input)</h2>
      <p>
        Send a notification. Returns a <code>SendResult</code> with all
        outcomes. Pass <code>dryRun: true</code> to get a{" "}
        <code>DeliveryExplanation</code> instead.
      </p>
      <Code
        code={`const result = await notify.send({
  recipientId: string,
  notificationId: string,      // must match a registered definition
  payload: { ... },            // typed per notification
  tenantId?: string,
  organizationId?: string,     // alias for tenantId
  workspaceId?: string,
  idempotencyKey?: string,
  dedupeKey?: string,
  dedupeWindowMs?: number,
  dryRun?: boolean,
})`}
      />

      <h3>SendResult</h3>
      <Code
        code={`type SendResult = {
  notification: NotificationRecord | null
  inboxItems: InboxItem[]
  deliveries: DeliveryRecord[]
  skippedChannels: ChannelType[] // deprecated; use skipped[]
  skipped: SkippedDelivery[]
  deferredChannels: ChannelType[]
  digested: boolean
  rateLimited: boolean
  idempotent: boolean
}`}
      />

      <h2>notify.explain(input)</h2>
      <p>
        Dry-run a send. Same input as <code>send()</code>, returns{" "}
        <code>DeliveryExplanation</code>. No records written.
      </p>

      <h2>notify.check(input)</h2>
      <p>Alias for <code>explain()</code>.</p>

      <h2>notify.upsertRecipient(input)</h2>
      <p>
        Create or update a recipient. Fields you omit are left unchanged on
        update. Always call before the first <code>send()</code> to a new user.
      </p>
      <table>
        <thead>
          <tr><th>Field</th><th>Required</th><th>Purpose</th></tr>
        </thead>
        <tbody>
          <tr><td><code>id</code></td><td>Yes</td><td>Your user ID — used as <code>recipientId</code> in sends</td></tr>
          <tr><td><code>email</code></td><td>No</td><td>Required for email channel delivery</td></tr>
          <tr><td><code>phone</code></td><td>No</td><td>Required for SMS channel delivery</td></tr>
          <tr><td><code>name</code></td><td>No</td><td>Display name (available in templates via recipient)</td></tr>
          <tr><td><code>quietHours</code></td><td>No</td><td>Set to <code>{`{ start, end, timezone }`}</code> or <code>null</code> to clear</td></tr>
          <tr><td><code>tenantId</code></td><td>No</td><td>Scopes this recipient to a tenant</td></tr>
          <tr><td><code>workspaceId</code></td><td>No</td><td>Scopes this recipient to a workspace</td></tr>
        </tbody>
      </table>

      <h2>notify.preferences</h2>
      <table>
        <thead>
          <tr><th>Method</th><th>Parameters</th><th>Returns</th></tr>
        </thead>
        <tbody>
          <tr><td><code>.list(recipientId, scope?)</code></td><td>Recipient ID + optional tenant/workspace</td><td><code>RecipientPreference[]</code></td></tr>
          <tr><td><code>.get({`{recipientId, notificationId, ...scope}`})</code></td><td>Specific notification lookup</td><td><code>RecipientPreference | null</code></td></tr>
          <tr><td><code>.update({`{recipientId, notificationId, channels, ...scope}`})</code></td><td>Channel map like <code>{`{ email: false }`}</code></td><td><code>RecipientPreference</code></td></tr>
          <tr><td><code>.explain({`{recipientId, notificationId, ...scope}`})</code></td><td>Same as get</td><td><code>PreferenceExplanation</code> with full resolution trail</td></tr>
        </tbody>
      </table>

      <h2>notify.inbox</h2>
      <table>
        <thead>
          <tr><th>Method</th><th>Returns</th><th>Notes</th></tr>
        </thead>
        <tbody>
          <tr><td><code>.list(recipientId, scope?, filter?, limit?)</code></td><td><code>InboxItem[]</code></td><td>Filter: <code>{`{ archived?: boolean }`}</code></td></tr>
          <tr><td><code>.markReadForRecipient(itemId, recipientId, scope?)</code></td><td><code>InboxItem</code></td><td>Sets <code>readAt</code></td></tr>
          <tr><td><code>.markAllRead(recipientId, scope?)</code></td><td><code>number</code></td><td>Count of items marked</td></tr>
          <tr><td><code>.archiveForRecipient(itemId, recipientId, scope?)</code></td><td><code>InboxItem</code></td><td>Sets <code>archivedAt</code></td></tr>
          <tr><td><code>.unarchiveForRecipient(itemId, recipientId, scope?)</code></td><td><code>InboxItem</code></td><td>Clears <code>archivedAt</code></td></tr>
          <tr><td><code>.deleteForRecipient(itemId, recipientId, scope?)</code></td><td><code>void</code></td><td>Permanent — cannot undo</td></tr>
          <tr><td><code>.unreadCount(recipientId, scope?)</code></td><td><code>number</code></td><td>Count of items without <code>readAt</code></td></tr>
        </tbody>
      </table>

      <h2>notify.deliveries</h2>
      <table>
        <thead>
          <tr><th>Method</th><th>Returns</th><th>Notes</th></tr>
        </thead>
        <tbody>
          <tr><td><code>.list(recipientId?, scope?, limit?)</code></td><td><code>DeliveryRecord[]</code></td><td>All params optional — omit for global list</td></tr>
        </tbody>
      </table>

      <h2>notify.timeline</h2>
      <table>
        <thead>
          <tr><th>Method</th><th>Returns</th><th>Notes</th></tr>
        </thead>
        <tbody>
          <tr><td><code>notify.timeline(recordId)</code></td><td><code>TimelineEvent[]</code></td><td>All events for a notification send</td></tr>
          <tr><td><code>notify.timeline(recordId, {`{ deliveryId }`})</code></td><td><code>TimelineEvent[]</code></td><td>Events for a specific delivery only</td></tr>
          <tr><td><code>notify.timeline(recordId, {`{ limit }`})</code></td><td><code>TimelineEvent[]</code></td><td>Cap returned events</td></tr>
          <tr><td><code>notify.pruneTimeline(olderThan?)</code></td><td><code>number</code></td><td>Deletes old events. Uses <code>timelineRetentionMs</code> if omitted.</td></tr>
        </tbody>
      </table>

      <h2>Lifecycle methods</h2>
      <table>
        <thead>
          <tr><th>Method</th><th>When to call</th><th>Returns</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><code>notify.drain()</code></td>
            <td>Before process shutdown — waits for in-flight queue jobs</td>
            <td><code>void</code></td>
          </tr>
          <tr>
            <td><code>notify.flushScheduledSends()</code></td>
            <td>On a cron/interval — fires deferred quiet-hours sends</td>
            <td><code>SendResult[]</code></td>
          </tr>
          <tr>
            <td><code>notify.flushDigests()</code></td>
            <td>On a cron/interval — flushes expired digest buckets</td>
            <td><code>SendResult[]</code></td>
          </tr>
          <tr>
            <td><code>notify.redactPayload(notificationId, payload)</code></td>
            <td>When piping payload to external systems</td>
            <td>Payload copy with <code>redact</code> fields masked</td>
          </tr>
        </tbody>
      </table>
      <h3>Which lifecycle methods do I need?</h3>
      <table>
        <thead>
          <tr><th>Deployment</th><th><code>drain()</code></th><th><code>flushScheduledSends()</code></th><th><code>flushDigests()</code></th></tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Long-running server</strong> (Node.js, Next.js)</td>
            <td>Call on <code>SIGTERM</code></td>
            <td>Not needed — internal timers handle it</td>
            <td>Not needed — internal timers handle it</td>
          </tr>
          <tr>
            <td><strong>Serverless</strong> (Vercel, Lambda)</td>
            <td>Call before response returns</td>
            <td>Call on a cron route (e.g. every 1 min)</td>
            <td>Call on a cron route (e.g. every 1 min)</td>
          </tr>
          <tr>
            <td><strong>External queue</strong> (BullMQ, SQS)</td>
            <td>Not needed — queue manages jobs</td>
            <td>Call from a scheduled worker</td>
            <td>Call from a scheduled worker</td>
          </tr>
          <tr>
            <td><strong>Tests</strong></td>
            <td>Call in <code>afterAll()</code></td>
            <td>Call to assert deferred sends fired</td>
            <td>Call to assert digest emails rendered</td>
          </tr>
        </tbody>
      </table>
      <div className="callout callout-tip">
        <strong>With <code>setTimeoutQueue()</code></strong>, flushes happen
        automatically via internal timers. You only need to call these manually
        with external queues (BullMQ, SQS) or in serverless environments.
      </div>

      <h2>notify.notifications</h2>
      <table>
        <thead>
          <tr><th>Property</th><th>Type</th><th>Use for</th></tr>
        </thead>
        <tbody>
          <tr><td><code>notify.notifications</code></td><td><code>NotificationDefinition[]</code></td><td>Accessing full definitions (channels, payload schemas, config)</td></tr>
          <tr><td><code>notify.notificationMetadata</code></td><td><code>NotificationMeta[]</code></td><td>Driving admin UIs — safe subset with id, channels, category, description</td></tr>
        </tbody>
      </table>

      <h2>Error handling</h2>
      <p>
        NotifyKit throws specific error classes you can catch and handle.
        Provider failures during delivery are <em>not</em> thrown — they&apos;re
        captured in the result and retried. Only programming errors and
        infrastructure failures throw:
      </p>
      <table>
        <thead>
          <tr><th>Error</th><th>Thrown when</th><th>How to handle</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><code>NotifyKitValidationError</code></td>
            <td>Payload fails schema validation</td>
            <td>Fix the payload — check <code>error.fields</code> for which fields failed</td>
          </tr>
          <tr>
            <td><code>NotifyKitNotFoundError</code></td>
            <td>Recipient doesn&apos;t exist in the database</td>
            <td>Call <code>upsertRecipient()</code> before <code>send()</code></td>
          </tr>
          <tr>
            <td><code>NotifyKitConfigError</code></td>
            <td>Invalid config at startup (missing adapter, bad notification def)</td>
            <td>Fix configuration — this is a fatal startup error</td>
          </tr>
          <tr>
            <td><code>DatabaseError</code></td>
            <td>Underlying database operation failed (connection lost, constraint violation)</td>
            <td>Retry the operation or check database connectivity</td>
          </tr>
        </tbody>
      </table>
      <Code
        code={`import { NotifyKitValidationError, NotifyKitNotFoundError } from "@notifykitjs/core"

try {
  const result = await notify.send({
    recipientId: userId,
    notificationId: "comment_mentioned",
    payload: data,
  })
  // result.deliveries may contain failed deliveries — those are NOT errors
  // They were attempted, retried, and captured in the result
} catch (err) {
  if (err instanceof NotifyKitValidationError) {
    // Payload was wrong — log which fields and fix upstream
    console.error("Bad payload:", err.fields)
  } else if (err instanceof NotifyKitNotFoundError) {
    // Recipient doesn't exist yet — create them and retry
    await notify.upsertRecipient({ id: userId, email: userEmail })
    await notify.send({ ... })
  } else {
    // Infrastructure error (DB down, connection refused)
    throw err
  }
}`}
      />
      <div className="overview-flow">
        <div className="overview-flow-step">
          <span className="overview-flow-number">!</span>
          <div>
            <strong>Throws (programming/infra error)</strong>
            <p>Bad payload, missing recipient, DB failure. You must fix the root cause.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">&crarr;</span>
          <div>
            <strong>Returns in result (delivery failure)</strong>
            <p>Provider timeout, 500 from Resend, network blip. Retried automatically. Check <code>result.deliveries</code>.</p>
          </div>
        </div>
      </div>
      <div className="callout callout-tip">
        <strong>Provider failures don&apos;t throw.</strong> If Resend returns a
        500, the delivery is retried per your <code>retry</code> config. After
        all attempts fail, it shows up in <code>result.deliveries</code> with{" "}
        <code>status: &quot;failed&quot;</code> and fires the{" "}
        <code>delivery.failed</code> hook. Your <code>send()</code> call itself
        never rejects because of a provider error.
      </div>

      <h2>Common workflows</h2>
      <p>
        Individual methods are documented above. Here&apos;s how they compose
        for the tasks you&apos;ll actually build:
      </p>

      <h3>Onboard a new user</h3>
      <Code
        code={`// 1. Create the recipient (idempotent — safe to call on every login)
await notify.upsertRecipient({
  id: user.id,
  email: user.email,
  name: user.name,
  tenantId: user.orgId,
})

// 2. Set their default preferences (optional — skip if you want all-on)
await notify.preferences.update({
  recipientId: user.id,
  notificationId: "marketing_digest",
  channels: { email: false },
  tenantId: user.orgId,
})

// 3. Send the welcome notification
const result = await notify.send({
  recipientId: user.id,
  notificationId: "welcome",
  payload: { name: user.name },
  tenantId: user.orgId,
})`}
      />

      <h3>Diagnose a failed delivery</h3>
      <Code
        code={`// Support ticket: "user didn't get the email"
const recipientId = "user_abc"

// 1. Find recent deliveries for this user
const deliveries = await notify.deliveries.list(recipientId)
const failed = deliveries.filter(d => d.status === "failed" || d.status === "skipped")

// 2. Check the timeline for the specific send
if (failed.length > 0) {
  const events = await notify.timeline(failed[0].notificationRecordId)
  // events show: created → channel_evaluated → delivery_attempted → failed (with error)
}

// 3. Dry-run the same send to see what would happen now
const explanation = await notify.explain({
  recipientId,
  notificationId: "comment_mentioned",
  payload: { actorName: "Test", postTitle: "Test", postUrl: "#" },
})
// explanation shows current preferences, quiet hours, provider state`}
      />

      <h3>Build a notification preferences UI</h3>
      <Code
        code={`// Server: fetch everything the preferences page needs
async function getPreferencesPageData(recipientId: string, tenantId: string) {
  const [prefs, metadata] = await Promise.all([
    notify.preferences.list(recipientId, { tenantId }),
    notify.notificationMetadata,  // safe subset: id, description, category, channels
  ])

  // Group by category for the UI
  const grouped = Object.groupBy(metadata, m => m.category ?? "general")

  // Merge saved preferences with available notifications
  return Object.entries(grouped).map(([category, notifications]) => ({
    category,
    notifications: notifications!.map(n => ({
      id: n.id,
      description: n.description,
      channels: n.channels,
      preferences: prefs.find(p => p.notificationId === n.id)?.channels ?? {},
    })),
  }))
}`}
      />

      <h3>Graceful shutdown (serverless / edge)</h3>
      <Code
        code={`// In serverless: flush pending work before the function dies
export async function handler(req: Request) {
  const result = await notify.send({ ... })

  // Flush deferred sends (quiet hours) and digests before shutdown
  await Promise.all([
    notify.flushScheduledSends(),
    notify.flushDigests(),
  ])

  // Wait for any in-flight queue jobs to complete
  await notify.drain()

  return Response.json(result)
}`}
      />

      <table>
        <thead>
          <tr><th>Task</th><th>Methods used</th><th>Order matters?</th></tr>
        </thead>
        <tbody>
          <tr><td>Onboard user</td><td><code>upsertRecipient</code> → <code>preferences.update</code> → <code>send</code></td><td>Yes — recipient must exist before send</td></tr>
          <tr><td>Debug failed send</td><td><code>deliveries.list</code> → <code>timeline</code> → <code>explain</code></td><td>No — each gives independent context</td></tr>
          <tr><td>Preferences UI</td><td><code>preferences.list</code> + <code>notificationMetadata</code></td><td>No — fetch in parallel</td></tr>
          <tr><td>Clean shutdown</td><td><code>flushScheduledSends</code> + <code>flushDigests</code> → <code>drain</code></td><td>Flush before drain</td></tr>
        </tbody>
      </table>

      <div className="callout callout-tip">
        <strong>Use <code>explain()</code> liberally in development.</strong> It&apos;s
        a zero-side-effect dry run that shows exactly what would happen — which
        channels fire, which get skipped and why, and how preferences resolve. Wire
        it into your admin panel or support tooling.
      </div>

      <div className="page-nav">
        <Link href="/docs/hooks">
          <span className="page-nav-label">Previous</span>
          <span className="page-nav-title">Hooks & observability</span>
        </Link>
        <Link href="/docs/types">
          <span className="page-nav-label">Next</span>
          <span className="page-nav-title">TypeScript types</span>
        </Link>
      </div>
    </article>
  );
}

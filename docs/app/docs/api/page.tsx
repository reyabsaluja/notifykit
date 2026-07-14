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

      <div className="features">
        <div className="feature-card">
          <h3>Sending</h3>
          <p>send(), explain(), and check() — deliver notifications or dry-run the pipeline without side effects.</p>
        </div>
        <div className="feature-card">
          <h3>State management</h3>
          <p>Inbox, preferences, and recipient APIs — read and write user-facing notification state.</p>
        </div>
        <div className="feature-card">
          <h3>Debugging</h3>
          <p>timeline() and redactPayload() — forensic event logs and PII-safe payload inspection.</p>
        </div>
        <div className="feature-card">
          <h3>Lifecycle</h3>
          <p>drain(), flushScheduledSends(), and flushDigests() — graceful shutdown and scheduled delivery.</p>
        </div>
      </div>

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
        filename="lib/notifykit.ts"
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
        Dry-run a send with zero side effects — no records written, no emails
        sent. Returns a <code>DeliveryExplanation</code> showing exactly what
        <em>would</em> happen if this were a real <code>send()</code>. Same
        input shape as <code>send()</code>.
      </p>
      <table>
        <thead>
          <tr><th>Return field</th><th>Type</th><th>What it tells you</th></tr>
        </thead>
        <tbody>
          <tr><td><code>channels</code></td><td><code>Record&lt;string, ChannelExplanation&gt;</code></td><td>Per-channel outcome: <code>would_deliver</code>, <code>skipped</code> (with reason), or <code>deferred</code></td></tr>
          <tr><td><code>preferences</code></td><td><code>PreferenceResolution</code></td><td>Full resolution trail — global defaults → tenant → category → notification → recipient override</td></tr>
          <tr><td><code>wouldDeduplicate</code></td><td><code>boolean</code></td><td>Whether the dedup key has been seen within its window</td></tr>
          <tr><td><code>wouldRateLimit</code></td><td><code>boolean</code></td><td>Whether the send would exceed the rate limit threshold</td></tr>
          <tr><td><code>wouldDigest</code></td><td><code>boolean</code></td><td>Whether the send would enter a digest buffer instead of delivering immediately</td></tr>
          <tr><td><code>quietHours</code></td><td><code>{`{ active, resumesAt? }`}</code></td><td>Whether the recipient is in quiet hours and when push channels would fire</td></tr>
          <tr><td><code>recipient</code></td><td><code>Recipient | null</code></td><td>The resolved recipient record (or null if not found)</td></tr>
        </tbody>
      </table>
      <Code
        code={`const explanation = await notify.explain({
  recipientId: "user_123",
  notificationId: "comment_mentioned",
  payload: { actorName: "Rey", postUrl: "/posts/42" },
})

// Check why email didn't fire:
console.log(explanation.channels.email)
// → { outcome: "skipped", reason: "preferences_disabled" }

// Check the full preference trail:
console.log(explanation.preferences)
// → { global: { email: true }, recipient: { email: false }, resolved: { email: false } }

// Check pipeline stages:
console.log(explanation.wouldRateLimit)  // false
console.log(explanation.quietHours)      // { active: true, resumesAt: "2026-06-28T08:00:00Z" }`}
      />
      <div className="callout callout-tip">
        <strong>Wire explain() into your admin panel.</strong> Support teams can
        paste a user ID and notification ID to see exactly why a notification
        would or wouldn&apos;t deliver — without triggering any actual send.
      </div>

      <h2>notify.check(input)</h2>
      <p>Alias for <code>explain()</code>. Identical behavior and return type.</p>

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
        filename="lib/send-notification.ts"
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
      <div className="features">
        <div className="feature-card">
          <h3>Throws (programming/infra error)</h3>
          <p>Bad payload, missing recipient, DB failure. You must fix the root cause.</p>
        </div>
        <div className="feature-card">
          <h3>Returns in result (delivery failure)</h3>
          <p>Provider timeout, 500 from Resend, network blip. Retried automatically. Check <code>result.deliveries</code>.</p>
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
        filename="lib/onboard-user.ts"
        code={`// Create the recipient (idempotent — safe to call on every login)
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

      <h3>Deactivate a user</h3>
      <Code
        filename="lib/deactivate-user.ts"
        code={`const recipientId = user.id
const tenantId = user.orgId

// 1. Drain any in-flight sends so nothing new arrives mid-cleanup
await notify.drain()

// 2. Clear their inbox (iterate and delete)
const items = await notify.inbox.list(recipientId, { tenantId })
await Promise.all(
  items.map(item => notify.inbox.deleteForRecipient(item.id, recipientId, { tenantId }))
)

// 3. Opt them out of all channels to prevent future sends
//    (belt-and-suspenders — even if your app stops calling send() for this user,
//    scheduled digests or queued sends might still fire)
const metadata = notify.notificationMetadata
await Promise.all(
  metadata.map(n =>
    notify.preferences.update({
      recipientId,
      notificationId: n.id,
      channels: { email: false, sms: false, inbox: false, webhook: false },
      tenantId,
    })
  )
)

// 4. Prune their timeline data (GDPR / data minimization)
await notify.pruneTimeline(0)  // 0ms = prune everything`}
      />
      <div className="callout callout-warn">
        <strong>Order matters.</strong> Call <code>drain()</code> first — otherwise
        a queued send could deliver between steps 2 and 3, creating a new inbox
        item for a &quot;deleted&quot; user. If you only need soft-delete (user
        might return), skip steps 2 and 4 and just opt them out.
      </div>

      <h3>Diagnose a failed delivery</h3>
      <Code
        filename="scripts/diagnose-delivery.ts"
        code={`const recipientId = "user_abc"

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
        filename="app/settings/notifications/page.tsx"
        code={`async function getPreferencesPageData(recipientId: string, tenantId: string) {
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
        filename="app/api/send/route.ts"
        code={`export async function handler(req: Request) {
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
          <tr><td>Deactivate user</td><td><code>drain</code> → <code>inbox.deleteForRecipient</code> → <code>preferences.update</code> → <code>pruneTimeline</code></td><td>Yes — drain first to prevent race</td></tr>
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

      <h2>Cheat sheet</h2>
      <p>
        Every method on a single screen. Copy the signature, fill in your
        values. Grouped by what you&apos;re trying to do:
      </p>
      <Code
        code={`// ─── Send ────────────────────────────────────────────────────────────
await notify.send({ recipientId, notificationId, payload })
await notify.send({ recipientId, notificationId, payload, tenantId, idempotencyKey, dedupeKey, dedupeWindowMs })
await notify.send({ recipientId, notificationId, payload, dryRun: true })  // → DeliveryExplanation
await notify.explain({ recipientId, notificationId, payload })             // same as dryRun: true

// ─── Recipients ──────────────────────────────────────────────────────
await notify.upsertRecipient({ id, email?, phone?, name?, tenantId?, quietHours? })

// ─── Inbox (server-side) ─────────────────────────────────────────────
await notify.inbox.list(recipientId, { tenantId }?, { archived }?, limit?)
await notify.inbox.unreadCount(recipientId, { tenantId }?)
await notify.inbox.markReadForRecipient(itemId, recipientId, { tenantId }?)
await notify.inbox.markAllRead(recipientId, { tenantId }?)
await notify.inbox.archiveForRecipient(itemId, recipientId, { tenantId }?)
await notify.inbox.unarchiveForRecipient(itemId, recipientId, { tenantId }?)
await notify.inbox.deleteForRecipient(itemId, recipientId, { tenantId }?)

// ─── Preferences ─────────────────────────────────────────────────────
await notify.preferences.list(recipientId, { tenantId }?)
await notify.preferences.get({ recipientId, notificationId, tenantId? })
await notify.preferences.update({ recipientId, notificationId, channels: { email: false }, tenantId? })
await notify.preferences.explain({ recipientId, notificationId, tenantId? })

// ─── Debugging ───────────────────────────────────────────────────────
await notify.timeline(notificationRecordId)
await notify.timeline(notificationRecordId, { deliveryId })
await notify.deliveries.list(recipientId?, { tenantId }?, limit?)
await notify.pruneTimeline(olderThan?)
notify.redactPayload(notificationId, payload)

// ─── Lifecycle ───────────────────────────────────────────────────────
await notify.drain()                 // wait for in-flight jobs
await notify.flushScheduledSends()   // fire deferred quiet-hours sends
await notify.flushDigests()          // flush expired digest buckets

// ─── Instance properties ─────────────────────────────────────────────
notify.notifications                 // NotificationDefinition[]
notify.notificationMetadata          // NotificationMeta[] (safe for client)`}
      />
      <table>
        <thead>
          <tr><th>I want to...</th><th>Method</th><th>Returns</th></tr>
        </thead>
        <tbody>
          <tr><td>Send a notification</td><td><code>send()</code></td><td><code>SendResult</code></td></tr>
          <tr><td>Preview what would happen</td><td><code>explain()</code></td><td><code>DeliveryExplanation</code></td></tr>
          <tr><td>Create/update a user</td><td><code>upsertRecipient()</code></td><td><code>Recipient</code></td></tr>
          <tr><td>Read a user&apos;s inbox</td><td><code>inbox.list()</code></td><td><code>InboxItem[]</code></td></tr>
          <tr><td>Get unread badge count</td><td><code>inbox.unreadCount()</code></td><td><code>number</code></td></tr>
          <tr><td>See why a send was skipped</td><td><code>timeline()</code></td><td><code>TimelineEvent[]</code></td></tr>
          <tr><td>Check a user&apos;s opt-outs</td><td><code>preferences.list()</code></td><td><code>RecipientPreference[]</code></td></tr>
          <tr><td>See which layer blocked a channel</td><td><code>preferences.explain()</code></td><td><code>PreferenceExplanation</code></td></tr>
          <tr><td>Opt a user out of a channel</td><td><code>preferences.update()</code></td><td><code>RecipientPreference</code></td></tr>
          <tr><td>Find failed deliveries</td><td><code>deliveries.list()</code></td><td><code>DeliveryRecord[]</code></td></tr>
          <tr><td>Clean up old debug data</td><td><code>pruneTimeline()</code></td><td><code>number</code> (deleted count)</td></tr>
          <tr><td>Shut down cleanly</td><td><code>drain()</code></td><td><code>void</code></td></tr>
        </tbody>
      </table>
      <div className="callout callout-tip">
        <strong>Bookmark this section.</strong> The cheat sheet has every method
        in one block — use it as a quick reminder when you know the method name
        but need the exact parameter order. For detailed behavior, scroll to the
        full section above or check the linked docs page.
      </div>

      <div className="button-row">
        <Link href="/docs/types" className="primary">TypeScript types</Link>
        <Link href="/docs/explain">Explain &amp; dry run</Link>
        <Link href="/docs/timeline">Timeline debugging</Link>
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

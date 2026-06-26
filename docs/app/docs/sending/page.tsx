import type { Metadata } from "next";
import Link from "next/link";
import { Code } from "../../_components/code";

export const metadata: Metadata = { title: "Sending" };

export default function SendingPage() {
  return (
    <article>
      <h1>Sending notifications</h1>
      <p>
        <code>notify.send()</code> is the one call you&apos;ll make from your
        application code. It&apos;s fully typed against the notifications you
        registered with <code>createNotifyKit()</code>.
      </p>

      <p>Under the hood, every send walks through this pipeline:</p>
      <div className="overview-flow">
        <div className="overview-flow-step">
          <span className="overview-flow-number">1</span>
          <div>
            <strong>Validate</strong>
            <p>Payload schema check, idempotency check, dedup check, rate limit check.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">2</span>
          <div>
            <strong>Resolve</strong>
            <p>Look up recipient, resolve preferences per channel, check quiet hours.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">3</span>
          <div>
            <strong>Deliver</strong>
            <p>Write inbox items, queue email/SMS/webhook deliveries, fire hooks, return result.</p>
          </div>
        </div>
      </div>

      <h2>Basic send</h2>
      <Code
        code={`await notify.upsertRecipient({
  id: user.id,
  email: user.email,
  name: user.name,
})

const result = await notify.send({
  recipientId: user.id,
  notificationId: "comment_mentioned",
  payload: {
    actorName: "Rey",
    postTitle: "Launch Plan",
    postUrl: "/posts/42",
  },
})`}
      />

      <h2>Send options at a glance</h2>
      <p>
        Beyond <code>recipientId</code>, <code>notificationId</code>, and{" "}
        <code>payload</code>, these optional fields control pipeline behavior:
      </p>
      <table>
        <thead>
          <tr><th>Option</th><th>What it does</th><th>When to add it</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><code>tenantId</code></td>
            <td>Scopes the send to an organization</td>
            <td>Multi-tenant apps — ensures tenant-level preferences apply</td>
          </tr>
          <tr>
            <td><code>idempotencyKey</code></td>
            <td>Returns the original result on duplicate calls</td>
            <td>Retryable triggers (webhooks, queue jobs) — prevents double-sends</td>
          </tr>
          <tr>
            <td><code>dedupeKey</code></td>
            <td>Skips if the same key was seen within the window</td>
            <td>Noisy events (edits, reactions) — collapses rapid duplicates</td>
          </tr>
          <tr>
            <td><code>dedupeWindowMs</code></td>
            <td>Duration the dedup key is remembered</td>
            <td>Pair with <code>dedupeKey</code> — defaults to 5 minutes</td>
          </tr>
          <tr>
            <td><code>dryRun</code></td>
            <td>Returns a <code>DeliveryExplanation</code> without writing anything</td>
            <td>Debugging — see what <em>would</em> happen for a given input</td>
          </tr>
        </tbody>
      </table>
      <div className="callout">
        <strong>Rule of thumb:</strong> if the caller can retry, add{" "}
        <code>idempotencyKey</code>. If the <em>user</em> can trigger the same
        logical event repeatedly, add <code>dedupeKey</code>. They solve
        different problems — use both when both apply.
      </div>

      <h2>SendResult</h2>
      <p>
        The result tells you exactly what happened — use it for logging,
        analytics, or conditional follow-up logic:
      </p>
      <table>
        <thead>
          <tr><th>Field</th><th>Type</th><th>Meaning</th></tr>
        </thead>
        <tbody>
          <tr><td><code>notification</code></td><td><code>NotificationRecord | null</code></td><td>The created record, or <code>null</code> if digested</td></tr>
          <tr><td><code>inboxItems</code></td><td><code>InboxItem[]</code></td><td>Inbox rows written to the database</td></tr>
          <tr><td><code>deliveries</code></td><td><code>DeliveryRecord[]</code></td><td>All delivery attempts including failures</td></tr>
          <tr><td><code>skipped</code></td><td><code>SkippedDelivery[]</code></td><td>Channels skipped with reasons (preference opt-out, missing destination)</td></tr>
          <tr><td><code>deferredChannels</code></td><td><code>ChannelType[]</code></td><td>Channels held back by quiet hours</td></tr>
          <tr><td><code>digested</code></td><td><code>boolean</code></td><td>Send was buffered into a digest window</td></tr>
          <tr><td><code>rateLimited</code></td><td><code>boolean</code></td><td>Send was dropped by a rate limit</td></tr>
          <tr><td><code>idempotent</code></td><td><code>boolean</code></td><td>Duplicate send — idempotency key already seen</td></tr>
        </tbody>
      </table>

      <div className="callout callout-tip">
        <strong>Common pattern.</strong> Check <code>result.rateLimited</code> or{" "}
        <code>result.digested</code> before showing success toasts — the user
        may not actually receive anything immediately.
      </div>

      <h2>Type safety</h2>
      <p>These fail at <em>compile time</em>, not at runtime:</p>
      <Code
        code={`// ❌ Unknown notification id
await notify.send({
  recipientId: "u_1",
  notificationId: "wrong_id",  // TS error: not assignable
  payload: {},
})

// ❌ Wrong payload shape
await notify.send({
  recipientId: "u_1",
  notificationId: "comment_mentioned",
  payload: { actorName: 42 },  // TS error: number is not string
})`}
      />

      <h2>Inline vs async queue</h2>
      <table>
        <thead>
          <tr><th>Mode</th><th>Behavior</th><th>Best for</th></tr>
        </thead>
        <tbody>
          <tr><td><code>inlineQueue()</code> (default)</td><td><code>send()</code> awaits provider calls</td><td>Simple apps, scripts, testing</td></tr>
          <tr><td><code>setTimeoutQueue()</code></td><td><code>send()</code> returns immediately, deliveries run async</td><td>Web servers where response time matters</td></tr>
          <tr><td>Custom (<code>Queue</code> interface)</td><td>You control when workers run</td><td>BullMQ, SQS, Cloudflare Queues</td></tr>
        </tbody>
      </table>
      <p>
        Swap in <code>setTimeoutQueue()</code> to return instantly and run
        deliveries in the background:
      </p>
      <Code
        code={`import { setTimeoutQueue } from "@notifykitjs/core"

const notify = createNotifyKit({
  // ...
  queue: setTimeoutQueue(),
  retry: { maxAttempts: 5, delayMs: (n) => 500 * 2 ** (n - 1) },
})

// Wait for in-flight jobs before shutdown:
await notify.drain()`}
      />

      <h2>Event hooks</h2>
      <p>
        Every interesting moment fires a hook. See{" "}
        <Link href="/docs/hooks">Hooks &amp; observability</Link> for the
        full list.
      </p>
      <Code
        code={`createNotifyKit({
  // ...
  on: {
    "notification.created": ({ notification }) =>
      metrics.inc("notifications.created"),
    "delivery.sent": ({ delivery }) =>
      metrics.inc("delivery.sent", { channel: delivery.channel }),
    "delivery.failed": ({ delivery, error }) =>
      sentry.captureException(error),
  },
})`}
      />

      <h2>Quiet hours</h2>
      <div className="callout">
        <strong>Push channels defer, inbox delivers immediately.</strong>{" "}
        When a recipient is in their quiet window, email/SMS/webhook are
        scheduled for the window&apos;s end. The inbox item still writes
        instantly. See <Link href="/docs/quiet-hours">Quiet hours</Link>{" "}
        for setup and flushing details.
      </div>

      <h2>Checking results</h2>
      <p>
        After every send, check the result to understand what actually happened:
      </p>
      <table>
        <thead>
          <tr><th>Check</th><th>What it means</th><th>Common action</th></tr>
        </thead>
        <tbody>
          <tr><td><code>result.digested</code></td><td>Buffered into a digest — no immediate delivery</td><td>Don&apos;t show a &quot;sent!&quot; toast</td></tr>
          <tr><td><code>result.rateLimited</code></td><td>Dropped by rate limit — permanently gone</td><td>Log for monitoring</td></tr>
          <tr><td><code>result.idempotent</code></td><td>Duplicate — original result returned</td><td>Safe to ignore</td></tr>
          <tr><td><code>result.skipped.length &gt; 0</code></td><td>Some channels were skipped</td><td>Check <code>.reason</code> for debugging</td></tr>
          <tr><td><code>result.deferredChannels.length &gt; 0</code></td><td>Held by quiet hours</td><td>Will deliver when window ends</td></tr>
        </tbody>
      </table>

      <h2>Where to call send()</h2>
      <p>
        <code>send()</code> is server-only — call it anywhere you have access to
        your NotifyKit instance. Use this decision flow to pick the right pattern
        for your context:
      </p>

      <div className="overview-flow">
        <div className="overview-flow-step">
          <span className="overview-flow-number">?</span>
          <div>
            <strong>Can your trigger retry?</strong>
            <p>Webhooks, queue jobs, and cron tasks can fire multiple times. If yes → add an <code>idempotencyKey</code>.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">?</span>
          <div>
            <strong>Does the user&apos;s response time depend on delivery?</strong>
            <p>In server actions and API routes, the user waits. If the send is non-critical → use <code>void notify.send()</code> with <code>setTimeoutQueue()</code>.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">?</span>
          <div>
            <strong>Can the same logical event fire many times?</strong>
            <p>Multiple edits to the same comment, repeated likes. If yes → add a <code>dedupeKey</code> scoped to the entity.</p>
          </div>
        </div>
      </div>

      <table>
        <thead>
          <tr><th>Context</th><th>Example</th><th>Await?</th><th>Key to use</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Server action</strong></td>
            <td>User posts a comment → notify mentioned users</td>
            <td>No — <code>void send()</code></td>
            <td><code>dedupeKey</code> (same mention in same post)</td>
          </tr>
          <tr>
            <td><strong>API route (incoming webhook)</strong></td>
            <td>Stripe webhook → notify user of payment</td>
            <td>Yes — confirm delivery for webhook ack</td>
            <td><code>idempotencyKey</code> (webhook can retry)</td>
          </tr>
          <tr>
            <td><strong>Background job</strong></td>
            <td>Order ships → notify customer with tracking</td>
            <td>Yes — job has no response deadline</td>
            <td><code>idempotencyKey</code> (job can retry)</td>
          </tr>
          <tr>
            <td><strong>Cron / scheduled</strong></td>
            <td>Daily digest → batch notify all users</td>
            <td>Yes — sequential within the batch</td>
            <td><code>dedupeKey</code> with date (prevents double-send)</td>
          </tr>
        </tbody>
      </table>
      <Code
        code={`// Server action — fire-and-forget after a mutation
"use server"
import { notify } from "@/lib/notifykit"

export async function addComment(postId: string, body: string) {
  const comment = await db.comments.create({ postId, body, authorId: session.userId })
  const mentions = extractMentions(body)

  // Don't await — let notifications happen asynchronously
  for (const userId of mentions) {
    void notify.send({
      recipientId: userId,
      notificationId: "comment_mentioned",
      payload: { actorName: session.userName, postTitle: comment.postTitle, postUrl: \`/posts/\${postId}\` },
      dedupeKey: \`mention:\${postId}:\${session.userId}\`,
      dedupeWindowMs: 5 * 60_000,
    })
  }

  return comment
}`}
      />
      <div className="callout">
        <strong>Don&apos;t await in hot paths.</strong> When sending from
        a server action or API handler where response time matters, use{" "}
        <code>void notify.send()</code> with <code>setTimeoutQueue()</code> —
        the user gets their response immediately and delivery happens in the
        background.
      </div>

      <h2>Sending to multiple recipients</h2>
      <p>
        <code>send()</code> targets one recipient at a time — to broadcast,
        loop over your recipient list. Each send resolves independently
        (its own preferences, quiet hours, rate limits).
      </p>
      <Code
        code={`// Notify all team members when a project ships
const members = await db.teamMembers.findMany({ where: { teamId } })

const results = await Promise.allSettled(
  members
    .filter(m => m.userId !== actor.id) // don't notify the person who did it
    .map(m =>
      notify.send({
        recipientId: m.userId,
        notificationId: "project_shipped",
        payload: { projectName, actorName: actor.name },
        idempotencyKey: \`shipped:\${projectId}:\${m.userId}\`,
      })
    )
)

const failed = results.filter(r => r.status === "rejected")
if (failed.length) logger.warn(\`\${failed.length} sends failed\`, { projectId })`}
      />
      <table>
        <thead>
          <tr><th>Pattern</th><th>When to use</th><th>Trade-off</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><code>Promise.allSettled()</code></td>
            <td>Broadcast to a team or followers (10-100 recipients)</td>
            <td>One failure doesn&apos;t block the rest. Inspect results to log failures.</td>
          </tr>
          <tr>
            <td>Sequential <code>for...of</code></td>
            <td>Ordered sends or very large lists (1000+)</td>
            <td>Slower, but avoids connection pool exhaustion. Add a small delay between batches.</td>
          </tr>
          <tr>
            <td>Background job per recipient</td>
            <td>Async fan-out from a queue (BullMQ, SQS)</td>
            <td>Best for scale — each send retries independently. Requires queue infrastructure.</td>
          </tr>
        </tbody>
      </table>
      <div className="callout callout-warn">
        <strong>Always use <code>idempotencyKey</code> for broadcasts.</strong>{" "}
        If your trigger retries (webhook, queue job), each recipient gets a
        unique key so duplicates are safely skipped. Format:{" "}
        <code>{`\`event:\${eventId}:\${recipientId}\``}</code>.
      </div>

      <h2>Error recovery</h2>
      <p>
        <code>send()</code> itself only throws for programming errors (bad
        payload, missing recipient). Provider failures are captured in the
        result and retried automatically. But bulk operations introduce a
        third category: partial failures at the orchestration layer.
      </p>
      <div className="overview-flow">
        <div className="overview-flow-step">
          <span className="overview-flow-number">1</span>
          <div>
            <strong>Detect partial failure</strong>
            <p>After a broadcast, check which sends rejected. Log recipient IDs and the error.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">2</span>
          <div>
            <strong>Decide: retry or dead-letter</strong>
            <p>Transient errors (DB timeout, connection reset) → retry. Permanent errors (missing recipient) → dead-letter.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">3</span>
          <div>
            <strong>Alert if failure rate spikes</strong>
            <p>A handful of failures is normal. 20%+ failure rate across a broadcast means something systemic.</p>
          </div>
        </div>
      </div>
      <Code
        code={`// Robust broadcast with error classification
async function broadcastWithRecovery(recipientIds: string[], notification: SendInput) {
  const results = await Promise.allSettled(
    recipientIds.map(id =>
      notify.send({ ...notification, recipientId: id, idempotencyKey: \`\${notification.idempotencyKey}:\${id}\` })
    )
  )

  const succeeded = results.filter(r => r.status === "fulfilled")
  const failed = results
    .map((r, i) => ({ result: r, recipientId: recipientIds[i] }))
    .filter(({ result }) => result.status === "rejected")

  // Classify failures
  const retryable = failed.filter(({ result }) =>
    result.status === "rejected" && isTransient(result.reason)
  )
  const deadLettered = failed.filter(({ result }) =>
    result.status === "rejected" && !isTransient(result.reason)
  )

  // Log and alert
  if (failed.length > 0) {
    logger.warn("Broadcast partial failure", {
      total: recipientIds.length,
      succeeded: succeeded.length,
      retryable: retryable.length,
      deadLettered: deadLettered.length,
    })
  }

  // Alert on high failure rate
  const failureRate = failed.length / recipientIds.length
  if (failureRate > 0.2) {
    await alertOncall("Broadcast failure rate >20%", { failureRate, notification })
  }

  // Retry transient failures (once, with backoff)
  if (retryable.length > 0) {
    await delay(2000)
    await Promise.allSettled(
      retryable.map(({ recipientId }) =>
        notify.send({ ...notification, recipientId, idempotencyKey: \`\${notification.idempotencyKey}:\${recipientId}\` })
      )
    )
  }

  return { succeeded: succeeded.length, failed: failed.length, retried: retryable.length }
}

function isTransient(error: unknown): boolean {
  const message = error instanceof Error ? error.message : ""
  return message.includes("timeout") || message.includes("ECONNRESET") || message.includes("503")
}`}
      />
      <table>
        <thead>
          <tr><th>Failure type</th><th>Examples</th><th>Strategy</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Transient</strong></td>
            <td>DB timeout, connection reset, 503 from dependency</td>
            <td>Retry once after delay. If still failing, dead-letter and alert.</td>
          </tr>
          <tr>
            <td><strong>Permanent</strong></td>
            <td>Recipient not found, validation error, missing provider</td>
            <td>Dead-letter immediately. These won&apos;t succeed on retry.</td>
          </tr>
          <tr>
            <td><strong>Systemic</strong></td>
            <td>&gt;20% failure rate in a single broadcast</td>
            <td>Alert oncall. Likely a DB outage or misconfiguration, not per-recipient.</td>
          </tr>
        </tbody>
      </table>
      <div className="callout callout-tip">
        <strong>Idempotency keys make retries safe.</strong> Because every
        recipient gets a unique key (<code>event:recipient</code>), retrying the
        entire broadcast is safe — recipients who already succeeded get a
        no-op replay, and only the failed ones are re-attempted.
      </div>

      <h2>Testing sends</h2>
      <p>
        Verify your application sends the right notifications without actually
        delivering them. Use the memory adapter and fake providers to assert
        on what <em>would</em> have been sent:
      </p>
      <Code
        code={`import { createNotifyKit, memoryAdapter, fakeEmailProvider } from "@notifykitjs/core"
import { commentMentioned } from "@/lib/notifications"
import { addComment } from "@/app/actions/comments"

const testNotify = createNotifyKit({
  notifications: [commentMentioned] as const,
  database: memoryAdapter(),
  providers: { email: fakeEmailProvider() },
})

// Inject the test instance into your action (DI or module mock)
vi.mock("@/lib/notifykit", () => ({ notify: testNotify }))

describe("addComment", () => {
  beforeEach(async () => {
    await testNotify.upsertRecipient({ id: "alice", email: "alice@test.com" })
  })

  it("sends a mention notification to tagged users", async () => {
    await addComment("post_1", "Hey @alice check this out")

    const result = await testNotify.getLastSendResult()
    expect(result.notification?.notificationId).toBe("comment_mentioned")
    expect(result.inboxItems).toHaveLength(1)
    expect(result.inboxItems[0].recipientId).toBe("alice")
  })

  it("respects preferences — no email when opted out", async () => {
    await testNotify.updatePreference({
      recipientId: "alice",
      notificationId: "comment_mentioned",
      channels: { email: false },
    })

    await addComment("post_2", "Hey @alice")

    const result = await testNotify.getLastSendResult()
    expect(result.skipped).toContainEqual(
      expect.objectContaining({ channel: "email", reason: "preferences_disabled" })
    )
    expect(result.deliveries).toHaveLength(0)
  })

  it("deduplicates rapid mentions in the same post", async () => {
    await addComment("post_3", "Hey @alice")
    await addComment("post_3", "Also @alice check the link")

    // Second send is deduped (same post + same actor within window)
    const result = await testNotify.getLastSendResult()
    expect(result.idempotent || result.notification === null).toBe(true)
  })
})`}
      />
      <table>
        <thead>
          <tr><th>What to test</th><th>Assert on</th><th>Catches</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>Correct notification fires</td>
            <td><code>result.notification?.notificationId</code></td>
            <td>Wiring bugs — wrong ID, missing send call</td>
          </tr>
          <tr>
            <td>Right recipient</td>
            <td><code>result.inboxItems[0].recipientId</code></td>
            <td>Notifying the actor instead of the mentioned user</td>
          </tr>
          <tr>
            <td>Payload correctness</td>
            <td><code>result.inboxItems[0].title</code> / <code>.body</code></td>
            <td>Template interpolation errors, missing fields</td>
          </tr>
          <tr>
            <td>Preference respect</td>
            <td><code>result.skipped</code> array</td>
            <td>Ignoring opt-outs, bypassing required channels</td>
          </tr>
          <tr>
            <td>Dedup/idempotency</td>
            <td><code>result.idempotent</code> or <code>result.notification === null</code></td>
            <td>Duplicate notifications on retry or rapid events</td>
          </tr>
        </tbody>
      </table>
      <div className="callout callout-tip">
        <strong>No cleanup needed.</strong> Each <code>memoryAdapter()</code>{" "}
        instance is isolated. Create a fresh one per test (or per describe block)
        and all state resets automatically — no database teardown, no shared
        pollution between tests.
      </div>

      <div className="page-nav">
        <Link href="/docs/defining">
          <span className="page-nav-label">Previous</span>
          <span className="page-nav-title">Defining notifications</span>
        </Link>
        <Link href="/docs/channels">
          <span className="page-nav-label">Next</span>
          <span className="page-nav-title">Channels</span>
        </Link>
      </div>
    </article>
  );
}

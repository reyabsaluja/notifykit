import Link from "next/link";
import { createDocsMetadata } from "../../../lib/site";
import { Code } from "../../_components/code";

export const metadata = createDocsMetadata("sending");

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

      <h2>Common patterns</h2>
      <p>
        Most sends fit one of these four shapes. Copy the one that matches your
        use case — each handles the safety concern for that context:
      </p>
      <div className="features">
        <div className="feature-card">
          <h3>Fire-and-forget</h3>
          <p>User action in a server action — non-blocking, dedup prevents double-sends.</p>
          <code style={{ fontSize: "0.8em", whiteSpace: "pre", display: "block", marginTop: "0.5rem" }}>{`void notify.send({
  recipientId: userId,
  notificationId: "comment_mentioned",
  payload: { ... },
  dedupeKey: \`mention:\${postId}:\${actorId}\`,
  dedupeWindowMs: 5 * 60_000,
})`}</code>
        </div>
        <div className="feature-card">
          <h3>Retry-safe webhook</h3>
          <p>Incoming webhook that may fire multiple times — idempotency key guarantees at-most-once.</p>
          <code style={{ fontSize: "0.8em", whiteSpace: "pre", display: "block", marginTop: "0.5rem" }}>{`await notify.send({
  recipientId: userId,
  notificationId: "payment_received",
  payload: { ... },
  idempotencyKey: \`stripe:\${event.id}\`,
})`}</code>
        </div>
        <div className="feature-card">
          <h3>Broadcast to a list</h3>
          <p>Fan-out to a team or followers — parallel with per-recipient idempotency keys.</p>
          <code style={{ fontSize: "0.8em", whiteSpace: "pre", display: "block", marginTop: "0.5rem" }}>{`await Promise.allSettled(
  userIds.map(id => notify.send({
    recipientId: id,
    notificationId: "project_shipped",
    payload: { ... },
    idempotencyKey: \`ship:\${projId}:\${id}\`,
  }))
)`}</code>
        </div>
        <div className="feature-card">
          <h3>Preview before sending</h3>
          <p>Dry-run for debugging or admin tooling — zero side effects, shows full pipeline resolution.</p>
          <code style={{ fontSize: "0.8em", whiteSpace: "pre", display: "block", marginTop: "0.5rem" }}>{`const explanation = await notify.explain({
  recipientId: userId,
  notificationId: "comment_mentioned",
  payload: { ... },
})
// explanation.channels.email.outcome`}</code>
        </div>
      </div>
      <div className="callout callout-tip">
        <strong>Not sure which pattern?</strong> If the caller can retry → add{" "}
        <code>idempotencyKey</code>. If the user can trigger the same event twice →
        add <code>dedupeKey</code>. If response time matters → use{" "}
        <code>void</code> (fire-and-forget). Scroll down for the full decision flow.
      </div>

      <h2>Pipeline decision map</h2>
      <p>
        Each send passes through a sequence of gates. At every gate, the pipeline
        can exit early with a specific outcome. When debugging &quot;why didn&apos;t
        the user get it?&quot; — find which gate stopped it:
      </p>

      <table>
        <thead>
          <tr><th>Gate</th><th>Check</th><th>If it fails</th><th><code>SendResult</code> signal</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>1. Payload validation</strong></td>
            <td>Schema match (types + required fields)</td>
            <td>Throws — no record created, no delivery</td>
            <td>Exception (not a result field)</td>
          </tr>
          <tr>
            <td><strong>2. Idempotency</strong></td>
            <td>Has this <code>idempotencyKey</code> been seen?</td>
            <td>Returns the original result immediately</td>
            <td><code>idempotent: true</code></td>
          </tr>
          <tr>
            <td><strong>3. Deduplication</strong></td>
            <td>Has this <code>dedupeKey</code> been seen within the window?</td>
            <td>Delivery is skipped; an audit record is still created</td>
            <td><code>skipped[].reason === &quot;duplicate&quot;</code></td>
          </tr>
          <tr>
            <td><strong>4. Rate limit</strong></td>
            <td>Is the recipient under the threshold for this notification?</td>
            <td>Send is dropped — permanently gone</td>
            <td><code>rateLimited: true</code></td>
          </tr>
          <tr>
            <td><strong>5. Digest buffer</strong></td>
            <td>Is a digest configured? Buffer the payload.</td>
            <td>Buffered for later — no immediate delivery</td>
            <td><code>digested: true</code></td>
          </tr>
          <tr>
            <td><strong>6. Recipient lookup</strong></td>
            <td>Does the recipient exist in the database?</td>
            <td>Throws — send cannot proceed without a recipient</td>
            <td>Exception (not a result field)</td>
          </tr>
          <tr>
            <td><strong>7. Per-channel preference</strong></td>
            <td>Has the user opted out of this channel?</td>
            <td>Channel skipped (others may still fire)</td>
            <td><code>skipped[].reason: &quot;preferences_disabled&quot;</code></td>
          </tr>
          <tr>
            <td><strong>8. Destination check</strong></td>
            <td>Does the recipient have the address (email, phone)?</td>
            <td>Channel skipped</td>
            <td><code>skipped[].reason: &quot;missing_address&quot;</code></td>
          </tr>
          <tr>
            <td><strong>9. Condition function</strong></td>
            <td>Does the channel&apos;s <code>condition(payload)</code> return true?</td>
            <td>Channel skipped</td>
            <td><code>skipped[].reason: &quot;condition_false&quot;</code></td>
          </tr>
          <tr>
            <td><strong>10. Quiet hours</strong></td>
            <td>Is the recipient in their quiet window? (push channels only)</td>
            <td>Deferred — scheduled for window end</td>
            <td><code>deferredChannels: [&quot;email&quot;, ...]</code></td>
          </tr>
          <tr>
            <td><strong>11. Delivery</strong></td>
            <td>Provider call succeeds?</td>
            <td>Retried with backoff → fallback if exhausted</td>
            <td><code>deliveries[].status: &quot;sent&quot; | &quot;failed&quot;</code></td>
          </tr>
        </tbody>
      </table>

      <div className="callout callout-tip">
        <strong>Read the table top-to-bottom.</strong> Gates are checked in this
        exact order. If gate 4 (rate limit) stops the send, gates 5–11 never run.
        The <code>SendResult</code> always tells you which gate was the last one
        reached — use it to pinpoint where the pipeline stopped.
      </div>

      <div className="callout callout-warn">
        <strong>Gates 1–5 are &quot;whole-send&quot; exits.</strong> They stop the
        entire notification. Gates 7–10 are per-channel — one channel can be skipped
        while another delivers successfully. A send can have{" "}
        <code>skipped.length &gt; 0</code> AND <code>deliveries.length &gt; 0</code>{" "}
        at the same time.
      </div>

      <h2>Quick troubleshooting</h2>
      <p>
        Send not working? Match your symptom to the root cause and fix:
      </p>
      <table>
        <thead>
          <tr><th>Symptom</th><th>Root cause</th><th>Fix</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><code>send()</code> throws <code>VALIDATION_ERROR</code></td>
            <td>Payload doesn&apos;t match the notification&apos;s schema</td>
            <td>Check field names and types against your <code>payload</code> definition. Missing fields and wrong types both trigger this.</td>
          </tr>
          <tr>
            <td><code>send()</code> throws <code>RECIPIENT_NOT_FOUND</code></td>
            <td><code>upsertRecipient()</code> was never called for this user</td>
            <td>Call <code>upsertRecipient({`{ id, email }`})</code> before the first <code>send()</code>. Common in new-user signup flows.</td>
          </tr>
          <tr>
            <td><code>result.deliveries</code> is empty, no inbox item</td>
            <td>All channels were skipped (preferences, missing address, condition)</td>
            <td>Check <code>result.skipped</code> — the <code>reason</code> field tells you which gate blocked it. Use <code>notify.explain()</code> for a full trace.</td>
          </tr>
          <tr>
            <td>Inbox item created but no email sent</td>
            <td>User opted out of email, or recipient has no <code>email</code> field</td>
            <td>Check <code>result.skipped</code> for <code>preferences_disabled</code> or <code>missing_address</code>. Verify the recipient has an email.</td>
          </tr>
          <tr>
            <td><code>result.rateLimited === true</code></td>
            <td>Recipient exceeded the rate limit for this notification</td>
            <td>Expected behavior. If the limit is too tight, increase <code>max</code> or widen <code>windowMs</code> in the notification definition.</td>
          </tr>
          <tr>
            <td><code>result.digested === true</code>, nothing delivered</td>
            <td>Send was buffered into a digest window — delivery happens later</td>
            <td>Not a bug. Wait for the window to expire, or call <code>flushDigests()</code> to force it. In tests, use <code>windowMs: 0</code>.</td>
          </tr>
          <tr>
            <td>Same notification sent twice to the same user</td>
            <td>No <code>idempotencyKey</code> or <code>dedupeKey</code> configured</td>
            <td>Add <code>idempotencyKey</code> (for retryable triggers) or <code>dedupeKey</code> (for user-triggered events). See Common patterns above.</td>
          </tr>
          <tr>
            <td>Email delivered but arrives in spam</td>
            <td>Sender domain not authenticated (SPF/DKIM/DMARC)</td>
            <td>Not a NotifyKit issue — configure DNS records for your sending domain in your email provider&apos;s dashboard.</td>
          </tr>
        </tbody>
      </table>
      <div className="callout callout-tip">
        <strong>Use <code>notify.explain()</code> for any mystery.</strong> It
        dry-runs the full pipeline — same validation, preferences, quiet hours,
        channel resolution — and tells you what <em>would</em> happen without
        actually sending. If <code>send()</code> isn&apos;t doing what you expect,{" "}
        <code>explain()</code> shows you exactly which gate stopped it. See{" "}
        <Link href="/docs/explain">Explain &amp; dry run</Link>.
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
      <div className="callout callout-tip">
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
          <tr><td><code>setTimeoutQueue()</code></td><td><code>send()</code> returns immediately, deliveries run async</td><td>Prototypes where losing in-flight work is acceptable</td></tr>
          <tr><td>Custom (<code>Queue</code> interface)</td><td>You control when workers run</td><td>BullMQ, SQS, Cloudflare Queues</td></tr>
        </tbody>
      </table>
      <p>
        Swap in <code>setTimeoutQueue()</code> to return quickly and run
        deliveries later in the same process. This is useful for demos, but it
        is not a durable production queue:
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
      <div className="callout callout-tip">
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

      <div className="features">
        <div className="feature-card">
          <h3>Can your trigger retry?</h3>
          <p>Webhooks, queue jobs, and cron tasks can fire multiple times. If yes → add an <code>idempotencyKey</code>.</p>
        </div>
        <div className="feature-card">
          <h3>Does the user&apos;s response time depend on delivery?</h3>
          <p>In server actions and API routes, the user waits. If delivery must outlive the request → write an outbox row or enqueue a durable job.</p>
        </div>
        <div className="feature-card">
          <h3>Can the same logical event fire many times?</h3>
          <p>Multiple edits to the same comment, repeated likes. If yes → add a <code>dedupeKey</code> scoped to the entity.</p>
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
            <td>Persist an outbox row; otherwise await it</td>
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
        code={`// Server action — persist intent with the business mutation
"use server"
import { notify } from "@/lib/notifykit"

export async function addComment(postId: string, body: string) {
  return db.transaction(async tx => {
    const comment = await tx.comments.create({ postId, body, authorId: session.userId })

    for (const userId of extractMentions(body)) {
      await tx.notificationOutbox.create({
        notificationId: "comment_mentioned",
        recipientId: userId,
        payload: {
          actorName: session.userName,
          postTitle: comment.postTitle,
          postUrl: \`/posts/\${postId}\`,
        },
        idempotencyKey: \`mention:\${comment.id}:\${userId}\`,
      })
    }

    return comment
  })
}

// A durable worker claims the outbox row, then awaits notify.send({
//   ...row,
//   payload: row.payload,
// }) before marking it complete.
`}
      />
      <div className="callout callout-warn">
        <strong>Returning early is not the same as durable delivery.</strong>{" "}
        If you cannot tolerate loss, persist an outbox row in the same
        transaction as the business change and let a durable worker process it.
        Await <code>notify.send()</code> directly when that simpler tradeoff is
        acceptable.
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

      <h2>Common anti-patterns</h2>
      <p>
        These patterns compile fine but cause subtle issues in production.
        Each one shows the problem and the fix:
      </p>
      <table>
        <thead>
          <tr><th>Anti-pattern</th><th>What goes wrong</th><th>Fix</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Provider work in hot paths</strong></td>
            <td>Response latency includes database and provider work</td>
            <td>Persist an outbox/queue job and process it in a durable worker</td>
          </tr>
          <tr>
            <td><strong>Generic dedup keys</strong></td>
            <td>Key like <code>&quot;comment&quot;</code> silences all comment notifications after the first one</td>
            <td>Scope to the entity: <code>{`\`comment:\${postId}:\${actorId}\``}</code></td>
          </tr>
          <tr>
            <td><strong>Missing idempotency on retryable triggers</strong></td>
            <td>Queue job retries → user gets the same email 3 times</td>
            <td>Always add <code>idempotencyKey</code> when the caller can retry</td>
          </tr>
          <tr>
            <td><strong>Notifying the actor</strong></td>
            <td>&quot;Rey commented on your post&quot; sent to Rey themselves</td>
            <td>Filter <code>recipientId !== actorId</code> before sending</td>
          </tr>
          <tr>
            <td><strong>One notification ID for all audiences</strong></td>
            <td>User can&apos;t opt out of low-priority &quot;watched post&quot; updates without also losing direct mentions</td>
            <td>Separate IDs per audience: <code>comment_mentioned</code> vs <code>comment_on_watched</code></td>
          </tr>
        </tbody>
      </table>

      <Code
        code={`// ❌ Untracked fire-and-forget can disappear on crash or deploy
"use server"
export async function addComment(postId: string, body: string) {
  const comment = await db.comments.create({ postId, body })
  void notify.send({ recipientId: mentioned, ... })
  return comment
}

// ✅ Persist notification intent with the business operation
"use server"
export async function addComment(postId: string, body: string) {
  return db.transaction(async tx => {
    const comment = await tx.comments.create({ postId, body })
    await tx.notificationOutbox.create({
      type: "comment_mentioned",
      recipientId: mentioned,
      payload: { postId, commentId: comment.id },
    })
    return comment
  })
}`}
      />
      <div className="callout callout-warn">
        <strong><code>setTimeoutQueue()</code> is best-effort only.</strong>{" "}
        It improves response latency but does not survive process exits or
        serverless freezes. Use it only when losing an in-flight notification
        is acceptable.
      </div>

      <Code
        code={`// ❌ Generic dedup key — silences ALL comment notifications globally
await notify.send({
  recipientId: userId,
  notificationId: "comment_mentioned",
  payload,
  dedupeKey: "comment",  // Only one comment notification per 5 min, ever
})

// ✅ Scoped dedup key — collapses only rapid duplicates for the same context
await notify.send({
  recipientId: userId,
  notificationId: "comment_mentioned",
  payload,
  dedupeKey: \`comment:\${postId}:\${actorId}:\${recipientId}\`,
})`}
      />

      <Code
        code={`// ❌ No idempotency on a webhook handler — retries cause duplicates
export async function POST(req: Request) {
  const event = await req.json()
  await notify.send({
    recipientId: event.userId,
    notificationId: "payment_received",
    payload: { amount: event.amount },
  })
  return Response.json({ ok: true })
}

// ✅ Idempotency key derived from the event — retries are safe no-ops
export async function POST(req: Request) {
  const event = await req.json()
  await notify.send({
    recipientId: event.userId,
    notificationId: "payment_received",
    payload: { amount: event.amount },
    idempotencyKey: \`stripe:\${event.id}\`,
  })
  return Response.json({ ok: true })
}`}
      />

      <div className="callout callout-warn">
        <strong>The pipeline won&apos;t save you from orchestration bugs.</strong>{" "}
        Dedup, idempotency, and preferences work correctly at the{" "}
        <code>send()</code> level — but if your code calls <code>send()</code>{" "}
        with a wrong recipient, a too-broad key, or in the wrong place, the
        pipeline will faithfully deliver the wrong thing. Test your orchestration
        logic, not just the pipeline mechanics.
      </div>

      <h2>One event, multiple notifications</h2>
      <p>
        Real applications rarely send one notification per event. A single
        domain action — posting a comment, shipping an order, completing a
        deploy — usually triggers different notifications to different audiences.
        Here&apos;s how to structure that fan-out:
      </p>
      <table>
        <thead>
          <tr><th>Event</th><th>Audience</th><th>Notification</th><th>Why it&apos;s different</th></tr>
        </thead>
        <tbody>
          <tr>
            <td rowSpan={3}><strong>Comment posted</strong></td>
            <td>@mentioned users</td>
            <td><code>comment_mentioned</code></td>
            <td>Urgent — they were directly addressed</td>
          </tr>
          <tr>
            <td>Post author</td>
            <td><code>comment_on_your_post</code></td>
            <td>Important but not as targeted</td>
          </tr>
          <tr>
            <td>Post watchers</td>
            <td><code>comment_on_watched</code></td>
            <td>Informational — they opted into updates</td>
          </tr>
          <tr>
            <td rowSpan={3}><strong>Deploy completed</strong></td>
            <td>PR author</td>
            <td><code>deploy_succeeded</code></td>
            <td>Their code is live — action item</td>
          </tr>
          <tr>
            <td>Team channel (webhook)</td>
            <td><code>deploy_webhook</code></td>
            <td>System-to-system, no inbox needed</td>
          </tr>
          <tr>
            <td>Stakeholders</td>
            <td><code>release_shipped</code></td>
            <td>High-level summary, different payload</td>
          </tr>
        </tbody>
      </table>
      <div className="callout callout-tip">
        <strong>Separate notification IDs, not just recipients.</strong> Different
        audiences need different urgency levels, channels, digest windows, and
        preference controls. If you send the same <code>notificationId</code> to
        everyone, users can&apos;t opt out of &quot;comment on watched post&quot;
        without also losing &quot;mentioned you.&quot;
      </div>

      <h3>Orchestration pattern</h3>
      <p>
        Extract a notification dispatcher for each domain event. It receives
        the event context and decides who gets what:
      </p>
      <Code
        code={`// lib/notifications/on-comment-posted.ts
import { notify } from "@/lib/notifykit"

export async function onCommentPosted(comment: {
  id: string
  postId: string
  authorId: string
  body: string
  postAuthorId: string
}) {
  const mentions = extractMentions(comment.body)
  const watchers = await db.watchers.findMany({ where: { postId: comment.postId } })
  const actor = await db.users.findFirst({ where: { id: comment.authorId } })

  // 1. Notify mentioned users (highest priority)
  const mentionSends = mentions
    .filter(userId => userId !== comment.authorId) // don't notify yourself
    .map(userId =>
      notify.send({
        recipientId: userId,
        notificationId: "comment_mentioned",
        payload: { actorName: actor.name, postUrl: \`/posts/\${comment.postId}\` },
        dedupeKey: \`mention:\${comment.postId}:\${comment.authorId}:\${userId}\`,
        dedupeWindowMs: 5 * 60_000,
      })
    )

  // 2. Notify post author (unless they wrote the comment)
  const authorSend = comment.authorId !== comment.postAuthorId
    ? notify.send({
        recipientId: comment.postAuthorId,
        notificationId: "comment_on_your_post",
        payload: { actorName: actor.name, postUrl: \`/posts/\${comment.postId}\` },
        dedupeKey: \`reply:\${comment.postId}:\${comment.authorId}\`,
        dedupeWindowMs: 5 * 60_000,
      })
    : null

  // 3. Notify watchers (lowest priority — often digested)
  const alreadyNotified = new Set([...mentions, comment.postAuthorId, comment.authorId])
  const watcherSends = watchers
    .filter(w => !alreadyNotified.has(w.userId))
    .map(w =>
      notify.send({
        recipientId: w.userId,
        notificationId: "comment_on_watched",
        payload: { actorName: actor.name, postUrl: \`/posts/\${comment.postId}\` },
      })
    )

  await Promise.allSettled([...mentionSends, authorSend, ...watcherSends].filter(Boolean))
}`}
      />
      <table>
        <thead>
          <tr><th>Design decision</th><th>Why</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Deduplicate the audience</strong></td>
            <td>A mentioned user who also watches the post should get the mention (higher priority), not both</td>
          </tr>
          <tr>
            <td><strong>Skip self-notifications</strong></td>
            <td>The comment author shouldn&apos;t get &quot;someone commented on your post&quot; for their own comment</td>
          </tr>
          <tr>
            <td><strong>Different dedup keys per type</strong></td>
            <td>Mention dedup scopes to (post, actor, target). Reply dedup scopes to (post, actor). Different collapse logic.</td>
          </tr>
          <tr>
            <td><strong><code>Promise.allSettled</code></strong></td>
            <td>One failed send (e.g., missing recipient) shouldn&apos;t block the others</td>
          </tr>
        </tbody>
      </table>

      <h3>Where to call the dispatcher</h3>
      <Code
        code={`// Server action — fire after the mutation
"use server"
import { onCommentPosted } from "@/lib/notifications/on-comment-posted"

export async function addComment(postId: string, body: string) {
  const comment = await db.comments.create({ ... })

  // Fire-and-forget — don't block the user response
  void onCommentPosted(comment)

  return comment
}

// Or from a background job (webhook, queue worker):
export async function handleCommentWebhook(payload: CommentEvent) {
  await onCommentPosted(payload.comment) // safe to await — no user waiting
}`}
      />
      <div className="callout callout-tip">
        <strong>One file per domain event.</strong> Keep orchestrators in{" "}
        <code>lib/notifications/on-*.ts</code>. Each file owns the fan-out logic
        for one event — who gets notified, with what priority, and which
        dedup/idempotency keys to use. Your mutation code stays clean (one{" "}
        <code>void onCommentPosted()</code> call) and notification logic is
        testable in isolation.
      </div>

      <h2>Testing sends</h2>
      <p>
        Notification orchestration logic — who gets notified, with what keys,
        from which trigger — is easy to get wrong and hard to debug in production.
        Test at two levels: unit (the orchestrator in isolation) and integration
        (the full pipeline with real results).
      </p>

      <h3>Test setup</h3>
      <p>
        Create a test instance with <code>memoryAdapter()</code> and{" "}
        <code>fakeEmailProvider()</code> — zero external deps, instant delivery:
      </p>
      <Code
        code={`// test/helpers/notifykit.ts
import { createNotifyKit, memoryAdapter, fakeEmailProvider, channel, notification } from "@notifykitjs/core"

export const commentMentioned = notification({
  id: "comment_mentioned",
  payload: { actorName: "string", postTitle: "string", postUrl: "string" },
  channels: [
    channel.inbox()({ title: "{{actorName}} mentioned you", body: "In {{postTitle}}", actionUrl: "{{postUrl}}" }),
    channel.email()({ subject: "{{actorName}} mentioned you", body: "Open {{postUrl}}" }),
  ],
})

export function createTestNotify() {
  return createNotifyKit({
    notifications: [commentMentioned] as const,
    database: memoryAdapter(),
    providers: { email: fakeEmailProvider() },
  })
}`}
      />

      <h3>Integration: assert on SendResult</h3>
      <Code
        code={`import { describe, it, expect, beforeEach } from "vitest"
import { createTestNotify } from "./helpers/notifykit"

describe("comment mention sends", () => {
  let notify: ReturnType<typeof createTestNotify>

  beforeEach(async () => {
    notify = createTestNotify()
    await notify.upsertRecipient({ id: "alice", email: "alice@test.com" })
  })

  it("delivers to inbox and email", async () => {
    const result = await notify.send({
      recipientId: "alice",
      notificationId: "comment_mentioned",
      payload: { actorName: "Rey", postTitle: "Launch", postUrl: "/p/1" },
    })

    expect(result.inboxItems).toHaveLength(1)
    expect(result.inboxItems[0].title).toBe("Rey mentioned you")
    expect(result.deliveries).toHaveLength(1)
    expect(result.deliveries[0].channel).toBe("email")
    expect(result.deliveries[0].status).toBe("sent")
    expect(result.skipped).toHaveLength(0)
  })

  it("deduplicates within window", async () => {
    const opts = {
      recipientId: "alice" as const,
      notificationId: "comment_mentioned" as const,
      payload: { actorName: "Rey", postTitle: "Launch", postUrl: "/p/1" },
      dedupeKey: "mention:p1:rey",
      dedupeWindowMs: 60_000,
    }

    const first = await notify.send(opts)
    const second = await notify.send(opts)

    expect(first.inboxItems).toHaveLength(1)
    expect(second.inboxItems).toHaveLength(0) // deduped
  })

  it("idempotency returns original result", async () => {
    const opts = {
      recipientId: "alice" as const,
      notificationId: "comment_mentioned" as const,
      payload: { actorName: "Rey", postTitle: "Launch", postUrl: "/p/1" },
      idempotencyKey: "job:abc",
    }

    const first = await notify.send(opts)
    const replay = await notify.send(opts)

    expect(replay.idempotent).toBe(true)
    expect(replay.notification?.id).toBe(first.notification?.id)
  })
})`}
      />

      <h3>Unit: test orchestrators in isolation</h3>
      <p>
        Your <code>on-*.ts</code> orchestrators are pure functions of the event.
        Test the logic (who gets notified, skip-self, dedup keys) without
        sending real notifications:
      </p>
      <Code
        code={`// lib/notifications/on-comment-posted.test.ts
import { describe, it, expect, vi } from "vitest"
import { onCommentPosted } from "./on-comment-posted"

// Mock the notify instance
const mockSend = vi.fn().mockResolvedValue({ inboxItems: [], deliveries: [] })
vi.mock("@/lib/notifykit", () => ({
  notify: { send: (...args) => mockSend(...args) },
}))

describe("onCommentPosted", () => {
  it("notifies mentioned users but not the author", async () => {
    await onCommentPosted({
      id: "c1",
      postId: "p1",
      authorId: "rey",
      mentions: ["alice", "bob", "rey"], // rey should be filtered
      postTitle: "Launch Plan",
    })

    expect(mockSend).toHaveBeenCalledTimes(2) // alice + bob, not rey
    expect(mockSend).not.toHaveBeenCalledWith(
      expect.objectContaining({ recipientId: "rey" })
    )
  })

  it("uses per-mention dedup keys", async () => {
    await onCommentPosted({
      id: "c1",
      postId: "p1",
      authorId: "rey",
      mentions: ["alice"],
      postTitle: "Launch",
    })

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        dedupeKey: "mention:p1:rey:alice",
      })
    )
  })
})`}
      />

      <table>
        <thead>
          <tr><th>Test level</th><th>What it proves</th><th>I/O boundary</th><th>When it catches bugs</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Unit (mocked send)</strong></td>
            <td>Orchestration logic — who, skip-self, key design</td>
            <td>No NotifyKit I/O</td>
            <td>Before the notification system is even involved</td>
          </tr>
          <tr>
            <td><strong>Integration (memory adapter)</strong></td>
            <td>Full pipeline — preferences, dedup, delivery, result shape</td>
            <td>In-memory database and fake providers</td>
            <td>Payload mismatches, template bugs, dedup window issues</td>
          </tr>
          <tr>
            <td><strong>E2E (real provider, staging)</strong></td>
            <td>Actual email arrives, webhook hits endpoint</td>
            <td>Real network, DNS, and provider</td>
            <td>Provider config, DNS, auth token expiry</td>
          </tr>
        </tbody>
      </table>

      <div className="callout callout-tip">
        <strong>Test the result, not the internals.</strong> Assert on{" "}
        <code>result.inboxItems</code>, <code>result.skipped</code>, and{" "}
        <code>result.deliveries</code> — not on database state or internal
        method calls. The result is the public contract; internals can change
        between versions without breaking your tests.
      </div>

      <div className="button-row">
        <Link href="/docs/channels" className="primary">Configure channels</Link>
        <Link href="/docs/deduplication">Dedup &amp; idempotency</Link>
        <Link href="/docs/explain">Debug with explain()</Link>
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

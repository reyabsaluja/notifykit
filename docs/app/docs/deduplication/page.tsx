import Link from "next/link";
import { createDocsMetadata } from "../../../lib/site";
import { Code } from "../../_components/code";

export const metadata = createDocsMetadata("deduplication");

export default function DeduplicationPage() {
  return (
    <article>
      <h1>Deduplication &amp; idempotency</h1>
      <p>
        Two distinct mechanisms prevent duplicate notifications. They solve
        different problems and can be used together.
      </p>

      <div className="callout callout-tip">
        <strong>Which do I need?</strong> If two code paths could trigger the
        same logical event → use <strong>deduplication</strong>. If your caller
        might retry the same API call → use <strong>idempotency</strong>. If
        both are possible → use both.
      </div>

      <h2>Match your scenario</h2>
      <p>
        Find your situation below. Each card tells you which mechanism to use
        and why.
      </p>
      <div className="features">
        <div className="feature-card">
          <h3>Webhook handler fires twice</h3>
          <p>
            Stripe/GitHub retries the same webhook because your endpoint was
            slow to respond. The <em>same event</em> arrives again.
          </p>
          <p><strong>Use: idempotencyKey</strong></p>
          <p style={{ fontSize: "0.85em", color: "var(--text-muted)" }}>
            Key: <code>webhook:{`{eventId}`}</code> — the provider gives you a
            stable event ID. Second delivery returns the original result.
          </p>
        </div>
        <div className="feature-card">
          <h3>Two code paths trigger same notification</h3>
          <p>
            An async worker and a realtime handler both fire
            &quot;mentioned you&quot; for the same comment edit.
          </p>
          <p><strong>Use: dedupeKey</strong></p>
          <p style={{ fontSize: "0.85em", color: "var(--text-muted)" }}>
            Key: <code>mention:{`{postId}`}:{`{actorId}`}</code> — scoped to
            the logical event. Second call is skipped within the window.
          </p>
        </div>
        <div className="feature-card">
          <h3>Background job crashes mid-send</h3>
          <p>
            Your worker starts processing, the notification sends, then the
            job crashes before marking complete. The queue retries the job.
          </p>
          <p><strong>Use: idempotencyKey</strong></p>
          <p style={{ fontSize: "0.85em", color: "var(--text-muted)" }}>
            Key: <code>job:{`{jobId}`}</code> — tied to the job run, not the
            event. Replay returns the cached result without re-delivering.
          </p>
        </div>
        <div className="feature-card">
          <h3>User spams &quot;save&quot; on a form</h3>
          <p>
            Each save triggers a notification. Rapid clicks could send 5
            identical emails about the same edit within seconds.
          </p>
          <p><strong>Use: dedupeKey + short window</strong></p>
          <p style={{ fontSize: "0.85em", color: "var(--text-muted)" }}>
            Key: <code>edit:{`{docId}`}:{`{userId}`}</code> with a 2-minute
            window. Only the first save notifies; the rest are suppressed.
          </p>
        </div>
      </div>
      <div className="callout callout-tip">
        <strong>Still unsure?</strong> Ask: &quot;is it the same <em>call</em>{" "}
        arriving twice (retry) or the same <em>event</em> triggering from
        multiple places?&quot; Same call → idempotency. Same event → dedup.
        Both → use both.
      </div>

      <h2>Deduplication (semantic)</h2>
      <p>
        Prevents semantically identical notifications within a time window.
        Example: &quot;user X mentioned you&quot; shouldn&apos;t fire twice if
        two code paths trigger it for the same mention.
      </p>
      <Code
        filename="lib/send-mention.ts"
        code={`await notify.send({
  recipientId: user.id,
  notificationId: "comment_mentioned",
  payload: { actorName: "Rey", postUrl: "/posts/42" },
  dedupeKey: "mention:post_42:user_rey",
  dedupeWindowMs: 5 * 60_000,
})`}
      />
      <p>
        The composite key is scoped to <code>(dedupeKey, notificationId,
        recipientId)</code>. The first send within the window succeeds; any
        subsequent send with the same composite key is skipped with reason{" "}
        <code>&quot;duplicate&quot;</code>.
      </p>

      <h3>Dedup result</h3>
      <Code
        filename="lib/send-mention.ts"
        code={`const result = await notify.send({ ... dedupeKey, dedupeWindowMs })

if (result.skipped.some((item) => item.reason === "duplicate")) {
  console.log("duplicate within window")
}`}
      />

      <h2>Idempotency (retry-safe)</h2>
      <p>
        Prevents the same API call from being processed twice. Use when your
        caller might retry (network timeout, worker crash). The same logical
        operation returns the original result on replay.
      </p>
      <Code
        filename="workers/fulfillment.ts"
        code={`await notify.send({
  recipientId: user.id,
  notificationId: "order_shipped",
  payload: { orderNumber: "ORD-123", trackingUrl: "..." },
  idempotencyKey: "ship:ORD-123",
})`}
      />
      <p>
        The composite key is <code>(idempotencyKey, notificationId,
        recipientId)</code>. A duplicate call within the TTL window returns
        the original <code>NotificationRecord</code> without re-processing.
      </p>

      <h3>TTL</h3>
      <p>
        Idempotency keys expire after a configurable TTL (default: 24 hours).
        After expiry, the same key can be reused.
      </p>
      <Code
        filename="lib/notifykit.ts"
        code={`createNotifyKit({
  // ...
  idempotencyKeyTtlMs: 48 * 60 * 60_000,
})`}
      />

      <h2>Comparison</h2>
      <table>
        <thead>
          <tr>
            <th></th>
            <th>Deduplication</th>
            <th>Idempotency</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Purpose</strong></td>
            <td>Prevent same logical event from notifying twice</td>
            <td>Make retries safe</td>
          </tr>
          <tr>
            <td><strong>Key</strong></td>
            <td><code>dedupeKey</code> (caller-provided)</td>
            <td><code>idempotencyKey</code> (caller-provided)</td>
          </tr>
          <tr>
            <td><strong>Window</strong></td>
            <td><code>dedupeWindowMs</code> (per-call)</td>
            <td><code>idempotencyKeyTtlMs</code> (global config)</td>
          </tr>
          <tr>
            <td><strong>On duplicate</strong></td>
            <td>Create an audit record and skip provider delivery</td>
            <td>Return the existing notification record</td>
          </tr>
          <tr>
            <td><strong>Skip reason</strong></td>
            <td><code>&quot;duplicate&quot;</code></td>
            <td><code>&quot;idempotent_replay&quot;</code></td>
          </tr>
        </tbody>
      </table>

      <h2>Using both together</h2>
      <Code
        filename="workers/process-mention.ts"
        code={`await notify.send({
  recipientId: user.id,
  notificationId: "comment_mentioned",
  payload: { actorName: "Rey", postUrl: "/posts/42" },
  dedupeKey: "mention:post_42:user_rey",
  dedupeWindowMs: 10 * 60_000,
  idempotencyKey: "job:abc123",
})`}
      />
      <div className="overview-flow">
        <div className="overview-flow-step">
          <span className="overview-flow-number">1</span>
          <div>
            <strong>Idempotency check</strong>
            <p>If the key already exists → return the original result immediately. No further processing.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">2</span>
          <div>
            <strong>Dedup check</strong>
            <p>If the dedup key exists within its window → skip provider delivery, write an audit record.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">3</span>
          <div>
            <strong>Normal send</strong>
            <p>Both checks passed → proceeds to rate limits, preferences, channels, delivery.</p>
          </div>
        </div>
      </div>

      <h2>Key design guide</h2>
      <p>
        The key you choose determines what counts as &quot;the same&quot;. Get
        it wrong and you either miss duplicates or suppress legitimate sends.
      </p>
      <table>
        <thead>
          <tr><th>Scenario</th><th>Good key</th><th>Why</th></tr>
        </thead>
        <tbody>
          <tr><td>User mentioned in a comment</td><td><code>mention:{`{postId}`}:{`{actorId}`}</code></td><td>Same actor mentioning in same post = duplicate. Different actor = new notification.</td></tr>
          <tr><td>Order shipped</td><td><code>ship:{`{orderId}`}</code></td><td>One shipment notification per order, regardless of retries.</td></tr>
          <tr><td>Background job retry</td><td><code>job:{`{jobId}`}</code></td><td>Same job ID = same logical operation. Use as idempotency key.</td></tr>
          <tr><td>Daily digest trigger</td><td><code>digest:{`{userId}`}:{`{date}`}</code></td><td>One per user per day. If cron fires twice, second is dropped.</td></tr>
        </tbody>
      </table>
      <div className="callout callout-warn">
        <strong>Don&apos;t include timestamps in dedup keys.</strong> A key like{" "}
        <code>mention:{`{postId}`}:{`{Date.now()}`}</code> is unique every time —
        it defeats the purpose. Keys should represent the <em>logical event</em>,
        not the call.
      </div>

      <h3>Constructing a key from scratch</h3>
      <p>
        Ask these three questions about your event. Each answer becomes a
        segment of the key:
      </p>
      <div className="overview-flow">
        <div className="overview-flow-step">
          <span className="overview-flow-number">1</span>
          <div>
            <strong>What happened?</strong>
            <p>The event verb: <code>mention</code>, <code>like</code>, <code>ship</code>, <code>invite</code></p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">2</span>
          <div>
            <strong>To what?</strong>
            <p>The target entity: <code>post_42</code>, <code>order_123</code>, <code>team_abc</code></p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">3</span>
          <div>
            <strong>By whom?</strong>
            <p>The actor (if relevant): <code>user_rey</code>. Omit if any actor doing the same thing is a duplicate.</p>
          </div>
        </div>
      </div>
      <table>
        <thead>
          <tr><th>Event</th><th>Key segments</th><th>Result</th><th>Dedup behavior</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>Rey mentions Alice in post 42</td>
            <td>mention + post_42 + user_rey</td>
            <td><code>mention:post_42:user_rey</code></td>
            <td>Rey mentioning twice in same post = duplicate. Bob mentioning = new notification.</td>
          </tr>
          <tr>
            <td>Someone likes Alice&apos;s post</td>
            <td>like + post_42 + user_rey</td>
            <td><code>like:post_42:user_rey</code></td>
            <td>Rey liking twice = duplicate. Different user liking = new notification.</td>
          </tr>
          <tr>
            <td>Order ships (system event)</td>
            <td>ship + order_123</td>
            <td><code>ship:order_123</code></td>
            <td>No actor — shipping is a system event. One notification per order, period.</td>
          </tr>
          <tr>
            <td>Daily summary cron</td>
            <td>digest + user_alice + 2026-06-25</td>
            <td><code>digest:user_alice:2026-06-25</code></td>
            <td>Include date to allow one per day. If cron fires twice, second is dropped.</td>
          </tr>
        </tbody>
      </table>
      <div className="callout callout-tip">
        <strong>When in doubt, include the actor.</strong> A key without an actor
        means <em>any</em> user doing that action to the same target gets deduped.
        That&apos;s correct for &quot;order shipped&quot; (system event) but wrong
        for &quot;user mentioned you&quot; (you want each actor&apos;s mention to
        notify separately).
      </div>

      <h2>Testing your setup</h2>
      <p>
        Verify dedup and idempotency in your test suite by sending twice and
        checking the result flags:
      </p>
      <Code
        filename="tests/dedup.test.ts"
        code={`const first = await notify.send({
  recipientId: "test_user",
  notificationId: "comment_mentioned",
  payload: { actorName: "Rey", postUrl: "/posts/1" },
  dedupeKey: "mention:post_1:rey",
  dedupeWindowMs: 60_000,
})
expect(first.deliveries.length).toBeGreaterThan(0)

const second = await notify.send({
  recipientId: "test_user",
  notificationId: "comment_mentioned",
  payload: { actorName: "Rey", postUrl: "/posts/1" },
  dedupeKey: "mention:post_1:rey",
  dedupeWindowMs: 60_000,
})
expect(second.skipped.some(s => s.reason === "duplicate")).toBe(true)
expect(second.deliveries.length).toBe(0)`}
      />
      <table>
        <thead>
          <tr><th>Mistake</th><th>Symptom</th><th>Fix</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>Key too broad (<code>mention:{`{postId}`}</code>)</td>
            <td>Different actors&apos; mentions get suppressed</td>
            <td>Include the actor: <code>mention:{`{postId}`}:{`{actorId}`}</code></td>
          </tr>
          <tr>
            <td>Key too narrow (includes timestamp)</td>
            <td>Duplicates always go through</td>
            <td>Remove any time-varying component from the key</td>
          </tr>
          <tr>
            <td>Window too short (1 second)</td>
            <td>Rapid retries still create duplicates</td>
            <td>Use 5–10 minutes minimum for event dedup</td>
          </tr>
          <tr>
            <td>Confusing dedup with idempotency</td>
            <td>Using <code>dedupeKey</code> for retry safety</td>
            <td>Use <code>idempotencyKey</code> for retries — it returns the original result instead of skipping</td>
          </tr>
        </tbody>
      </table>

      <h2>Choosing the right dedup window</h2>
      <p>
        The window should be longer than the maximum time between duplicate
        triggers, but shorter than the interval at which the event can
        legitimately recur. Get it wrong and you either miss duplicates or
        swallow real notifications.
      </p>
      <table>
        <thead>
          <tr><th>Window too short</th><th>Window too long</th><th>Window just right</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>Retries or delayed webhooks create duplicates</td>
            <td>User does the same action again (legitimately) and gets no notification</td>
            <td>Covers the retry/propagation window without blocking real events</td>
          </tr>
        </tbody>
      </table>
      <p>
        Use the event&apos;s natural recurrence interval to pick a window:
      </p>
      <table>
        <thead>
          <tr><th>Event type</th><th>Typical duplicate source</th><th>Recommended window</th><th>Reasoning</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>Webhook-triggered (e.g. payment received)</td>
            <td>Provider retries delivery 3× over 30 seconds</td>
            <td>5 minutes</td>
            <td>Covers retry window with margin. A new payment is a different <code>paymentId</code> in the key anyway.</td>
          </tr>
          <tr>
            <td>User action (e.g. mentioned in comment)</td>
            <td>Dual code paths fire for same edit</td>
            <td>10 minutes</td>
            <td>Edit + save + async worker can span several seconds. A new mention is a new comment ID.</td>
          </tr>
          <tr>
            <td>Cron-triggered (e.g. daily summary)</td>
            <td>Cron fires twice due to clock skew or restart</td>
            <td>1 hour</td>
            <td>Include the date in the key — window just needs to cover the cron jitter.</td>
          </tr>
          <tr>
            <td>Realtime/streaming (e.g. typing indicator)</td>
            <td>Rapid-fire events from the same action</td>
            <td>30 seconds – 2 minutes</td>
            <td>Events recur legitimately in seconds; window should be tight.</td>
          </tr>
          <tr>
            <td>System event (e.g. deploy completed)</td>
            <td>Multiple services report the same deploy</td>
            <td>15 minutes</td>
            <td>Deploy pipelines can span minutes. Key by deploy ID so a new deploy isn&apos;t suppressed.</td>
          </tr>
        </tbody>
      </table>
      <Code
        filename="webhooks/stripe.ts"
        code={`await notify.send({
  recipientId: user.id,
  notificationId: "payment_received",
  payload: { amount: 49.99, orderId: "ORD-456" },
  dedupeKey: \`payment:\${payload.paymentId}\`,
  dedupeWindowMs: 5 * 60_000,
})`}
      />
      <Code
        filename="webhooks/deploy.ts"
        code={`await notify.send({
  recipientId: user.id,
  notificationId: "deploy_completed",
  payload: { service: "api", sha: "abc123" },
  dedupeKey: \`deploy:\${payload.deployId}\`,
  dedupeWindowMs: 15 * 60_000,
})`}
      />
      <div className="callout callout-tip">
        <strong>When the key is unique per occurrence, window length matters
        less.</strong> If your dedup key includes a unique identifier (like{" "}
        <code>paymentId</code> or <code>deployId</code>), the window only needs
        to outlast the retry/propagation delay. A new occurrence generates a new
        key and passes dedup regardless of the window.
      </div>

      <h2>Monitoring dedup in production</h2>
      <p>
        Your dedup keys work perfectly in tests — but are they catching real
        duplicates in production, or silently swallowing legitimate
        notifications? Track dedup hits to find out.
      </p>
      <Code
        filename="lib/notifykit.ts"
        code={`createNotifyKit({
  // ...
  on: {
    "send.completed": ({ result, input }) => {
      const wasDeduplicated = result.skipped.some(s => s.reason === "duplicate")

      if (wasDeduplicated) {
        metrics.inc("notifykit.dedup.hit", {
          notification: input.notificationId,
          dedupeKey: input.dedupeKey ?? "none",
        })
      } else if (input.dedupeKey) {
        metrics.inc("notifykit.dedup.miss", {
          notification: input.notificationId,
        })
      }
    },
  },
})`}
      />
      <table>
        <thead>
          <tr><th>Signal</th><th>Meaning</th><th>Action</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Hit rate 0% over 7 days</strong></td>
            <td>Dedup is configured but never triggers</td>
            <td>Either your keys are too narrow (include timestamps?) or duplicates aren&apos;t occurring. Simplify or remove dedup if it&apos;s not needed.</td>
          </tr>
          <tr>
            <td><strong>Hit rate &gt; 50%</strong></td>
            <td>More sends are duplicates than unique</td>
            <td>Normal for webhook-triggered events (providers retry aggressively). Concerning for user actions — investigate upstream callers.</td>
          </tr>
          <tr>
            <td><strong>Hit rate spikes suddenly</strong></td>
            <td>A code path started double-firing</td>
            <td>Check recent deploys. A new subscriber, webhook handler, or event listener may be duplicating triggers.</td>
          </tr>
          <tr>
            <td><strong>Users report missing notifications</strong></td>
            <td>Keys may be too broad — legitimate sends getting suppressed</td>
            <td>Check if different actors or different targets share the same dedup key. Add more specificity.</td>
          </tr>
          <tr>
            <td><strong>Hit rate varies by notification type</strong></td>
            <td>Some events have noisier triggers than others</td>
            <td>Expected. Webhook-triggered events should be high; manual user actions should be near zero.</td>
          </tr>
        </tbody>
      </table>

      <h3>Auditing suppressed sends</h3>
      <p>
        When a user reports a missing notification, check if dedup caught it.
        Use the <Link href="/docs/timeline">timeline</Link> or query directly:
      </p>
      <Code
        filename="scripts/audit-dedup.ts"
        code={`const result = await notify.send({
  recipientId: "user_123",
  notificationId: "comment_mentioned",
  payload: { actorName: "New Person", postUrl: "/posts/99" },
  dedupeKey: "mention:post_99:new_person",
  dedupeWindowMs: 10 * 60_000,
})

if (result.skipped.some(s => s.reason === "duplicate")) {
  console.log("Suppressed by dedup — key:", "mention:post_99:new_person")
}

const explanation = await notify.explain({
  recipientId: "user_123",
  notificationId: "comment_mentioned",
  payload: { actorName: "New Person", postUrl: "/posts/99" },
  dedupeKey: "mention:post_99:new_person",
  dedupeWindowMs: 10 * 60_000,
})
console.log("Would deduplicate:", explanation.wouldDeduplicate)`}
      />
      <div className="callout callout-tip">
        <strong>Dashboard query for ops.</strong> If you&apos;re tracking dedup
        hits in your metrics system, alert when{" "}
        <code>dedup.hit / (dedup.hit + dedup.miss) &gt; 0.8</code> for user-triggered
        events. High dedup rates on user actions usually mean a bug in your event
        pipeline — not a healthy dedup system.
      </div>

      <h2>Feature interactions</h2>
      <p>
        Dedup and idempotency run early in the{" "}
        <Link href="/docs">send pipeline</Link>. Understanding their position
        relative to other stages prevents surprises:
      </p>
      <table>
        <thead>
          <tr><th>Stage order</th><th>What happens</th><th>If dedup fires here</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>1. Idempotency</td>
            <td>Returns cached result if key seen</td>
            <td>N/A — idempotency runs first, replays the original outcome</td>
          </tr>
          <tr>
            <td>2. Dedup</td>
            <td>Skips if key within window</td>
            <td>Send stops here — never reaches rate limit, digest, or delivery</td>
          </tr>
          <tr>
            <td>3. Rate limit</td>
            <td>Drops if over threshold</td>
            <td>—</td>
          </tr>
          <tr>
            <td>4. Digest</td>
            <td>Buffers into batch window</td>
            <td>—</td>
          </tr>
          <tr>
            <td>5. Preferences</td>
            <td>Skips channels user opted out of</td>
            <td>—</td>
          </tr>
          <tr>
            <td>6. Quiet hours</td>
            <td>Defers push channels</td>
            <td>—</td>
          </tr>
          <tr>
            <td>7. Deliver</td>
            <td>Queues to providers</td>
            <td>—</td>
          </tr>
        </tbody>
      </table>

      <h3>Dedup + digests</h3>
      <p>
        Dedup runs <em>before</em> digest buffering. A deduplicated send never
        enters the digest — it&apos;s dropped before the engine considers batching.
        This means:
      </p>
      <Code
        filename="tests/dedup-digest.test.ts"
        code={`// First send: enters digest buffer
await notify.send({
  recipientId: "user_1",
  notificationId: "activity_update",
  payload: { action: "liked your post" },
  dedupeKey: "like:post_42:user_rey",
  dedupeWindowMs: 10 * 60_000,
})

// Second send (within dedup window): SKIPPED — never reaches digest
const result = await notify.send({
  recipientId: "user_1",
  notificationId: "activity_update",
  payload: { action: "liked your post" },
  dedupeKey: "like:post_42:user_rey",
  dedupeWindowMs: 10 * 60_000,
})
expect(result.skipped.some(s => s.reason === "duplicate")).toBe(true)`}
      />

      <h3>Dedup + rate limits</h3>
      <p>
        Dedup also runs before rate limiting. A deduplicated send does{" "}
        <strong>not</strong> count against your rate limit budget:
      </p>
      <Code
        lang="bash"
        code={`# Notification with rate limit: max 5 per hour
# If 3 of 8 sends are deduped, only 5 unique sends count against the limit
# Deduped sends: skipped at stage 2, never reach stage 3`}
      />

      <h3>Dedup + quiet hours</h3>
      <p>
        A deduplicated send is dropped entirely — it won&apos;t be deferred by
        quiet hours. Only sends that pass dedup can be queued for later delivery.
        If the dedup window expires during quiet hours, a new send with the same
        key will pass dedup and get deferred normally.
      </p>

      <table>
        <thead>
          <tr><th>Scenario</th><th>Outcome</th><th>Why</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>Send during quiet hours, first occurrence</td>
            <td>Deferred — delivers when window ends</td>
            <td>Dedup passes (first time), quiet hours defers</td>
          </tr>
          <tr>
            <td>Same key sent again during quiet hours</td>
            <td>Skipped — never delivers</td>
            <td>Dedup fires at stage 2, quiet hours never reached</td>
          </tr>
          <tr>
            <td>Dedup window expires, same key sent again</td>
            <td>Treated as new — enters pipeline fresh</td>
            <td>Key expired, engine has no memory of the first send</td>
          </tr>
          <tr>
            <td>Digested send + dedup within digest window</td>
            <td>First enters digest, second dropped</td>
            <td>Dedup fires before digest buffering</td>
          </tr>
        </tbody>
      </table>
      <div className="callout callout-tip">
        <strong>Use explain() to see where a send stops.</strong> The{" "}
        <Link href="/docs/explain">explain</Link> response includes{" "}
        <code>wouldDeduplicate</code>, <code>wouldRateLimit</code>, and{" "}
        <code>wouldDigest</code> — check them in order to understand exactly
        which stage intercepted a send.
      </div>

      <div className="button-row">
        <Link href="/docs/explain" className="primary">Explain & dry run</Link>
        <Link href="/docs/digests">Digests & rate limits</Link>
        <Link href="/docs/timeline">Timeline debugging</Link>
      </div>

      <div className="page-nav">
        <Link href="/docs/quiet-hours">
          <span className="page-nav-label">Previous</span>
          <span className="page-nav-title">Quiet hours</span>
        </Link>
        <Link href="/docs/fallbacks">
          <span className="page-nav-label">Next</span>
          <span className="page-nav-title">Fallback channels</span>
        </Link>
      </div>
    </article>
  );
}

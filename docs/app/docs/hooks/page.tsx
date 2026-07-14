import type { Metadata } from "next";
import Link from "next/link";
import { Code } from "../../_components/code";

export const metadata: Metadata = { title: "Hooks & observability" };

export default function HooksPage() {
  return (
    <article>
      <h1>Hooks &amp; observability</h1>
      <p>
        Every significant moment in the notification pipeline fires a hook.
        Use them to pipe data into your metrics, audit log, error tracker,
        or any external system.
      </p>

      <div className="features">
        <div className="feature-card">
          <h3>Metrics &amp; dashboards</h3>
          <p>Track delivery rates, latency percentiles, and channel-level success in Datadog, Prometheus, or any metrics backend.</p>
        </div>
        <div className="feature-card">
          <h3>Error tracking</h3>
          <p>Pipe delivery failures into Sentry or Bugsnag with full context — channel, provider, error, attempt count.</p>
        </div>
        <div className="feature-card">
          <h3>Audit logging</h3>
          <p>Record who deleted inbox items, when notifications were sent, and preference changes for compliance.</p>
        </div>
        <div className="feature-card">
          <h3>Alerting</h3>
          <p>Fire Slack or PagerDuty alerts on rate limit spikes, sustained failures, or rising suppression rates.</p>
        </div>
      </div>

      <table>
        <thead>
          <tr><th>Integration</th><th>Hooks to use</th></tr>
        </thead>
        <tbody>
          <tr><td><strong>Metrics</strong> (Datadog, Prometheus)</td><td><code>notification.created</code>, <code>delivery.sent</code>, <code>delivery.failed</code></td></tr>
          <tr><td><strong>Error tracking</strong> (Sentry, Bugsnag)</td><td><code>delivery.failed</code></td></tr>
          <tr><td><strong>Audit log</strong></td><td><code>inbox.deleted</code>, <code>notification.created</code>, <code>inbox.all_read</code></td></tr>
          <tr><td><strong>Alerting</strong> (PagerDuty, Slack)</td><td><code>notification.rate_limited</code>, <code>notification.suppressed</code></td></tr>
        </tbody>
      </table>

      <div className="callout callout-warn">
        <strong>Hooks are awaited by default.</strong> A slow hook blocks the
        send pipeline. Use <code>void</code> to fire-and-forget if your
        external call is slow — see the Async safety section below.
      </div>

      <h2>Which hook do I need?</h2>
      <p>
        Start from what you want to know, not the lifecycle category:
      </p>
      <table>
        <thead>
          <tr><th>I want to know&hellip;</th><th>Hook</th><th>Why this one</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>A notification was sent successfully</td>
            <td><code>delivery.sent</code></td>
            <td>Fires after the provider confirms — one per channel that delivered</td>
          </tr>
          <tr>
            <td>A notification failed permanently</td>
            <td><code>delivery.failed</code></td>
            <td>Fires after all retries exhausted — includes the final error</td>
          </tr>
          <tr>
            <td>A user was skipped entirely (all channels blocked)</td>
            <td><code>notification.suppressed</code></td>
            <td>Fires when preferences/quiet hours/etc. block every channel</td>
          </tr>
          <tr>
            <td>A send hit the rate limit ceiling</td>
            <td><code>notification.rate_limited</code></td>
            <td>Fires before any delivery attempt — the notification was dropped</td>
          </tr>
          <tr>
            <td>A duplicate was caught</td>
            <td><code>notification.deduplicated</code></td>
            <td>Fires when the dedup key matches a recent send — no work done</td>
          </tr>
          <tr>
            <td>An inbox item changed state (read, archived, deleted)</td>
            <td><code>inbox.updated</code> / <code>inbox.archived</code> / <code>inbox.deleted</code></td>
            <td>Per-action hooks for audit trails or analytics</td>
          </tr>
          <tr>
            <td>How long delivery took (latency)</td>
            <td><code>delivery.sent</code></td>
            <td>Compare <code>sentAt - createdAt</code> in the delivery object</td>
          </tr>
        </tbody>
      </table>

      <h2>Configuring hooks</h2>
      <Code
        filename="lib/notifykit.ts"
        code={`const notify = createNotifyKit({
  // ...
  on: {
    "notification.created": ({ notification }) => {
      metrics.inc("notifications.created", {
        id: notification.notificationId,
      })
    },

    "delivery.sent": ({ delivery }) => {
      metrics.inc("delivery.sent", {
        channel: delivery.channel,
        provider: delivery.provider,
      })
    },

    "delivery.failed": ({ delivery, error }) => {
      sentry.captureException(error, {
        extra: { deliveryId: delivery.id, channel: delivery.channel },
      })
    },

    "notification.rate_limited": ({ notificationId, recipientId, limit }) => {
      logger.warn("rate limited", { notificationId, recipientId, limit })
    },
  },
})`}
      />
      <p>
        This covers the most common pattern: count sends, track failures,
        alert on rate limits. See the full list below for every available hook.
      </p>

      <h2>Available hooks</h2>

      <h3>Notification lifecycle</h3>
      <table>
        <thead>
          <tr><th>Hook</th><th>Fires when</th><th>Context</th></tr>
        </thead>
        <tbody>
          <tr><td><code>notification.created</code></td><td>Record written to DB</td><td><code>notification</code>, <code>redactedPayload</code></td></tr>
          <tr><td><code>notification.deduplicated</code></td><td>Skipped by dedup key</td><td><code>notificationId</code>, <code>dedupeKey</code>, <code>windowMs</code></td></tr>
          <tr><td><code>notification.rate_limited</code></td><td>Dropped by rate limit</td><td><code>notificationId</code>, <code>recipientId</code>, <code>limit</code></td></tr>
          <tr><td><code>notification.suppressed</code></td><td>All channels skipped</td><td><code>notificationId</code>, <code>skippedChannels</code></td></tr>
        </tbody>
      </table>

      <h3>Delivery lifecycle</h3>
      <table>
        <thead>
          <tr><th>Hook</th><th>Fires when</th><th>Context</th></tr>
        </thead>
        <tbody>
          <tr><td><code>delivery.sent</code></td><td>Provider confirmed delivery</td><td><code>delivery</code>, <code>redactedPayload</code></td></tr>
          <tr><td><code>delivery.failed</code></td><td>All retries exhausted</td><td><code>delivery</code>, <code>error</code>, <code>redactedPayload</code></td></tr>
        </tbody>
      </table>

      <h3>Inbox lifecycle</h3>
      <table>
        <thead>
          <tr><th>Hook</th><th>Fires when</th><th>Context</th></tr>
        </thead>
        <tbody>
          <tr><td><code>inbox.created</code></td><td>Inbox item written</td><td><code>inboxItem</code></td></tr>
          <tr><td><code>inbox.updated</code></td><td>Marked read/archived/unarchived</td><td><code>inboxItem</code></td></tr>
          <tr><td><code>inbox.archived</code></td><td>Item archived</td><td><code>inboxItem</code></td></tr>
          <tr><td><code>inbox.unarchived</code></td><td>Item unarchived</td><td><code>inboxItem</code></td></tr>
          <tr><td><code>inbox.deleted</code></td><td>Item permanently deleted</td><td><code>itemId</code>, <code>recipientId</code></td></tr>
          <tr><td><code>inbox.all_read</code></td><td><code>markAllRead()</code> called</td><td><code>recipientId</code>, <code>count</code></td></tr>
        </tbody>
      </table>

      <h2>Hook timing in the pipeline</h2>
      <p>
        Hooks fire at specific points in the send pipeline. Understanding
        <em> when</em> each hook fires tells you what has already happened
        (and what hasn&apos;t) when your code runs:
      </p>
      <div className="overview-flow">
        <div className="overview-flow-step">
          <span className="overview-flow-number">1</span>
          <div>
            <strong>Rate limit &amp; dedup check</strong>
            <p>If blocked: <code>notification.rate_limited</code> or <code>notification.deduplicated</code> fires. Pipeline stops — no record written, no delivery attempted.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">2</span>
          <div>
            <strong>Record created</strong>
            <p><code>notification.created</code> fires. The notification record is in the DB. Channels have not been evaluated yet.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">3</span>
          <div>
            <strong>Channel resolution</strong>
            <p>Preferences, quiet hours, and availability are checked per channel. If all channels are blocked: <code>notification.suppressed</code> fires.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">4</span>
          <div>
            <strong>Inbox write</strong>
            <p><code>inbox.created</code> fires. The inbox item exists — user can fetch it immediately.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">5</span>
          <div>
            <strong>Push delivery (email, SMS, webhook)</strong>
            <p>Provider called, retries attempted. On success: <code>delivery.sent</code>. After all retries exhausted: <code>delivery.failed</code>.</p>
          </div>
        </div>
      </div>
      <table>
        <thead>
          <tr><th>Hook</th><th>Pipeline stage</th><th>What&apos;s already happened</th><th>What hasn&apos;t happened yet</th></tr>
        </thead>
        <tbody>
          <tr><td><code>notification.rate_limited</code></td><td>1 (guard)</td><td>Nothing — send rejected immediately</td><td>No record, no delivery, no inbox item</td></tr>
          <tr><td><code>notification.deduplicated</code></td><td>1 (guard)</td><td>Nothing — duplicate key matched</td><td>No record, no delivery, no inbox item</td></tr>
          <tr><td><code>notification.created</code></td><td>2 (record)</td><td>Record written to DB</td><td>Channel resolution, delivery, inbox</td></tr>
          <tr><td><code>notification.suppressed</code></td><td>3 (resolution)</td><td>Record exists, all channels evaluated</td><td>No delivery — every channel was blocked</td></tr>
          <tr><td><code>inbox.created</code></td><td>4 (inbox)</td><td>Record exists, inbox item written</td><td>Push channels may still be in-flight</td></tr>
          <tr><td><code>delivery.sent</code></td><td>5 (delivery)</td><td>Record exists, provider confirmed</td><td>Other channels may still be in-flight</td></tr>
          <tr><td><code>delivery.failed</code></td><td>5 (delivery)</td><td>Record exists, all retries exhausted</td><td>Fallback channel may trigger next</td></tr>
        </tbody>
      </table>
      <div className="callout callout-tip">
        <strong>Inbox hooks fire independently of delivery hooks.</strong> A
        notification that delivers to both inbox and email will fire{" "}
        <code>inbox.created</code> (stage 4) <em>before</em>{" "}
        <code>delivery.sent</code> (stage 5). Don&apos;t assume the email has
        been sent when your inbox hook runs.
      </div>

      <h2>Async safety</h2>
      <p>
        Hooks can be <code>async</code>. The engine awaits them — a slow hook
        blocks the pipeline. For fire-and-forget behavior, don&apos;t return
        the promise:
      </p>
      <Code
        code={`on: {
  "delivery.sent": ({ delivery }) => {
    // Fire and forget — don't await, don't block send()
    void analyticsClient.track("email_sent", { deliveryId: delivery.id })
  },
}`}
      />

      <h2>Common recipes</h2>
      <table>
        <thead>
          <tr><th>Goal</th><th>Hook</th><th>Pattern</th></tr>
        </thead>
        <tbody>
          <tr><td>Count emails sent per minute</td><td><code>delivery.sent</code></td><td>Increment counter with <code>channel: delivery.channel</code> label</td></tr>
          <tr><td>Alert on repeated failures</td><td><code>delivery.failed</code></td><td>Fire-and-forget to PagerDuty/Slack with error details</td></tr>
          <tr><td>Audit who unsubscribed</td><td><code>inbox.deleted</code></td><td>Log <code>recipientId</code> + timestamp to audit table</td></tr>
          <tr><td>Detect suppressed notifications</td><td><code>notification.suppressed</code></td><td>Log when all channels skip — may indicate stale recipients</td></tr>
          <tr><td>Track delivery latency</td><td><code>delivery.sent</code></td><td>Compare <code>delivery.sentAt - delivery.createdAt</code></td></tr>
        </tbody>
      </table>

      <h2>Key metrics to track</h2>
      <p>
        Not sure what to measure? These five signals catch most production
        issues before users report them:
      </p>
      <table>
        <thead>
          <tr><th>Metric</th><th>Hook</th><th>Alert when</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Delivery success rate</strong></td>
            <td><code>delivery.sent</code> / <code>delivery.failed</code></td>
            <td>Success rate drops below 95% over 5 minutes</td>
          </tr>
          <tr>
            <td><strong>Delivery latency (p95)</strong></td>
            <td><code>delivery.sent</code> — compare <code>sentAt - createdAt</code></td>
            <td>p95 exceeds 30 seconds (provider slowdown or queue backup)</td>
          </tr>
          <tr>
            <td><strong>Rate limit hits</strong></td>
            <td><code>notification.rate_limited</code></td>
            <td>Sustained spike — may indicate a bug sending in a loop</td>
          </tr>
          <tr>
            <td><strong>Suppression rate</strong></td>
            <td><code>notification.suppressed</code></td>
            <td>Rising trend — may mean stale recipients or over-aggressive preferences</td>
          </tr>
          <tr>
            <td><strong>Dedup collision rate</strong></td>
            <td><code>notification.deduplicated</code></td>
            <td>Sudden spike — either a retry storm or a dedup key that&apos;s too broad</td>
          </tr>
        </tbody>
      </table>
      <Code
        filename="lib/notifykit.ts"
        code={`on: {
  "delivery.sent": ({ delivery }) => {
    metrics.inc("notifykit.delivery.sent", { channel: delivery.channel })
    metrics.histogram("notifykit.delivery.latency_ms",
      delivery.sentAt - delivery.createdAt, { channel: delivery.channel })
  },
  "delivery.failed": ({ delivery, error }) => {
    metrics.inc("notifykit.delivery.failed", { channel: delivery.channel })
    sentry.captureException(error, { extra: { deliveryId: delivery.id } })
  },
  "notification.rate_limited": ({ notificationId }) => {
    metrics.inc("notifykit.rate_limited", { notification: notificationId })
  },
  "notification.suppressed": ({ notificationId }) => {
    metrics.inc("notifykit.suppressed", { notification: notificationId })
  },
}`}
      />

      <h2>When alerts fire — incident playbook</h2>
      <p>
        Metrics without a response plan are noise. This table maps each alert
        to what&apos;s likely broken and the first three steps to take:
      </p>
      <table>
        <thead>
          <tr><th>Alert</th><th>Likely cause</th><th>First response</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Delivery success rate &lt; 95%</strong></td>
            <td>Provider outage or API key revoked</td>
            <td>1. Check provider status page. 2. Verify API key in env. 3. If sustained, swap to backup provider.</td>
          </tr>
          <tr>
            <td><strong>Delivery latency p95 &gt; 30s</strong></td>
            <td>Queue backup, provider slowdown, or event loop congestion</td>
            <td>1. Check queue depth. 2. Check provider response times. 3. Scale workers or increase concurrency.</td>
          </tr>
          <tr>
            <td><strong>Rate limit spike (10x normal)</strong></td>
            <td>Bug sending in a loop, or an automated process retrying aggressively</td>
            <td>1. Check recent deploys. 2. Identify the source notification ID. 3. Add/tighten dedup key on the offending send.</td>
          </tr>
          <tr>
            <td><strong>Suppression rate rising (&gt;20%)</strong></td>
            <td>Stale recipients, or a notification targeting users who&apos;ve all opted out</td>
            <td>1. Check which notification ID dominates. 2. Audit recipient list freshness. 3. Consider removing inactive recipients.</td>
          </tr>
          <tr>
            <td><strong>Dedup collision spike</strong></td>
            <td>Retry storm from a queue or webhook, or dedup key that&apos;s too broad</td>
            <td>1. Check for duplicate job executions. 2. Verify dedup key includes enough specificity. 3. Check if a webhook source is retrying.</td>
          </tr>
        </tbody>
      </table>
      <div className="callout callout-tip">
        <strong>Correlate with deploys.</strong> Most alert spikes happen within
        minutes of a deployment. If your metrics dashboard can overlay deploy
        markers, the cause is usually obvious — a changed notification definition,
        a broken provider config, or a new send call in a hot loop.
      </div>

      <h2>Hook error handling</h2>
      <p>
        What happens when a hook itself throws? The behavior depends on whether
        you await the hook or fire-and-forget:
      </p>
      <table>
        <thead>
          <tr><th>Pattern</th><th>If hook throws</th><th>Effect on send()</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Sync/awaited hook</strong></td>
            <td>Error propagates to <code>send()</code> caller</td>
            <td>Send still completes (delivery already happened), but the <code>send()</code> promise rejects</td>
          </tr>
          <tr>
            <td><strong>Fire-and-forget (<code>void</code>)</strong></td>
            <td>Unhandled rejection — crashes process if uncaught</td>
            <td>None — send already returned successfully</td>
          </tr>
        </tbody>
      </table>
      <Code
        code={`// SAFE: wrap external calls in try/catch
on: {
  "delivery.sent": ({ delivery }) => {
    try {
      metrics.inc("notifykit.sent", { channel: delivery.channel })
    } catch (err) {
      // Don't let a metrics failure break sends
      console.error("Hook error (metrics):", err)
    }
  },

  "delivery.failed": ({ delivery, error }) => {
    // SAFE fire-and-forget: .catch() prevents unhandled rejection
    sentryClient.captureException(error, {
      extra: { deliveryId: delivery.id },
    }).catch(hookErr => console.error("Hook error (sentry):", hookErr))
  },
}`}
      />
      <div className="features">
        <div className="feature-card">
          <h3>Hooks should never break sends</h3>
          <p>Wrap every hook in try/catch or add <code>.catch()</code> to fire-and-forget promises. A notification that delivers but fails to log is better than one that fails entirely.</p>
        </div>
        <div className="feature-card">
          <h3>Keep hooks fast (&lt;50ms)</h3>
          <p>Awaited hooks add directly to <code>send()</code> latency. If your integration needs network calls, use fire-and-forget or batch into a local buffer that flushes on an interval.</p>
        </div>
        <div className="feature-card">
          <h3>Never call send() inside a hook</h3>
          <p>This creates infinite recursion. If you need to trigger a follow-up notification, enqueue it via your job system — don&apos;t call <code>notify.send()</code> directly.</p>
        </div>
      </div>

      <h2>Payload redaction</h2>
      <p>
        Hooks that expose payload data receive <code>redactedPayload</code>{" "}
        — a copy with sensitive fields (declared in the notification&apos;s{" "}
        <code>redact</code> array) replaced by <code>&quot;[REDACTED]&quot;</code>.
        This makes it safe to pipe hook data directly into external systems
        without leaking PII.
      </p>

      <h2>Composing multiple handlers</h2>
      <p>
        As your observability grows, cramming everything into one{" "}
        <code>on</code> object gets messy. Split concerns into standalone
        hook sets and merge them:
      </p>
      <Code
        filename="lib/hooks/metrics.ts"
        code={`export const metricsHooks = {
  "delivery.sent": ({ delivery }) => {
    metrics.inc("notifykit.sent", { channel: delivery.channel })
    metrics.histogram("notifykit.latency_ms",
      delivery.sentAt - delivery.createdAt, { channel: delivery.channel })
  },
  "delivery.failed": ({ delivery }) => {
    metrics.inc("notifykit.failed", { channel: delivery.channel })
  },
}`}
      />
      <Code
        filename="lib/hooks/errors.ts"
        code={`export const errorHooks = {
  "delivery.failed": ({ delivery, error }) => {
    sentry.captureException(error, {
      tags: { channel: delivery.channel, provider: delivery.provider },
      extra: { deliveryId: delivery.id, notificationId: delivery.notificationId },
    })
  },
}`}
      />
      <Code
        filename="lib/hooks/audit.ts"
        code={`export const auditHooks = {
  "notification.created": ({ notification }) => {
    void auditLog.write("notification.sent", {
      recipientId: notification.recipientId,
      notificationId: notification.notificationId,
    })
  },
  "inbox.deleted": ({ itemId, recipientId }) => {
    void auditLog.write("inbox.deleted", { itemId, recipientId })
  },
}`}
      />
      <Code
        filename="lib/notifykit.ts"
        code={`import { metricsHooks } from "./hooks/metrics"
import { errorHooks } from "./hooks/errors"
import { auditHooks } from "./hooks/audit"

function mergeHooks(...hookSets) {
  const merged = {}
  for (const set of hookSets) {
    for (const [event, handler] of Object.entries(set)) {
      const prev = merged[event]
      merged[event] = prev
        ? (ctx) => { prev(ctx); handler(ctx) }
        : handler
    }
  }
  return merged
}

export const notify = createNotifyKit({
  // ...
  on: mergeHooks(metricsHooks, errorHooks, auditHooks),
})`}
      />
      <table>
        <thead>
          <tr><th>Pattern</th><th>When to use</th><th>Trade-off</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Single <code>on</code> object</strong></td>
            <td>Small apps with 1-2 integrations</td>
            <td>Simple but gets tangled quickly</td>
          </tr>
          <tr>
            <td><strong>Separate hook files + merge</strong></td>
            <td>Production apps with metrics, errors, and audit</td>
            <td>Clean separation — each file owns one concern</td>
          </tr>
          <tr>
            <td><strong>Conditional hooks</strong></td>
            <td>Different behavior per environment</td>
            <td>E.g. skip Sentry hooks in test, add verbose logging in dev</td>
          </tr>
        </tbody>
      </table>
      <div className="callout callout-tip">
        <strong>Hooks with the same event name stack, not replace.</strong> The{" "}
        <code>mergeHooks()</code> helper runs all handlers for the same event in
        order. If one throws, later handlers still run — wrap each in try/catch
        if isolation matters.
      </div>

      <h2>Conditional hooks by environment</h2>
      <p>
        Different environments have different observability needs. Dev wants
        verbose console output, staging wants Sentry but not paging, and
        production wants full metrics + alerting. Build this with conditional
        composition:
      </p>
      <Code
        filename="lib/hooks/index.ts"
        code={`import { metricsHooks } from "./metrics"
import { errorHooks } from "./errors"
import { auditHooks } from "./audit"

const devHooks = {
  "notification.created": ({ notification }) => {
    console.log("[notifykit]", notification.notificationId, "→", notification.recipientId)
  },
  "delivery.sent": ({ delivery }) => {
    console.log("[notifykit] ✓", delivery.channel, "sent to", delivery.recipientId)
  },
  "delivery.failed": ({ delivery, error }) => {
    console.error("[notifykit] ✗", delivery.channel, "failed:", error.message)
  },
}

export function buildHooks() {
  const env = process.env.NODE_ENV

  if (env === "test") return {}  // no hooks in test — use vi.fn() explicitly
  if (env === "development") return mergeHooks(devHooks)
  // production + staging:
  return mergeHooks(metricsHooks, errorHooks, auditHooks)
}`}
      />
      <table>
        <thead>
          <tr><th>Environment</th><th>Hooks active</th><th>Why</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Test</strong></td>
            <td>None (empty object)</td>
            <td>Tests inject their own hooks via <code>vi.fn()</code> — global hooks add noise and non-determinism</td>
          </tr>
          <tr>
            <td><strong>Development</strong></td>
            <td>Console logging only</td>
            <td>Instant feedback in the terminal without external deps. No metrics infrastructure needed locally.</td>
          </tr>
          <tr>
            <td><strong>Staging</strong></td>
            <td>Metrics + errors (no paging)</td>
            <td>Validates hook wiring end-to-end. Sentry captures errors but alert rules are relaxed.</td>
          </tr>
          <tr>
            <td><strong>Production</strong></td>
            <td>Metrics + errors + audit</td>
            <td>Full observability. Audit log for compliance. Alerts page oncall on sustained failures.</td>
          </tr>
        </tbody>
      </table>
      <Code
        filename="lib/notifykit.ts"
        code={`import { buildHooks } from "./hooks"

export const notify = createNotifyKit({
  // ...
  on: buildHooks(),
})`}
      />
      <div className="callout callout-tip">
        <strong>Feature-flag individual integrations.</strong> If you want Sentry
        in dev but not metrics, check for the env var:{" "}
        <code>process.env.SENTRY_DSN ? errorHooks : {`{}`}</code>. This lets
        developers opt into specific integrations locally without changing shared
        config.
      </div>

      <h2>Recipe: Slack alerting with debounce</h2>
      <p>
        The most common hook integration is alerting a Slack channel when
        deliveries fail. But during a provider outage, a naive implementation
        floods the channel with hundreds of messages. Use a debounce buffer
        to batch failures into periodic summaries:
      </p>
      <Code
        filename="lib/hooks/slack-alerts.ts"
        code={`const SLACK_WEBHOOK = process.env.SLACK_ALERTS_WEBHOOK!
const DEBOUNCE_MS = 60_000 // batch failures over 1 minute

let buffer: Array<{ channel: string; error: string; notificationId: string }> = []
let flushTimer: ReturnType<typeof setTimeout> | null = null

function scheduleFlush() {
  if (flushTimer) return // already scheduled
  flushTimer = setTimeout(async () => {
    const batch = buffer.splice(0) // drain buffer
    flushTimer = null
    if (batch.length === 0) return

    const summary = batch.length === 1
      ? \`Delivery failed: \${batch[0].notificationId} → \${batch[0].channel} (\${batch[0].error})\`
      : \`\${batch.length} deliveries failed in the last minute:\\n\` +
        Object.entries(Object.groupBy(batch, f => f.channel))
          .map(([ch, items]) => \`• \${ch}: \${items!.length} failures\`)
          .join("\\n")

    await fetch(SLACK_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: \`🚨 *NotifyKit alert*\\n\${summary}\`,
      }),
    }).catch(err => console.error("Slack alert failed:", err))
  }, DEBOUNCE_MS)
}

export const slackAlertHooks = {
  "delivery.failed": ({ delivery, error }) => {
    buffer.push({
      channel: delivery.channel,
      error: error?.message ?? "unknown",
      notificationId: delivery.notificationId,
    })
    scheduleFlush()
  },

  "notification.rate_limited": ({ notificationId, recipientId }) => {
    // Rate limits are less noisy — alert immediately but only once per notification type
    void fetch(SLACK_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: \`⚠️ Rate limit hit: \${notificationId} for \${recipientId}\`,
      }),
    }).catch(() => {})
  },
}`}
      />
      <table>
        <thead>
          <tr><th>Alert type</th><th>Debounce window</th><th>Why</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Delivery failures</strong></td>
            <td>60 seconds</td>
            <td>Provider outages produce hundreds of failures per minute — batch into one summary</td>
          </tr>
          <tr>
            <td><strong>Rate limit hits</strong></td>
            <td>None (immediate)</td>
            <td>Rare in normal operation — an immediate alert means a code bug is likely</td>
          </tr>
          <tr>
            <td><strong>Suppression spikes</strong></td>
            <td>5 minutes</td>
            <td>Gradual trend, not urgent — daily summary is often enough</td>
          </tr>
        </tbody>
      </table>
      <Code
        filename="lib/notifykit.ts"
        code={`import { slackAlertHooks } from "./hooks/slack-alerts"

export const notify = createNotifyKit({
  // ...
  on: mergeHooks(metricsHooks, errorHooks, slackAlertHooks),
})`}
      />
      <div className="callout callout-warn">
        <strong>Slack webhooks have a 1 message/second rate limit.</strong> Without
        debouncing, a 100-failure burst triggers 100 webhook calls — Slack throttles
        after the first, and your alerts arrive minutes late or get dropped entirely.
        The buffer pattern above guarantees at most 1 message per{" "}
        <code>DEBOUNCE_MS</code> window regardless of failure volume.
      </div>
      <div className="callout callout-tip">
        <strong>Swap the transport for any chat system.</strong> Replace the{" "}
        <code>fetch(SLACK_WEBHOOK, ...)</code> call with your preferred alerting
        destination — Discord webhooks, Microsoft Teams connectors, PagerDuty
        events API, or a custom internal alerting service. The debounce logic
        stays the same.
      </div>

      <h2>Testing hooks</h2>
      <p>
        Verify your hooks fire correctly without hitting real external services.
        Use a spy to capture hook calls:
      </p>
      <Code
        filename="tests/hooks.test.ts"
        code={`import { describe, it, expect, vi } from "vitest"
import { createNotifyKit, memoryAdapter, fakeEmailProvider } from "@notifykitjs/core"
import { commentMentioned } from "./notifications"

describe("hooks", () => {
  it("fires delivery.sent on successful email", async () => {
    const onSent = vi.fn()

    const notify = createNotifyKit({
      notifications: [commentMentioned] as const,
      database: memoryAdapter(),
      providers: { email: fakeEmailProvider() },
      on: { "delivery.sent": onSent },
    })

    await notify.upsertRecipient({ id: "u1", email: "test@test.com" })
    await notify.send({
      recipientId: "u1",
      notificationId: "comment_mentioned",
      payload: { actorName: "Rey", postUrl: "/p/1" },
    })

    expect(onSent).toHaveBeenCalledTimes(1)
    expect(onSent).toHaveBeenCalledWith(
      expect.objectContaining({
        delivery: expect.objectContaining({ channel: "email", status: "sent" }),
      })
    )
  })

  it("fires delivery.failed after retries exhaust", async () => {
    const onFailed = vi.fn()
    const failingProvider = { id: "broken", send: () => { throw new Error("down") } }

    const notify = createNotifyKit({
      notifications: [commentMentioned] as const,
      database: memoryAdapter(),
      providers: { email: failingProvider },
      retry: { maxAttempts: 2, delayMs: () => 0 },
      on: { "delivery.failed": onFailed },
    })

    await notify.upsertRecipient({ id: "u1", email: "test@test.com" })
    await notify.send({
      recipientId: "u1",
      notificationId: "comment_mentioned",
      payload: { actorName: "Rey", postUrl: "/p/1" },
    })

    expect(onFailed).toHaveBeenCalledTimes(1)
    expect(onFailed).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.any(Error),
        delivery: expect.objectContaining({ channel: "email" }),
      })
    )
  })
})`}
      />
      <div className="callout callout-tip">
        <strong>Use <code>memoryAdapter()</code> and <code>fakeEmailProvider()</code> in tests.</strong>{" "}
        They run entirely in-process with no I/O, so hooks fire synchronously
        and assertions are deterministic.
      </div>

      <div className="button-row">
        <Link href="/docs/timeline" className="primary">Timeline &amp; debugging</Link>
        <Link href="/docs/providers">Provider monitoring</Link>
        <Link href="/docs/api">API reference</Link>
      </div>

      <div className="page-nav">
        <Link href="/docs/timeline">
          <span className="page-nav-label">Previous</span>
          <span className="page-nav-title">Timeline</span>
        </Link>
        <Link href="/docs/api">
          <span className="page-nav-label">Next</span>
          <span className="page-nav-title">API reference</span>
        </Link>
      </div>
    </article>
  );
}

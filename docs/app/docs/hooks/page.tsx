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
        code={`// Minimal production setup — covers the 5 key signals:
on: {
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
      <div className="overview-flow">
        <div className="overview-flow-step">
          <span className="overview-flow-number">!</span>
          <div>
            <strong>Hooks should never break sends</strong>
            <p>Wrap every hook in try/catch or add <code>.catch()</code> to fire-and-forget promises. A notification that delivers but fails to log is better than one that fails entirely.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">⏱</span>
          <div>
            <strong>Keep hooks fast (&lt;50ms)</strong>
            <p>Awaited hooks add directly to <code>send()</code> latency. If your integration needs network calls, use fire-and-forget or batch into a local buffer that flushes on an interval.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">↻</span>
          <div>
            <strong>Never call send() inside a hook</strong>
            <p>This creates infinite recursion. If you need to trigger a follow-up notification, enqueue it via your job system — don&apos;t call <code>notify.send()</code> directly.</p>
          </div>
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
        code={`// lib/hooks/metrics.ts
export const metricsHooks = {
  "delivery.sent": ({ delivery }) => {
    metrics.inc("notifykit.sent", { channel: delivery.channel })
    metrics.histogram("notifykit.latency_ms",
      delivery.sentAt - delivery.createdAt, { channel: delivery.channel })
  },
  "delivery.failed": ({ delivery }) => {
    metrics.inc("notifykit.failed", { channel: delivery.channel })
  },
}

// lib/hooks/errors.ts
export const errorHooks = {
  "delivery.failed": ({ delivery, error }) => {
    sentry.captureException(error, {
      tags: { channel: delivery.channel, provider: delivery.provider },
      extra: { deliveryId: delivery.id, notificationId: delivery.notificationId },
    })
  },
}

// lib/hooks/audit.ts
export const auditHooks = {
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
        code={`// lib/notifykit.ts — merge hook sets
import { metricsHooks } from "./hooks/metrics"
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

      <h2>Testing hooks</h2>
      <p>
        Verify your hooks fire correctly without hitting real external services.
        Use a spy to capture hook calls:
      </p>
      <Code
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
      <div className="callout">
        <strong>Use <code>memoryAdapter()</code> and <code>fakeEmailProvider()</code> in tests.</strong>{" "}
        They run entirely in-process with no I/O, so hooks fire synchronously
        and assertions are deterministic.
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

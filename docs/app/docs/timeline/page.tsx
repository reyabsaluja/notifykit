import type { Metadata } from "next";
import Link from "next/link";
import { Code } from "../../_components/code";

export const metadata: Metadata = { title: "Timeline" };

export default function TimelinePage() {
  return (
    <article>
      <h1>Timeline</h1>
      <p>
        Every notification gets a debug timeline — a chronological log of
        every significant event from payload validation through final
        delivery. Use it to understand exactly what happened and why.
      </p>

      <div className="callout callout-tip">
        <strong>Think of it as <code>git log</code> for a notification.</strong>{" "}
        When a user reports &quot;I never got that email,&quot; pull the
        timeline and see exactly which step failed — was it preferences,
        quiet hours, a provider error, or something else entirely?
      </div>

      <h2>Enabling timeline</h2>
      <p>
        Timeline requires the <code>timeline</code> section in your database
        adapter. The Drizzle adapters include it by default. The memory
        adapter also supports it out of the box.
      </p>
      <p>
        No additional configuration is needed — timeline events are
        automatically recorded during every <code>send()</code>.
      </p>

      <h2>Reading the timeline</h2>
      <Code
        code={`// Get timeline for a specific notification send
const events = await notify.timeline(notificationRecordId)

// Get timeline for a specific delivery
const deliveryEvents = await notify.timeline(notificationRecordId, { deliveryId })

// Example output:
// [
//   { event: "payload.validated", message: "All 3 fields valid" },
//   { event: "recipient.resolved", message: "Recipient user_123 found" },
//   { event: "preferences.resolved", message: "inbox: allowed, email: allowed" },
//   { event: "inbox.created", message: "Inbox item inb_abc created" },
//   { event: "delivery.created", message: "Email delivery del_xyz queued" },
//   { event: "delivery.attempt", message: "Attempt 1 via resend" },
//   { event: "delivery.sent", message: "Sent via resend (msg_id: ...)" },
// ]`}
      />

      <h2>Event types</h2>
      <table>
        <thead>
          <tr>
            <th>Event</th>
            <th>When</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>payload.validated</code></td>
            <td>Payload passes schema validation</td>
          </tr>
          <tr>
            <td><code>recipient.resolved</code></td>
            <td>Recipient found in database</td>
          </tr>
          <tr>
            <td><code>preferences.resolved</code></td>
            <td>Channel preferences evaluated</td>
          </tr>
          <tr>
            <td><code>idempotent.replay</code></td>
            <td>Send matched an existing idempotency key</td>
          </tr>
          <tr>
            <td><code>deduplicated</code></td>
            <td>Send matched an existing dedup key</td>
          </tr>
          <tr>
            <td><code>rate_limited</code></td>
            <td>Send exceeded rate limit</td>
          </tr>
          <tr>
            <td><code>quiet_hours.deferred</code></td>
            <td>Delivery deferred to quiet hours end</td>
          </tr>
          <tr>
            <td><code>inbox.created</code></td>
            <td>Inbox item written</td>
          </tr>
          <tr>
            <td><code>delivery.created</code></td>
            <td>Delivery record queued</td>
          </tr>
          <tr>
            <td><code>delivery.attempt</code></td>
            <td>Provider call attempted</td>
          </tr>
          <tr>
            <td><code>delivery.sent</code></td>
            <td>Provider confirmed delivery</td>
          </tr>
          <tr>
            <td><code>delivery.failed</code></td>
            <td>Delivery failed after retries or a permanent error</td>
          </tr>
          <tr>
            <td><code>provider.message_id_stored</code></td>
            <td>Provider message ID recorded</td>
          </tr>
          <tr>
            <td><code>provider.error</code></td>
            <td>Provider returned an error (before retry)</td>
          </tr>
          <tr>
            <td><code>fallback.triggered</code></td>
            <td>Fallback rule activated</td>
          </tr>
          <tr>
            <td><code>channel.skipped</code></td>
            <td>Channel skipped (preferences, missing address)</td>
          </tr>
          <tr>
            <td><code>notification.suppressed</code></td>
            <td>All channels skipped — notification was suppressed</td>
          </tr>
        </tbody>
      </table>

      <h2>Timeline event structure</h2>
      <p>Each event in the array has these fields:</p>
      <table>
        <thead>
          <tr><th>Field</th><th>Description</th></tr>
        </thead>
        <tbody>
          <tr><td><code>event</code></td><td>Event type (see table above)</td></tr>
          <tr><td><code>message</code></td><td>Human-readable description of what happened</td></tr>
          <tr><td><code>channel</code></td><td>Which channel this relates to (if applicable)</td></tr>
          <tr><td><code>provider</code></td><td>Which provider was used (e.g. &quot;resend&quot;, &quot;twilio&quot;)</td></tr>
          <tr><td><code>deliveryId</code></td><td>Set for delivery-specific events — use to filter</td></tr>
          <tr><td><code>metadata</code></td><td>Arbitrary extra data (error messages, provider IDs, etc.)</td></tr>
          <tr><td><code>timestamp</code></td><td>When this event occurred</td></tr>
          <tr><td><code>seq</code></td><td>Ordering index within the same timestamp</td></tr>
        </tbody>
      </table>

      <h2>Debugging workflow</h2>
      <p>
        Most support tickets boil down to one question: &quot;Why didn&apos;t
        the user get the notification?&quot; Follow this triage flow:
      </p>
      <div className="overview-flow">
        <div className="overview-flow-step">
          <span className="overview-flow-number">1</span>
          <div>
            <strong>Find the notification record</strong>
            <p>Look up by recipient + time window, or by the idempotency key your app passed to <code>send()</code>.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">2</span>
          <div>
            <strong>Pull the timeline</strong>
            <p>Call <code>notify.timeline(recordId)</code>. The last event in the list is where the pipeline stopped or completed.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">3</span>
          <div>
            <strong>Match the last event to a cause</strong>
            <p>Use the table below to translate the timeline into a root cause and next action.</p>
          </div>
        </div>
      </div>
      <table>
        <thead>
          <tr><th>Last event you see</th><th>Root cause</th><th>Resolution</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><code>delivery.sent</code></td>
            <td>NotifyKit delivered successfully — issue is downstream</td>
            <td>Check spam folder, provider bounce logs, or recipient email validity</td>
          </tr>
          <tr>
            <td><code>delivery.failed</code></td>
            <td>Provider rejected after retries</td>
            <td>Read <code>metadata.error</code> — usually invalid address, rate limit, or provider outage</td>
          </tr>
          <tr>
            <td><code>channel.skipped</code></td>
            <td>Channel didn&apos;t fire — check the <code>reason</code> field</td>
            <td><code>preferences_disabled</code> → user opted out. <code>missing_address</code> → no email on file</td>
          </tr>
          <tr>
            <td><code>quiet_hours.deferred</code></td>
            <td>Email is waiting for quiet hours to end</td>
            <td>Not lost — will deliver at the specified time. Verify <code>flushScheduledSends()</code> is running</td>
          </tr>
          <tr>
            <td><code>deduplicated</code></td>
            <td>Dedup key matched within the window</td>
            <td>Intentional? Check if the key is too broad. Not a bug if it&apos;s suppressing duplicates correctly</td>
          </tr>
          <tr>
            <td><code>rate_limited</code></td>
            <td>Recipient hit their rate limit for this notification</td>
            <td>Expected protection. If the limit is too aggressive, increase <code>max</code> or widen the window</td>
          </tr>
          <tr>
            <td>Only <code>payload.validated</code></td>
            <td>Recipient not found — <code>upsertRecipient()</code> wasn&apos;t called</td>
            <td>Ensure the recipient exists before sending. Common in new user flows</td>
          </tr>
          <tr>
            <td>No record found at all</td>
            <td><code>send()</code> was never called for this user/event</td>
            <td>Check your trigger logic — the issue is upstream of NotifyKit</td>
          </tr>
        </tbody>
      </table>
      <div className="callout callout-tip">
        <strong>90% of &quot;didn&apos;t get it&quot; tickets are one of three things:</strong>{" "}
        user opted out (check <code>channel.skipped</code>), quiet hours deferred it
        (check <code>quiet_hours.deferred</code>), or provider rejected the address
        (check <code>delivery.failed</code> metadata). The timeline tells you which
        in seconds.
      </div>

      <h3>Example: email deferred by quiet hours</h3>
      <p>
        A user reports they never received an email. Pull the timeline:
      </p>
      <Code
        code={`const events = await notify.timeline(notificationRecordId)
// → [
//   { event: "payload.validated",     message: "All fields valid" },
//   { event: "recipient.resolved",    message: "Recipient user_456 found" },
//   { event: "preferences.resolved",  message: "inbox: allowed, email: allowed" },
//   { event: "quiet_hours.deferred",  message: "Email deferred until 08:00 EST" },
//   { event: "inbox.created",         message: "Inbox item created" },
// ]`}
      />
      <p>
        The answer: the email wasn&apos;t dropped — it was deferred by quiet
        hours. Check <code>quiet_hours.deferred</code> for when it will send.
      </p>

      <h2>Querying for incidents</h2>
      <p>
        Timeline is per-notification, but during incidents you need a broader
        view. Combine <code>deliveries.list()</code> with timeline to
        investigate:
      </p>
      <Code
        code={`// Find all failed deliveries in the last hour, then pull their timelines:
const oneHourAgo = new Date(Date.now() - 60 * 60_000)
const deliveries = await notify.deliveries.list()
const recentFailures = deliveries.filter(
  d => d.status === "failed" && d.failedAt && d.failedAt > oneHourAgo
)

// Pull timeline for each to understand WHY they failed:
for (const d of recentFailures.slice(0, 10)) {
  const events = await notify.timeline(d.notificationRecordId, { deliveryId: d.id })
  const errorEvent = events.find(e => e.event === "provider.error")
  console.log(\`\${d.channel} to \${d.recipientId}: \${errorEvent?.message ?? "unknown"}\`)
}`}
      />
      <div className="callout callout-tip">
        <strong>Build an admin endpoint.</strong> Wrap this pattern in an
        API route behind admin auth. When a provider goes down, you can
        quickly see how many users were affected, which channels failed, and
        whether fallbacks caught them — without touching the database directly.
      </div>

      <h2>Measuring delivery latency</h2>
      <p>
        Timeline timestamps let you compute how long each stage takes.
        Use this to spot slow providers or unexpected queuing:
      </p>
      <Code
        code={`// Compute end-to-end latency for recent sends
const records = await notify.notifications.list({ limit: 100 })

const latencies = await Promise.all(
  records.map(async (r) => {
    const events = await notify.timeline(r.id)
    const first = events[0]?.timestamp
    const sent = events.find(e => e.event === "delivery.sent")?.timestamp
    if (!first || !sent) return null
    return { id: r.id, channel: events.find(e => e.channel)?.channel, ms: sent - first }
  })
)

const valid = latencies.filter(Boolean)
const sorted = valid.sort((a, b) => a.ms - b.ms)
const p50 = sorted[Math.floor(sorted.length * 0.5)]?.ms
const p95 = sorted[Math.floor(sorted.length * 0.95)]?.ms

console.log(\`p50: \${p50}ms, p95: \${p95}ms\`)`}
      />
      <table>
        <thead>
          <tr><th>Channel</th><th>Healthy p95</th><th>Investigate if</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>Inbox</td>
            <td>&lt; 50ms</td>
            <td>&gt; 200ms — likely database contention or slow adapter</td>
          </tr>
          <tr>
            <td>Email (Resend)</td>
            <td>&lt; 500ms</td>
            <td>&gt; 2s — provider throttling or DNS resolution issues</td>
          </tr>
          <tr>
            <td>SMS (Twilio)</td>
            <td>&lt; 1s</td>
            <td>&gt; 3s — carrier queuing or account-level rate limits</td>
          </tr>
          <tr>
            <td>Webhook</td>
            <td>&lt; 300ms</td>
            <td>&gt; 5s — downstream endpoint is slow; consider async delivery</td>
          </tr>
        </tbody>
      </table>
      <div className="callout callout-warn">
        <strong>Alert on p95, not p50.</strong> A healthy median hides tail
        latency. If your p95 crosses the threshold for two consecutive
        intervals, page — it usually means the provider is degraded or your
        database connection pool is saturated.
      </div>

      <h2>Common timeline patterns</h2>
      <p>
        Match your timeline output against these patterns to quickly identify
        what happened:
      </p>
      <table>
        <thead>
          <tr><th>You see</th><th>What happened</th><th>Action</th></tr>
        </thead>
        <tbody>
          <tr><td><code>channel.skipped</code> with reason <code>preferences_disabled</code></td><td>User opted out of this channel</td><td>Expected behavior — no fix needed</td></tr>
          <tr><td><code>delivery.attempt</code> x3 then <code>delivery.failed</code></td><td>Provider is down or rejecting</td><td>Check provider dashboard, verify API key</td></tr>
          <tr><td><code>quiet_hours.deferred</code> with no later <code>delivery.sent</code></td><td>Flush hasn&apos;t run yet</td><td>Check your cron/interval for <code>flushScheduledSends()</code></td></tr>
          <tr><td><code>deduplicated</code> immediately after <code>payload.validated</code></td><td>Same dedup key sent within window</td><td>Verify dedup key design — may be too broad</td></tr>
          <tr><td><code>fallback.triggered</code> after <code>delivery.failed</code></td><td>Primary channel failed, fallback kicked in</td><td>Working as intended — user still got notified</td></tr>
          <tr><td>Only <code>payload.validated</code> then nothing</td><td>Recipient not found in database</td><td>Call <code>upsertRecipient()</code> before <code>send()</code></td></tr>
        </tbody>
      </table>

      <h2>Pruning old events</h2>
      <p>
        Timeline events accumulate over time. Prune them periodically to keep
        your database lean:
      </p>
      <table>
        <thead>
          <tr><th>Retention</th><th>Good for</th><th>Approximate rows (1k sends/day)</th></tr>
        </thead>
        <tbody>
          <tr><td>7 days</td><td>Active debugging only</td><td>~50k rows</td></tr>
          <tr><td>30 days</td><td>Most production apps</td><td>~200k rows</td></tr>
          <tr><td>90 days</td><td>Compliance/audit requirements</td><td>~600k rows</td></tr>
        </tbody>
      </table>
      <Code
        code={`// Delete events older than 30 days (run on a cron):
const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60_000)
const deleted = await notify.pruneTimeline(thirtyDaysAgo)
console.log(\`Pruned \${deleted} timeline events\`)`}
      />
      <div className="callout">
        <strong>Set <code>timelineRetentionMs</code> for auto-prune.</strong>{" "}
        When configured, calling <code>pruneTimeline()</code> with no arguments
        uses the configured retention window — no date math needed.
      </div>

      <h2>Building an admin timeline viewer</h2>
      <p>
        Support teams need to look up timelines by user or notification
        without touching the database. Build a simple API endpoint and
        render results in your admin panel:
      </p>
      <Code
        code={`// app/api/admin/timeline/route.ts
import { notify } from "@/lib/notifykit"
import { requireAdmin } from "@/lib/auth"

export async function GET(request: Request) {
  await requireAdmin(request)
  const url = new URL(request.url)
  const recordId = url.searchParams.get("id")!

  const events = await notify.timeline(recordId)

  // Group by phase for a clean display
  const phases = {
    validation: events.filter(e => e.event.startsWith("payload") || e.event.startsWith("recipient")),
    resolution: events.filter(e => e.event.includes("preferences") || e.event.includes("quiet_hours")),
    delivery: events.filter(e => e.event.startsWith("delivery") || e.event.startsWith("inbox")),
    fallback: events.filter(e => e.event.startsWith("fallback") || e.event === "channel.skipped"),
  }

  return Response.json({ events, phases, total: events.length })
}`}
      />
      <table>
        <thead>
          <tr><th>Display element</th><th>Source field</th><th>Rendering tip</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>Event icon/color</td>
            <td><code>event</code> type</td>
            <td>Green for <code>*.sent</code>, red for <code>*.failed</code>, yellow for <code>*.deferred</code></td>
          </tr>
          <tr>
            <td>Timestamp delta</td>
            <td><code>timestamp</code></td>
            <td>Show &quot;+120ms&quot; relative to the first event, not absolute time</td>
          </tr>
          <tr>
            <td>Provider badge</td>
            <td><code>provider</code></td>
            <td>Show which provider handled it (useful when you have fallbacks)</td>
          </tr>
          <tr>
            <td>Error details</td>
            <td><code>metadata</code></td>
            <td>Expand on click — contains raw error messages from providers</td>
          </tr>
          <tr>
            <td>Channel filter</td>
            <td><code>channel</code></td>
            <td>Let support filter to just email or just inbox events</td>
          </tr>
        </tbody>
      </table>
      <div className="callout callout-tip">
        <strong>Show relative timing, not absolute.</strong> A timeline that
        says &quot;+0ms → +3ms → +45ms → +2100ms&quot; instantly reveals where
        the latency is. Absolute timestamps (10:04:23.456) make you do math.
        Calculate: <code>event.timestamp - events[0].timestamp</code>.
      </div>

      <div className="page-nav">
        <Link href="/docs/explain">
          <span className="page-nav-label">Previous</span>
          <span className="page-nav-title">Explain & dry run</span>
        </Link>
        <Link href="/docs/hooks">
          <span className="page-nav-label">Next</span>
          <span className="page-nav-title">Hooks & observability</span>
        </Link>
      </div>
    </article>
  );
}

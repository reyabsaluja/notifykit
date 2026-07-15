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

      <h2>Quick triage</h2>
      <p>
        Most &quot;user didn&apos;t get it&quot; tickets fall into three
        patterns. Look at the <strong>last event</strong> in the timeline:
      </p>
      <div className="features">
        <div className="feature-card">
          <h3>channel.skipped</h3>
          <p>
            User opted out via preferences. Check{" "}
            <code>metadata.reason</code> — usually{" "}
            <code>preferences_disabled</code> or{" "}
            <code>missing_address</code>. Not a bug.
          </p>
        </div>
        <div className="feature-card">
          <h3>quiet_hours.deferred</h3>
          <p>
            Email is waiting — not lost. Will deliver at{" "}
            <code>metadata.resumesAt</code>. Verify{" "}
            <code>flushScheduledSends()</code> is running.
          </p>
        </div>
        <div className="feature-card">
          <h3>delivery.failed</h3>
          <p>
            Provider rejected after all retries. Read{" "}
            <code>metadata.error</code> — invalid address, rate
            limit, or provider outage.
          </p>
        </div>
      </div>
      <Code
        filename="scripts/triage.ts"
        code={`const events = await notify.timeline(recordId)
const last = events[events.length - 1]
console.log(last.event, last.message, last.metadata)`}
      />

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
      <p>
        Events are grouped by pipeline phase. When reading a timeline, events
        appear in this order — if the pipeline stops early (dedup, rate limit),
        later phases won&apos;t have entries.
      </p>

      <h3>Phase 1: Validation &amp; guards</h3>
      <table>
        <thead>
          <tr><th>Event</th><th>When</th><th>Pipeline continues?</th></tr>
        </thead>
        <tbody>
          <tr><td><code>payload.validated</code></td><td>Payload passes schema validation</td><td>Yes — always first</td></tr>
          <tr><td><code>recipient.resolved</code></td><td>Recipient found in database</td><td>Yes — pipeline proceeds</td></tr>
          <tr><td><code>idempotent.replay</code></td><td>Send matched an existing idempotency key</td><td><strong>No</strong> — returns cached result</td></tr>
          <tr><td><code>deduplicated</code></td><td>Send matched an existing dedup key within window</td><td><strong>No</strong> — send is dropped</td></tr>
          <tr><td><code>rate_limited</code></td><td>Send exceeded rate limit threshold</td><td><strong>No</strong> — send is dropped</td></tr>
        </tbody>
      </table>

      <h3>Phase 2: Resolution</h3>
      <table>
        <thead>
          <tr><th>Event</th><th>When</th><th>What it tells you</th></tr>
        </thead>
        <tbody>
          <tr><td><code>preferences.resolved</code></td><td>Channel preferences evaluated</td><td>Which channels are allowed vs disabled</td></tr>
          <tr><td><code>quiet_hours.deferred</code></td><td>Push channels deferred to quiet hours end</td><td>Delivery is scheduled, not lost</td></tr>
          <tr><td><code>channel.skipped</code></td><td>Channel skipped (preferences, missing address)</td><td>Check <code>metadata.reason</code> for the specific cause</td></tr>
          <tr><td><code>notification.suppressed</code></td><td>All channels skipped — nothing will deliver</td><td>Every channel was blocked — user won&apos;t see this</td></tr>
        </tbody>
      </table>

      <h3>Phase 3: Delivery</h3>
      <table>
        <thead>
          <tr><th>Event</th><th>When</th><th>What it tells you</th></tr>
        </thead>
        <tbody>
          <tr><td><code>inbox.created</code></td><td>Inbox item written to database</td><td>Pull channel delivered — instant, no retries</td></tr>
          <tr><td><code>delivery.created</code></td><td>Push delivery queued to provider</td><td>Job is in the queue, waiting for execution</td></tr>
          <tr><td><code>delivery.attempt</code></td><td>Provider call attempted (may appear multiple times)</td><td>Attempt number in <code>metadata</code></td></tr>
          <tr><td><code>delivery.sent</code></td><td>Provider confirmed successful delivery</td><td>Terminal success — notification reached the provider</td></tr>
          <tr><td><code>delivery.failed</code></td><td>All retries exhausted or permanent error</td><td>Terminal failure — check <code>metadata.error</code></td></tr>
        </tbody>
      </table>

      <h3>Phase 4: Provider details &amp; fallback</h3>
      <table>
        <thead>
          <tr><th>Event</th><th>When</th><th>What it tells you</th></tr>
        </thead>
        <tbody>
          <tr><td><code>provider.message_id_stored</code></td><td>Provider returned a message ID</td><td>Use to cross-reference in provider dashboard</td></tr>
          <tr><td><code>provider.error</code></td><td>Provider returned an error (before retry)</td><td>Raw error — may retry after this</td></tr>
          <tr><td><code>fallback.triggered</code></td><td>Primary channel failed, fallback rule activated</td><td>Which fallback rule matched and what channel fires next</td></tr>
        </tbody>
      </table>

      <div className="callout callout-tip">
        <strong>Quick rule:</strong> if the last event in a timeline is in Phase 1,
        the notification was blocked early (dedup/rate limit). If it&apos;s in
        Phase 2, a resolution issue stopped it (preferences/quiet hours). If it&apos;s
        in Phase 3, delivery was attempted — check whether it ended with{" "}
        <code>delivery.sent</code> (success) or <code>delivery.failed</code> (provider issue).
      </div>

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
        filename="scripts/incident-triage.ts"
        code={`const oneHourAgo = new Date(Date.now() - 60 * 60_000)
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
        filename="scripts/measure-latency.ts"
        code={`const deliveries = await notify.deliveries.list(undefined, undefined, 100)
const recordIds = [...new Set(deliveries.map(d => d.notificationRecordId))]

const latencies = await Promise.all(
  recordIds.map(async (id) => {
    const events = await notify.timeline(id)
    const first = events[0]?.timestamp
    const sent = events.find(e => e.event === "delivery.sent")?.timestamp
    if (!first || !sent) return null
    return { id, channel: events.find(e => e.channel)?.channel, ms: sent - first }
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
          <tr><th>Channel</th><th>Latency includes</th><th>Investigate against</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>Inbox</td>
            <td>Database write and realtime publication</td>
            <td>Your normal database p95 and product freshness SLO</td>
          </tr>
          <tr>
            <td>Email (Resend)</td>
            <td>DNS, TLS, provider API, and persistence</td>
            <td>Your provider&apos;s observed baseline and timeout</td>
          </tr>
          <tr>
            <td>SMS (custom provider)</td>
            <td>Provider API acceptance, not carrier delivery</td>
            <td>Your provider&apos;s observed baseline and rate limits</td>
          </tr>
          <tr>
            <td>Webhook</td>
            <td>DNS, TLS, and the downstream handler</td>
            <td>Your downstream service SLO and configured timeout</td>
          </tr>
        </tbody>
      </table>
      <div className="callout callout-warn">
        <strong>Alert on p95, not p50.</strong> A healthy median hides tail
        latency. Establish thresholds from real traffic and alert on sustained
        regression; a universal latency number would be misleading across
        different regions, providers, and database topologies.
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

      <h2>Testing with timeline assertions</h2>
      <p>
        Most notification tests assert on the outcome (&quot;delivered&quot; or
        &quot;skipped&quot;). Timeline lets you assert on the <em>path</em> —
        verifying <em>why</em> the engine made a decision, not just what it did.
        This catches subtle bugs: a notification that delivers for the wrong
        reason (e.g., <code>required: true</code> overriding a preference you
        thought was active).
      </p>
      <table>
        <thead>
          <tr><th>What you test</th><th>Outcome-only</th><th>Timeline assertion</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>Email delivered</td>
            <td>Passes — but can&apos;t tell if it was allowed by preferences or forced by <code>required</code></td>
            <td>Assert <code>preferences.resolved</code> shows <code>email: allowed</code></td>
          </tr>
          <tr>
            <td>Notification skipped</td>
            <td>Passes — but was it dedup, rate limit, or preferences?</td>
            <td>Assert the specific event (<code>deduplicated</code> vs <code>rate_limited</code>)</td>
          </tr>
          <tr>
            <td>Fallback fired</td>
            <td>Passes — but did the primary actually fail or was it skipped?</td>
            <td>Assert <code>delivery.failed</code> precedes <code>fallback.triggered</code></td>
          </tr>
        </tbody>
      </table>

      <h3>Pattern: assert pipeline path</h3>
      <Code
        filename="tests/pipeline-path.test.ts"
        code={`import { describe, it, expect } from "vitest"
import { notify } from "./test-setup"

describe("pipeline path verification", () => {
  it("delivers email through preferences (not forced)", async () => {
    const result = await notify.send({
      recipientId: "user_1",
      notificationId: "comment_mentioned",
      payload: { actorName: "Rey", postUrl: "/p/1" },
    })

    const events = await notify.timeline(result.id)

    // Verify preferences were consulted (not bypassed by required)
    const prefEvent = events.find(e => e.event === "preferences.resolved")
    expect(prefEvent).toBeDefined()
    expect(prefEvent!.message).toContain("email: allowed")

    // Verify no fallback was needed
    expect(events.find(e => e.event === "fallback.triggered")).toBeUndefined()

    // Verify delivery succeeded on first attempt
    const attempts = events.filter(e => e.event === "delivery.attempt")
    expect(attempts).toHaveLength(1)
  })

  it("skips for the RIGHT reason (dedup, not rate limit)", async () => {
    // First send
    await notify.send({
      recipientId: "user_1",
      notificationId: "comment_mentioned",
      payload: { actorName: "Rey", postUrl: "/p/1" },
      dedupeKey: "mention:p1:rey",
      dedupeWindowMs: 60_000,
    })

    // Second send — should be dedup, not rate limit
    const second = await notify.send({
      recipientId: "user_1",
      notificationId: "comment_mentioned",
      payload: { actorName: "Rey", postUrl: "/p/1" },
      dedupeKey: "mention:p1:rey",
      dedupeWindowMs: 60_000,
    })

    const events = await notify.timeline(second.id)
    expect(events.find(e => e.event === "deduplicated")).toBeDefined()
    expect(events.find(e => e.event === "rate_limited")).toBeUndefined()
  })

  it("fallback fires after primary failure (not preference skip)", async () => {
    // Configure provider to fail for this test
    const result = await notify.send({
      recipientId: "user_1",
      notificationId: "urgent_alert",
      payload: { message: "Server down" },
    })

    const events = await notify.timeline(result.id)
    const eventTypes = events.map(e => e.event)

    // Verify the sequence: attempt → fail → fallback
    const failIdx = eventTypes.indexOf("delivery.failed")
    const fallbackIdx = eventTypes.indexOf("fallback.triggered")
    expect(failIdx).toBeGreaterThan(-1)
    expect(fallbackIdx).toBeGreaterThan(failIdx)
  })
})`}
      />

      <h3>Helper: timeline matchers</h3>
      <p>
        For larger test suites, extract reusable matchers that keep tests
        readable:
      </p>
      <Code
        filename="tests/helpers/timeline.ts"
        code={`export function expectEventSequence(events, expectedTypes: string[]) {
  const types = events.map(e => e.event)
  let cursor = 0
  for (const expected of expectedTypes) {
    const idx = types.indexOf(expected, cursor)
    if (idx === -1) {
      throw new Error(
        \`Expected event "\${expected}" after position \${cursor}, \\n\` +
        \`but timeline only contains: [\${types.slice(cursor).join(", ")}]\`
      )
    }
    cursor = idx + 1
  }
}

export function expectNoEvent(events, eventType: string) {
  const found = events.find(e => e.event === eventType)
  if (found) {
    throw new Error(
      \`Expected no "\${eventType}" event, but found one: \${found.message}\`
    )
  }
}

// Usage:
const events = await notify.timeline(result.id)
expectEventSequence(events, [
  "payload.validated",
  "preferences.resolved",
  "delivery.sent",
])
expectNoEvent(events, "fallback.triggered")`}
      />
      <div className="callout callout-tip">
        <strong>Timeline tests catch &quot;works by accident&quot; bugs.</strong>{" "}
        A notification that delivers because <code>required: true</code> passes
        outcome tests — but if you meant it to respect preferences, a timeline
        assertion catches the misconfiguration immediately. Test the path, not
        just the destination.
      </div>

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
        filename="scripts/prune-timeline.ts"
        code={`const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60_000)
const deleted = await notify.pruneTimeline(thirtyDaysAgo)
console.log(\`Pruned \${deleted} timeline events\`)`}
      />
      <div className="callout callout-tip">
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
        filename="app/api/admin/timeline/route.ts"
        code={`import { notify } from "@/lib/notifykit"
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

      <div className="button-row">
        <Link href="/docs/explain" className="primary">Explain (predictive debugging)</Link>
        <Link href="/docs/hooks">Hooks &amp; observability</Link>
        <Link href="/docs/database">Database &amp; retention</Link>
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

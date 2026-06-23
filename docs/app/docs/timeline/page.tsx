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
      <Code
        code={`type TimelineEvent = {
  id: string
  seq: number                    // ordering within a batch
  notificationRecordId: string
  deliveryId?: string            // set for delivery-specific events
  recipientId: string
  tenantId?: string
  workspaceId?: string
  notificationId: string
  channel?: ChannelType          // "inbox" | "email" | "sms" | "webhook"
  provider?: string              // "resend", "twilio", etc.
  event: TimelineEventType
  message: string                // human-readable description
  metadata?: Record<string, unknown>
  timestamp: Date
}`}
      />

      <h2>Pruning old events</h2>
      <p>
        Timeline events accumulate over time. Prune them periodically:
      </p>
      <Code
        code={`// Delete events older than 30 days
const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60_000)
const deleted = await notify.pruneTimeline(thirtyDaysAgo)
console.log(\`Pruned \${deleted} timeline events\`)`}
      />

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

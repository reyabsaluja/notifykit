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
      <Code
        code={`await notify.upsertRecipient({
  id: string,
  email?: string,
  phone?: string,
  name?: string,
  quietHours?: QuietHours | null,
  tenantId?: string,
  organizationId?: string,
  workspaceId?: string,
})`}
      />

      <h2>notify.preferences</h2>
      <Code
        code={`// List all preferences for a recipient
await notify.preferences.list(recipientId, scope?)

// Get preference for a specific notification
await notify.preferences.get({ recipientId, notificationId, ...scope })

// Update a preference
await notify.preferences.update({
  recipientId,
  notificationId,
  channels: { email: false, inbox: true },
  ...scope,
})

// Explain preference resolution
await notify.preferences.explain({ recipientId, notificationId, ...scope })`}
      />

      <h2>notify.inbox</h2>
      <Code
        code={`// List inbox items for a recipient
await notify.inbox.list(recipientId, scope?, filter?, limit?)

// Mark one item as read
await notify.inbox.markReadForRecipient(itemId, recipientId, scope?)

// Mark all items as read
await notify.inbox.markAllRead(recipientId, scope?)

// Archive / unarchive
await notify.inbox.archiveForRecipient(itemId, recipientId, scope?)
await notify.inbox.unarchiveForRecipient(itemId, recipientId, scope?)

// Delete
await notify.inbox.deleteForRecipient(itemId, recipientId, scope?)

// Unread count
await notify.inbox.unreadCount(recipientId, scope?)`}
      />

      <h2>notify.deliveries</h2>
      <Code
        code={`// List deliveries (optionally filtered by recipient and scope)
await notify.deliveries.list(recipientId?, scope?, limit?)`}
      />

      <h2>notify.timeline(notificationRecordId, options?)</h2>
      <Code
        code={`// List timeline events for a notification
await notify.timeline(notificationRecordId)
await notify.timeline(notificationRecordId, { limit: 100 })

// List timeline events for a specific delivery
await notify.timeline(notificationRecordId, { deliveryId, limit: 50 })

// Prune old events (uses configured timelineRetentionMs if omitted)
await notify.pruneTimeline(olderThan)
await notify.pruneTimeline()`}
      />

      <h2>notify.drain()</h2>
      <p>
        Wait for all in-flight queue jobs to settle. Call before process
        shutdown to avoid losing pending deliveries.
      </p>

      <h2>notify.flushScheduledSends()</h2>
      <p>
        Fire all scheduled sends whose <code>scheduledFor</code> has passed.
        Returns the results of each fired send.
      </p>

      <h2>notify.flushDigests()</h2>
      <p>
        Flush all digest buckets whose window has expired. Returns the
        results of each flushed digest.
      </p>

      <h2>notify.redactPayload(notificationId, payload)</h2>
      <p>
        Returns a copy of the payload with fields in the notification&apos;s{" "}
        <code>redact</code> array replaced by <code>&quot;[REDACTED]&quot;</code>.
      </p>

      <h2>notify.notifications</h2>
      <p>
        Access registered notification definitions:
      </p>
      <Code
        code={`// Get all registered definitions
notify.notifications // readonly array

// Get metadata for the handler's public API
notify.notificationMetadata
// [{ id, channels, payload, category, description, required, classification }]`}
      />

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

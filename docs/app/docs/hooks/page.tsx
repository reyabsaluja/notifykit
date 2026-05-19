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

      <h2>Configuring hooks</h2>
      <Code
        code={`const notify = createNotifyKit({
  // ...
  on: {
    "notification.created": ({ notification, redactedPayload }) => {
      metrics.inc("notifications.created", {
        notificationId: notification.notificationId,
      })
    },

    "notification.rate_limited": ({ notificationId, recipientId, limit }) => {
      logger.warn("rate limited", { notificationId, recipientId, limit })
    },

    "notification.deduplicated": ({ notificationId, recipientId, dedupeKey }) => {
      logger.info("deduplicated", { notificationId, recipientId, dedupeKey })
    },

    "inbox.created": ({ inboxItem }) => {
      metrics.inc("inbox.created")
    },

    "inbox.updated": ({ inboxItem }) => {
      // fired on markRead, archive, unarchive
    },

    "inbox.deleted": ({ itemId, recipientId }) => {
      audit.log("inbox.deleted", { itemId, recipientId })
    },

    "inbox.all_read": ({ recipientId, count }) => {
      metrics.inc("inbox.mark_all_read", { count })
    },

    "delivery.sent": ({ delivery, redactedPayload }) => {
      metrics.inc("delivery.sent", {
        channel: delivery.channel,
        provider: delivery.provider,
      })
    },

    "delivery.failed": ({ delivery, error, redactedPayload }) => {
      metrics.inc("delivery.failed", {
        channel: delivery.channel,
        provider: delivery.provider,
      })
      sentry.captureException(error, {
        extra: { deliveryId: delivery.id, channel: delivery.channel },
      })
    },

    "notification.suppressed": ({ notificationId, recipientId, skipped }) => {
      // All channels were skipped — notification had no effect
      logger.info("suppressed", { notificationId, recipientId, skipped })
    },
  },
})`}
      />

      <h2>Available hooks</h2>
      <table>
        <thead>
          <tr>
            <th>Hook</th>
            <th>Fires when</th>
            <th>Context</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>notification.created</code></td>
            <td>A notification record is written</td>
            <td><code>notification</code>, <code>redactedPayload</code></td>
          </tr>
          <tr>
            <td><code>notification.deduplicated</code></td>
            <td>Send skipped by dedup</td>
            <td><code>notificationId</code>, <code>recipientId</code>, <code>dedupeKey</code>, <code>windowMs</code></td>
          </tr>
          <tr>
            <td><code>notification.rate_limited</code></td>
            <td>Send dropped by rate limit</td>
            <td><code>notificationId</code>, <code>recipientId</code>, <code>limit</code></td>
          </tr>
          <tr>
            <td><code>notification.suppressed</code></td>
            <td>All channels skipped</td>
            <td><code>notificationId</code>, <code>recipientId</code>, <code>skippedChannels</code>, <code>skipped</code></td>
          </tr>
          <tr>
            <td><code>inbox.created</code></td>
            <td>Inbox item written</td>
            <td><code>inboxItem</code></td>
          </tr>
          <tr>
            <td><code>inbox.updated</code></td>
            <td>Inbox item marked read/archived/unarchived</td>
            <td><code>inboxItem</code></td>
          </tr>
          <tr>
            <td><code>inbox.archived</code></td>
            <td>Inbox item archived</td>
            <td><code>inboxItem</code></td>
          </tr>
          <tr>
            <td><code>inbox.unarchived</code></td>
            <td>Inbox item unarchived</td>
            <td><code>inboxItem</code></td>
          </tr>
          <tr>
            <td><code>inbox.deleted</code></td>
            <td>Inbox item deleted</td>
            <td><code>itemId</code>, <code>recipientId</code></td>
          </tr>
          <tr>
            <td><code>inbox.all_read</code></td>
            <td>markAllRead() called</td>
            <td><code>recipientId</code>, <code>count</code></td>
          </tr>
          <tr>
            <td><code>delivery.sent</code></td>
            <td>Provider confirmed delivery</td>
            <td><code>delivery</code>, <code>redactedPayload</code></td>
          </tr>
          <tr>
            <td><code>delivery.failed</code></td>
            <td>All retries exhausted</td>
            <td><code>delivery</code>, <code>error</code>, <code>redactedPayload</code></td>
          </tr>
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

      <h2>Payload redaction</h2>
      <p>
        Hooks that expose payload data receive <code>redactedPayload</code>{" "}
        — a copy with sensitive fields (declared in the notification&apos;s{" "}
        <code>redact</code> array) replaced by <code>&quot;[REDACTED]&quot;</code>.
        This makes it safe to pipe hook data directly into external systems
        without leaking PII.
      </p>

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

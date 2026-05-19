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

      <h2>SendResult</h2>
      <p>
        The result tells you exactly what happened:
      </p>
      <Code
        code={`type SendResult = {
  notification: NotificationRecord | null  // null if buffered/rate-limited
  inboxItems: InboxItem[]                  // inbox rows written
  deliveries: DeliveryRecord[]             // email/webhook/sms delivery records
  skippedChannels: SkippedDelivery[]       // channels skipped by preferences
  deferredChannels: Array<{ channel; resumesAt }> // quiet hours deferrals
  digested: boolean                        // true if buffered into digest
  rateLimited: boolean                     // true if rate limit hit
  deduplicated: boolean                    // true if dedup key matched
  idempotentReplay: boolean                // true if idempotency key matched
}`}
      />

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
      <p>
        By default, <code>send()</code> runs provider deliveries
        synchronously. Swap in <code>setTimeoutQueue()</code> — or your own
        — to return instantly and run deliveries later.
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
      <p>
        Recipients with quiet hours configured get push-style channels
        (email, SMS, webhook) deferred until the window ends. Inbox still
        delivers immediately.
      </p>
      <Code
        code={`await notify.upsertRecipient({
  id: user.id,
  email: user.email,
  quietHours: {
    start: "22:00",
    end: "08:00",
    timezone: "America/New_York",
  },
})`}
      />
      <p>
        See <Link href="/docs/quiet-hours">Quiet hours</Link> for details on
        flushing scheduled sends.
      </p>

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

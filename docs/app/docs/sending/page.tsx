import type { Metadata } from "next";
import Link from "next/link";

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
      <pre>
        <code>{`await notify.upsertRecipient({
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
})`}</code>
      </pre>
      <p>
        <code>result</code> tells you exactly what happened:
      </p>
      <ul>
        <li>
          <code>notification</code> — the created notification record, or{" "}
          <code>null</code> if the send was buffered or rate-limited.
        </li>
        <li>
          <code>inboxItems</code> — inbox rows that were written.
        </li>
        <li>
          <code>deliveries</code> — email/webhook delivery rows. When using
          the inline queue (default) their status is already{" "}
          <code>&quot;sent&quot;</code> or <code>&quot;failed&quot;</code>; with an async
          queue they&apos;re still <code>&quot;pending&quot;</code>.
        </li>
        <li>
          <code>skippedChannels</code> — channels skipped by preferences.
        </li>
        <li>
          <code>deferredChannels</code> — channels deferred by quiet hours.
        </li>
        <li>
          <code>digested</code>, <code>rateLimited</code> — boolean flags for
          the two interceptor outcomes.
        </li>
      </ul>

      <h2>Type safety</h2>
      <p>These all fail at <em>compile time</em>, not at runtime:</p>
      <pre>
        <code>{`// ❌ Unknown notification id
await notify.send({
  recipientId: "u_1",
  notificationId: "wrong_id",  // error: not assignable
  payload: {},
})

// ❌ Wrong payload shape
await notify.send({
  recipientId: "u_1",
  notificationId: "comment_mentioned",
  payload: { actorName: 42 },  // error: number is not a string
})`}</code>
      </pre>

      <h2>Inline vs async queue</h2>
      <p>
        By default <code>send()</code> runs provider deliveries
        synchronously (same as your API route). Swap in{" "}
        <code>setTimeoutQueue()</code> — or your own — to return from{" "}
        <code>send()</code> instantly and have deliveries run later.
      </p>
      <pre>
        <code>{`import { setTimeoutQueue } from "@notifykitjs/core"

const notify = createNotifyKit({
  // ...
  queue: setTimeoutQueue(),
  retry: { maxAttempts: 5, delayMs: (n) => 500 * 2 ** (n - 1) },
})

// Wait for in-flight jobs before shutdown:
await notify.drain()`}</code>
      </pre>

      <h2>Hooks: observability</h2>
      <p>
        Every interesting moment fires a hook. Pipe them to your metrics or
        audit log.
      </p>
      <pre>
        <code>{`createNotifyKit({
  // ...
  on: {
    "notification.created": ({ notification }) => log("created", notification.id),
    "notification.rate_limited": ({ notificationId, recipientId }) =>
      metrics.inc("notifications.rate_limited", { notificationId, recipientId }),
    "inbox.created":    ({ inboxItem }) => log("inbox", inboxItem.id),
    "delivery.sent":    ({ delivery }) => metrics.inc("email.sent"),
    "delivery.failed":  ({ delivery, error }) => log.error("email.failed", { delivery, error }),
  },
})`}</code>
      </pre>

      <h2>Quiet hours</h2>
      <p>
        Attach to a recipient. Inbox still delivers immediately (it&apos;s
        user-pulled, not push). Email, SMS, and webhook defer until the window
        ends.
      </p>
      <pre>
        <code>{`await notify.upsertRecipient({
  id: user.id,
  email: user.email,
  quietHours: {
    start: "22:00",
    end:   "08:00",
    timezone: "America/New_York",
  },
})`}</code>
      </pre>
      <p>
        <code>notify.flushScheduledSends()</code> forces pending deferrals
        to fire now — useful for tests and for an admin &quot;send now&quot;
        button.
      </p>

      <p>
        Next: <Link href="/docs/preferences">Preferences &amp; unsubscribe →</Link>
      </p>
    </article>
  );
}

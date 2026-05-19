import type { Metadata } from "next";
import Link from "next/link";
import { Code } from "../../_components/code";

export const metadata: Metadata = { title: "Digests & rate limits" };

export default function DigestsPage() {
  return (
    <article>
      <h1>Digests &amp; rate limits</h1>
      <p>
        Noisy notifications are the fastest way to lose users. Digests
        coalesce multiple sends into one. Rate limits hard-cap delivery.
        Both are configured per-notification with two fields.
      </p>

      <h2>Digests</h2>
      <p>
        A digest accumulates sends within a rolling time window and
        flushes them as a single notification. Use it when the same event
        can fire many times in quick succession (comments, likes, updates).
      </p>
      <Code
        code={`notification({
  id: "new_comments",
  payload: {
    actorName: "string",
    postTitle: "string",
    count: "number",
  },
  channels: [
    inbox({ title: "{{count}} new comments on {{postTitle}}" }),
    email({
      subject: "{{count}} new comments on {{postTitle}}",
      body: "Latest from {{actorName}}. Open the post to read them all.",
    }),
  ],
  digest: {
    // Buffer sends for 5 minutes before flushing
    windowMs: 5 * 60_000,

    // Group by post — different posts get separate digests
    key: ({ payload }) => payload.postTitle,

    // Combine buffered payloads into one final payload
    render: ({ payloads, count }) => ({
      actorName: payloads[payloads.length - 1]!.actorName,
      postTitle: payloads[0]!.postTitle,
      count,
    }),
  },
})`}
      />

      <h3>How it works</h3>
      <ol>
        <li>
          First send within a window creates a buffer entry with{" "}
          <code>flushAt = now + windowMs</code>.
        </li>
        <li>
          Subsequent sends with the same digest key append their payload to the
          buffer. No notification is created yet.
        </li>
        <li>
          When the window expires, the engine calls <code>render()</code> with
          all accumulated payloads, then executes a normal send with the
          rendered result.
        </li>
      </ol>

      <div className="callout callout-tip">
        <strong>Digest key scoping.</strong> The digest key function only
        controls grouping within the same (recipientId, notificationId, scope)
        boundary. Two different recipients always get separate digests.
      </div>

      <h3>Flush scheduling</h3>
      <p>
        The engine schedules a <code>setTimeout</code> to flush each bucket
        when using <code>setTimeoutQueue()</code>. With external queues
        (BullMQ, SQS), you&apos;re responsible for calling{" "}
        <code>notify.flushDigests()</code> on a timer.
      </p>

      <h2>Rate limits</h2>
      <p>
        A rate limit drops sends that exceed a threshold within a sliding
        window. Unlike digests, dropped sends are gone — they&apos;re not
        buffered.
      </p>
      <Code
        code={`notification({
  id: "comment_mentioned",
  payload: { actorName: "string", postUrl: "string" },
  channels: [inbox({ title: "{{actorName}} mentioned you" })],
  rateLimit: {
    max: 20,              // at most 20 sends...
    windowMs: 60 * 60_000, // ...per hour
    scope: "recipient",    // per-recipient (default)
  },
})`}
      />

      <h3>Scope options</h3>
      <table>
        <thead>
          <tr>
            <th>Scope</th>
            <th>Counts</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>&quot;recipient&quot;</code> (default)</td>
            <td>Sends to the same recipient for this notification</td>
          </tr>
          <tr>
            <td><code>&quot;global&quot;</code></td>
            <td>All sends for this notification across all recipients</td>
          </tr>
        </tbody>
      </table>

      <h3>Evaluation order</h3>
      <div className="callout">
        <strong>Rate limit runs before digest.</strong> If a send exceeds the
        limit, it&apos;s dropped before it ever enters the digest buffer. This
        prevents attackers from flooding a user&apos;s digest bucket.
      </div>

      <h2>Combining both</h2>
      <Code
        code={`notification({
  id: "activity_feed",
  payload: { summary: "string", count: "number" },
  channels: [inbox({ title: "{{count}} new activities" })],
  // Hard cap: no more than 100 raw sends per hour
  rateLimit: { max: 100, windowMs: 60 * 60_000 },
  // Of the ones that pass, batch into 10-minute digests
  digest: {
    windowMs: 10 * 60_000,
    render: ({ payloads, count }) => ({
      summary: \`\${count} things happened\`,
      count,
    }),
  },
})`}
      />

      <div className="page-nav">
        <Link href="/docs/preferences">
          <span className="page-nav-label">Previous</span>
          <span className="page-nav-title">Preferences & unsubscribe</span>
        </Link>
        <Link href="/docs/quiet-hours">
          <span className="page-nav-label">Next</span>
          <span className="page-nav-title">Quiet hours</span>
        </Link>
      </div>
    </article>
  );
}

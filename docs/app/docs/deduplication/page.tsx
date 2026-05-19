import type { Metadata } from "next";
import Link from "next/link";
import { Code } from "../../_components/code";

export const metadata: Metadata = { title: "Deduplication & idempotency" };

export default function DeduplicationPage() {
  return (
    <article>
      <h1>Deduplication &amp; idempotency</h1>
      <p>
        Two distinct mechanisms prevent duplicate notifications. They solve
        different problems and can be used together.
      </p>

      <h2>Deduplication (semantic)</h2>
      <p>
        Prevents semantically identical notifications within a time window.
        Example: &quot;user X mentioned you&quot; shouldn&apos;t fire twice if
        two code paths trigger it for the same mention.
      </p>
      <Code
        code={`await notify.send({
  recipientId: user.id,
  notificationId: "comment_mentioned",
  payload: { actorName: "Rey", postUrl: "/posts/42" },
  dedupeKey: "mention:post_42:user_rey",
  dedupeWindowMs: 5 * 60_000, // 5 minutes
})`}
      />
      <p>
        The composite key is scoped to <code>(dedupeKey, notificationId,
        recipientId)</code>. The first send within the window succeeds; any
        subsequent send with the same composite key is skipped with reason{" "}
        <code>&quot;duplicate&quot;</code>.
      </p>

      <h3>Dedup result</h3>
      <Code
        code={`const result = await notify.send({ ... dedupeKey, dedupeWindowMs })

if (result.deduplicated) {
  // send was skipped — no notification created
  console.log("duplicate within window")
}`}
      />

      <h2>Idempotency (retry-safe)</h2>
      <p>
        Prevents the same API call from being processed twice. Use when your
        caller might retry (network timeout, worker crash). The same logical
        operation returns the original result on replay.
      </p>
      <Code
        code={`await notify.send({
  recipientId: user.id,
  notificationId: "order_shipped",
  payload: { orderNumber: "ORD-123", trackingUrl: "..." },
  idempotencyKey: "ship:ORD-123",
})`}
      />
      <p>
        The composite key is <code>(idempotencyKey, notificationId,
        recipientId)</code>. A duplicate call within the TTL window returns
        the original <code>NotificationRecord</code> without re-processing.
      </p>

      <h3>TTL</h3>
      <p>
        Idempotency keys expire after a configurable TTL (default: 24 hours).
        After expiry, the same key can be reused.
      </p>
      <Code
        code={`createNotifyKit({
  // ...
  idempotencyKeyTtlMs: 48 * 60 * 60_000, // 48 hours
})`}
      />

      <h2>Comparison</h2>
      <table>
        <thead>
          <tr>
            <th></th>
            <th>Deduplication</th>
            <th>Idempotency</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Purpose</strong></td>
            <td>Prevent same logical event from notifying twice</td>
            <td>Make retries safe</td>
          </tr>
          <tr>
            <td><strong>Key</strong></td>
            <td><code>dedupeKey</code> (caller-provided)</td>
            <td><code>idempotencyKey</code> (caller-provided)</td>
          </tr>
          <tr>
            <td><strong>Window</strong></td>
            <td><code>dedupeWindowMs</code> (per-call)</td>
            <td><code>idempotencyKeyTtlMs</code> (global config)</td>
          </tr>
          <tr>
            <td><strong>On duplicate</strong></td>
            <td>Skip entirely, no record created</td>
            <td>Return the existing notification record</td>
          </tr>
          <tr>
            <td><strong>Skip reason</strong></td>
            <td><code>&quot;duplicate&quot;</code></td>
            <td><code>&quot;idempotent_replay&quot;</code></td>
          </tr>
        </tbody>
      </table>

      <h2>Using both together</h2>
      <Code
        code={`await notify.send({
  recipientId: user.id,
  notificationId: "comment_mentioned",
  payload: { actorName: "Rey", postUrl: "/posts/42" },
  // Semantic dedup: don't notify about the same mention twice
  dedupeKey: "mention:post_42:user_rey",
  dedupeWindowMs: 10 * 60_000,
  // Retry safety: if this exact call retries, return the original
  idempotencyKey: "job:abc123",
})`}
      />
      <p>
        Evaluation order: idempotency check runs first. If the key already
        exists, the original result is returned. If not, dedup check runs.
        If the dedup key exists, the send is skipped.
      </p>

      <div className="page-nav">
        <Link href="/docs/quiet-hours">
          <span className="page-nav-label">Previous</span>
          <span className="page-nav-title">Quiet hours</span>
        </Link>
        <Link href="/docs/fallbacks">
          <span className="page-nav-label">Next</span>
          <span className="page-nav-title">Fallback channels</span>
        </Link>
      </div>
    </article>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { Code } from "../../_components/code";

export const metadata: Metadata = { title: "Explain & dry run" };

export default function ExplainPage() {
  return (
    <article>
      <h1>Explain &amp; dry run</h1>
      <p>
        Before sending, you can ask NotifyKit exactly what <em>would</em>{" "}
        happen. The <code>explain()</code> method (and its <code>dryRun</code>{" "}
        equivalent) returns a full <code>DeliveryExplanation</code> without
        writing any records or triggering any deliveries.
      </p>

      <h2>Using explain()</h2>
      <Code
        code={`const explanation = await notify.explain({
  recipientId: user.id,
  notificationId: "comment_mentioned",
  payload: { actorName: "Rey", postTitle: "Launch Plan", postUrl: "/posts/42" },
})

console.log(explanation)`}
      />

      <h2>Using dryRun</h2>
      <p>
        Alternatively, pass <code>dryRun: true</code> to <code>send()</code>:
      </p>
      <Code
        code={`const explanation = await notify.send({
  recipientId: user.id,
  notificationId: "comment_mentioned",
  payload: { actorName: "Rey", postTitle: "Launch Plan", postUrl: "/posts/42" },
  dryRun: true,
})`}
      />
      <p>
        Both are identical. There&apos;s also a <code>notify.check()</code>{" "}
        alias that reads better in some contexts.
      </p>

      <h2>DeliveryExplanation shape</h2>
      <Code
        code={`type DeliveryExplanation = {
  recipientId: string
  notificationId: string
  scope?: SecurityScope
  channels: Array<ChannelResolution & { outcome: ChannelOutcome }>
  required: boolean
  classification?: "transactional" | "product" | "marketing"
  category?: string
  payloadValidation: { valid: boolean; fields: PayloadFieldError[] }
  wouldReplayIdempotent: boolean
  wouldDeduplicate: boolean
  wouldRateLimit: boolean
  wouldDigest: boolean
  idempotency: { key: string; existingNotificationId: string; ttlMs: number } | null
  dedupe: { key: string; windowMs: number } | null
  rateLimit: { current: number; max: number; windowMs: number } | null
  digest: { windowMs: number } | null
  quietHours: { active: boolean; resumesAt: Date | null } | null
}`}
      />

      <h2>Channel outcomes</h2>
      <p>
        Each channel in the explanation has an <code>outcome</code> field:
      </p>
      <table>
        <thead>
          <tr>
            <th>Outcome</th>
            <th>Meaning</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>&quot;deliver&quot;</code></td>
            <td>Would be delivered normally</td>
          </tr>
          <tr>
            <td><code>&quot;disabled&quot;</code></td>
            <td>Disabled by user preferences</td>
          </tr>
          <tr>
            <td><code>&quot;unavailable&quot;</code></td>
            <td>Recipient lacks destination (no email/phone)</td>
          </tr>
          <tr>
            <td><code>&quot;invalid_payload&quot;</code></td>
            <td>Payload validation would fail</td>
          </tr>
          <tr>
            <td><code>&quot;idempotent&quot;</code></td>
            <td>Would replay an existing send</td>
          </tr>
          <tr>
            <td><code>&quot;deduplicated&quot;</code></td>
            <td>Would be deduplicated</td>
          </tr>
          <tr>
            <td><code>&quot;rate_limited&quot;</code></td>
            <td>Would exceed rate limit</td>
          </tr>
          <tr>
            <td><code>&quot;digested&quot;</code></td>
            <td>Would be buffered into a digest</td>
          </tr>
          <tr>
            <td><code>&quot;delayed&quot;</code></td>
            <td>Would be deferred by quiet hours</td>
          </tr>
        </tbody>
      </table>

      <h2>Preference resolution trail</h2>
      <p>
        Each channel also includes the full preference resolution trail —
        every layer that was consulted and what value it returned:
      </p>
      <Code
        code={`// explanation.channels[0].trail:
[
  { layer: "app_default", value: true },
  { layer: "notification_default", value: undefined },
  { layer: "tenant_setting", value: undefined },
  { layer: "user_notification", value: false },  // ← user disabled it
]
// resolvedBy: "user_notification"
// allowed: false`}
      />

      <h2>Preferences explain</h2>
      <p>
        For a focused view on just preference resolution (without the full
        delivery pipeline):
      </p>
      <Code
        code={`const prefExplanation = await notify.preferences.explain({
  recipientId: user.id,
  notificationId: "comment_mentioned",
})

// Returns PreferenceExplanation with channels, resolution trails,
// required status, classification, and category info.`}
      />

      <h2>Use cases</h2>
      <ul>
        <li>
          <strong>Debugging</strong> — &quot;Why didn&apos;t this user get an
          email?&quot; Run explain and check the preference trail.
        </li>
        <li>
          <strong>Admin tooling</strong> — Show operators what would happen
          before they trigger a broadcast.
        </li>
        <li>
          <strong>Testing</strong> — Assert expected behavior without
          actually sending.
        </li>
        <li>
          <strong>Preference UIs</strong> — Show users the effect of their
          settings in real time.
        </li>
      </ul>

      <div className="page-nav">
        <Link href="/docs/security">
          <span className="page-nav-label">Previous</span>
          <span className="page-nav-title">Security model</span>
        </Link>
        <Link href="/docs/timeline">
          <span className="page-nav-label">Next</span>
          <span className="page-nav-title">Timeline</span>
        </Link>
      </div>
    </article>
  );
}

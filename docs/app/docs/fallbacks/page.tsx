import type { Metadata } from "next";
import Link from "next/link";
import { Code } from "../../_components/code";

export const metadata: Metadata = { title: "Fallback channels" };

export default function FallbacksPage() {
  return (
    <article>
      <h1>Fallback channels</h1>
      <p>
        When a primary channel fails after all retries, a fallback catches
        the notification so it&apos;s never silently lost. Fallbacks also
        trigger when a recipient lacks a destination address or when a
        channel is skipped by preferences.
      </p>

      <h2>Simple inbox fallback</h2>
      <p>
        The simplest pattern: if email fails, drop an inbox item so the user
        still sees the notification.
      </p>
      <Code
        code={`notification({
  id: "password_reset",
  payload: { resetUrl: "string" },
  channels: [
    email({
      subject: "Reset your password",
      body: "Click here: {{resetUrl}}",
    }),
  ],
  fallback: inbox({
    title: "Password reset (email delivery failed)",
    body: "Open {{resetUrl}} to reset your password.",
  }),
})`}
      />

      <h2>Rule-based fallbacks</h2>
      <p>
        For more control, pass an array of rules. Each rule specifies a
        trigger condition and a target channel:
      </p>
      <Code
        code={`notification({
  id: "security_alert",
  payload: { event: "string", ip: "string" },
  channels: [
    email({ subject: "Security alert: {{event}}", body: "From IP {{ip}}" }),
    sms({ body: "Security alert: {{event}} from {{ip}}" }),
  ],
  fallback: [
    // If email fails, try SMS
    { if: "channel.failed", from: "email", then: sms({ body: "Security: {{event}}" }) },
    // If SMS also fails, at least write to inbox
    { if: "channel.failed", from: "sms", then: inbox({ title: "Security: {{event}}" }) },
    // If recipient has no email address, go straight to SMS
    { if: "missing_address", from: "email", then: sms({ body: "Security: {{event}}" }) },
  ],
})`}
      />

      <h2>Trigger conditions</h2>
      <table>
        <thead>
          <tr>
            <th>Trigger</th>
            <th>Fires when</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>&quot;channel.failed&quot;</code></td>
            <td>A channel exhausts all retry attempts</td>
          </tr>
          <tr>
            <td><code>&quot;missing_address&quot;</code></td>
            <td>Recipient lacks the destination (no email, no phone)</td>
          </tr>
          <tr>
            <td><code>&quot;skipped&quot;</code></td>
            <td>Channel was skipped by preferences</td>
          </tr>
        </tbody>
      </table>

      <h3>The <code>from</code> field</h3>
      <p>
        Optionally scope the rule to a specific source channel. Without{" "}
        <code>from</code>, the rule matches any channel that hits the trigger
        condition.
      </p>

      <h2>Fallback and retries</h2>
      <p>
        Fallback triggers after all retries are exhausted, or after a provider
        returns a permanent error. The timeline shows the full sequence:
      </p>
      <Code
        code={`// Timeline for a failed email with inbox fallback:
// 1. delivery.created    — email queued
// 2. delivery.attempt    — attempt 1 failed
// 3. delivery.attempt    — attempt 2 failed
// 4. delivery.attempt    — attempt 3 failed (terminal)
// 5. delivery.failed     — email marked failed
// 6. fallback.triggered  — fallback rule matched
// 7. inbox.created       — fallback inbox item written`}
        lang="plaintext"
      />

      <h2>Interactions</h2>
      <ul>
        <li>
          Fallback channels respect preferences. If the fallback targets inbox
          and the user has inbox disabled for this notification, it&apos;s skipped.
        </li>
        <li>
          <code>required: true</code> notifications bypass preference checks on
          fallback channels too.
        </li>
        <li>
          Fallback deliveries appear in the timeline and are tracked like any
          other delivery.
        </li>
      </ul>

      <div className="page-nav">
        <Link href="/docs/deduplication">
          <span className="page-nav-label">Previous</span>
          <span className="page-nav-title">Dedup & idempotency</span>
        </Link>
        <Link href="/docs/nextjs">
          <span className="page-nav-label">Next</span>
          <span className="page-nav-title">Next.js</span>
        </Link>
      </div>
    </article>
  );
}

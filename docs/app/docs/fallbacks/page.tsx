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

      <div className="callout callout-tip">
        <strong>When to use fallbacks.</strong> Any notification that
        <em> must</em> reach the user — password resets, security alerts,
        payment confirmations. If email fails, at least put it in the inbox.
        If SMS fails, try email. Never let a critical notification vanish.
      </div>

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

      <h2>Choosing a fallback strategy</h2>
      <p>
        Not every notification needs a fallback. Walk through these questions
        to decide if and how to configure one:
      </p>
      <div className="overview-flow">
        <div className="overview-flow-step">
          <span className="overview-flow-number">?</span>
          <div>
            <strong>Is delivery failure acceptable?</strong>
            <p>Marketing, social updates, digests — if the user misses one, it&apos;s fine. <strong>Skip the fallback.</strong></p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">?</span>
          <div>
            <strong>One backup channel or a cascade?</strong>
            <p>Most cases need one backup (email → inbox). Security-critical alerts may need a full cascade (email → SMS → inbox).</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">?</span>
          <div>
            <strong>Should fallback bypass preferences?</strong>
            <p>If yes, add <code>required: true</code> to the notification. Without it, fallbacks still respect user opt-outs.</p>
          </div>
        </div>
      </div>
      <table>
        <thead>
          <tr><th>Notification type</th><th>Recommended strategy</th><th>Why</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>Password reset, 2FA code</td>
            <td>Simple fallback + <code>required: true</code></td>
            <td>Must reach user regardless of preferences. One fallback is enough.</td>
          </tr>
          <tr>
            <td>Security alert (suspicious login)</td>
            <td>Rule-based cascade</td>
            <td>Try every available channel in priority order. User safety depends on delivery.</td>
          </tr>
          <tr>
            <td>Payment receipt, invoice</td>
            <td>Simple fallback (inbox)</td>
            <td>Important but not urgent. Inbox ensures visibility without over-escalating.</td>
          </tr>
          <tr>
            <td>Comment mention, task assigned</td>
            <td>No fallback</td>
            <td>Failure is acceptable — the user will see it next time they open the app.</td>
          </tr>
          <tr>
            <td>New follower, post liked</td>
            <td>No fallback</td>
            <td>Low-urgency social. Over-delivering with fallbacks creates noise.</td>
          </tr>
        </tbody>
      </table>
      <div className="callout callout-tip">
        <strong>Rule of thumb:</strong> if you&apos;d wake an engineer at 3 AM
        because the notification didn&apos;t deliver, it needs a fallback. If
        not, skip it — simpler config, fewer edge cases to test.
      </div>

      <h2>Common fallback patterns</h2>
      <table>
        <thead>
          <tr><th>Use case</th><th>Primary</th><th>Fallback</th><th>Pattern</th></tr>
        </thead>
        <tbody>
          <tr><td>Password reset</td><td>Email</td><td>Inbox</td><td>Simple — one fallback target</td></tr>
          <tr><td>Security alert</td><td>Email + SMS</td><td>Email → SMS → Inbox</td><td>Cascade — each failure tries the next</td></tr>
          <tr><td>Payment receipt</td><td>Email</td><td>Inbox (if no email address)</td><td>Missing address — graceful degradation</td></tr>
          <tr><td>Team invite</td><td>Email</td><td>Inbox (if user unsubscribed)</td><td>Preference skip — still reach the user via pull</td></tr>
        </tbody>
      </table>

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
      <div className="callout">
        <strong>Rules evaluate in order.</strong> The first matching rule fires.
        If you need a cascade (email → SMS → inbox), order your rules from
        most specific to broadest. A fallback channel can itself have a
        fallback — the engine processes the chain recursively.
      </div>

      <h2>Fallback and retries</h2>
      <p>
        Fallback triggers after all retries are exhausted, or after a provider
        returns a permanent error. Here&apos;s the full sequence for a failed
        email with an inbox fallback:
      </p>
      <div className="overview-flow">
        <div className="overview-flow-step">
          <span className="overview-flow-number">1</span>
          <div>
            <strong>delivery.created</strong>
            <p>Email delivery queued to provider.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">2</span>
          <div>
            <strong>delivery.attempt (x3)</strong>
            <p>Retries with exponential backoff. All three fail.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">3</span>
          <div>
            <strong>delivery.failed</strong>
            <p>Email marked as permanently failed. Retries exhausted.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">4</span>
          <div>
            <strong>fallback.triggered</strong>
            <p>Fallback rule matches — inbox fallback fires.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">5</span>
          <div>
            <strong>inbox.created</strong>
            <p>Fallback inbox item written. User still sees the notification.</p>
          </div>
        </div>
      </div>

      <h2>Interactions</h2>
      <table>
        <thead>
          <tr><th>Scenario</th><th>Behavior</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>Fallback channel disabled by preferences</td>
            <td>Skipped — fallbacks respect user preferences</td>
          </tr>
          <tr>
            <td><code>required: true</code> notification</td>
            <td>Fallback bypasses preferences too — always delivers</td>
          </tr>
          <tr>
            <td>Tracking and timeline</td>
            <td>Fallback deliveries are tracked like any other — full visibility in timeline</td>
          </tr>
        </tbody>
      </table>
      <div className="callout callout-warn">
        <strong>Watch out.</strong> If your fallback targets inbox but the
        user has inbox disabled, the notification is lost. For truly critical
        notifications, combine <code>required: true</code> with a fallback
        to guarantee delivery.
      </div>

      <h2>Testing fallbacks locally</h2>
      <p>
        You can&apos;t wait for a production failure to learn if your fallback
        works. Use a provider that always throws to trigger the chain in dev:
      </p>
      <Code
        code={`import type { EmailProvider } from "@notifykitjs/core"

// Provider that fails on demand
const failingEmailProvider: EmailProvider = {
  id: "failing",
  async send() {
    throw new Error("Simulated provider failure")
  },
}

// Use in tests:
const testNotify = createNotifyKit({
  notifications: [securityAlert] as const,
  database: memoryAdapter(),
  providers: { email: failingEmailProvider },
  retry: { maxAttempts: 1, delayMs: () => 0 }, // fail fast
})

const result = await testNotify.send({
  recipientId: "user_1",
  notificationId: "security_alert",
  payload: { event: "login", ip: "1.2.3.4" },
})

// Verify fallback fired:
expect(result.deliveries.some(d => d.status === "failed")).toBe(true)
expect(result.inboxItems.length).toBe(1) // fallback wrote to inbox`}
      />
      <table>
        <thead>
          <tr><th>What to test</th><th>Setup</th><th>Assert</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>Email fails → inbox fallback</td>
            <td>Failing email provider, <code>maxAttempts: 1</code></td>
            <td><code>result.inboxItems.length === 1</code></td>
          </tr>
          <tr>
            <td>Missing address → fallback</td>
            <td>Recipient without <code>email</code> field</td>
            <td><code>result.skipped</code> has <code>missing_address</code>, fallback fires</td>
          </tr>
          <tr>
            <td>Cascade: email → SMS → inbox</td>
            <td>Both email and SMS providers fail</td>
            <td>Inbox item exists as last-resort fallback</td>
          </tr>
          <tr>
            <td>Fallback respects preferences</td>
            <td>Disable inbox for the recipient, no <code>required</code></td>
            <td>No fallback delivery — notification is lost (expected)</td>
          </tr>
        </tbody>
      </table>

      <h2>Monitoring fallback health</h2>
      <p>
        Fallbacks firing means your primary channel failed. An occasional
        trigger is expected (intermittent provider errors). A sustained spike
        means your provider is degrading and users are getting a worse
        experience than intended.
      </p>
      <Code
        code={`createNotifyKit({
  // ...
  on: {
    "delivery.failed": ({ delivery, error }) => {
      metrics.inc("notifykit.delivery.failed", {
        channel: delivery.channel,
        provider: delivery.provider,
        notification: delivery.notificationId,
      })
    },
    "delivery.sent": ({ delivery }) => {
      // Track fallback deliveries separately
      if (delivery.isFallback) {
        metrics.inc("notifykit.fallback.fired", {
          channel: delivery.channel,
          notification: delivery.notificationId,
        })
      }
    },
  },
})`}
      />
      <table>
        <thead>
          <tr><th>Signal</th><th>Meaning</th><th>Action</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Fallback rate &gt; 5%</strong></td>
            <td>Primary provider is partially degraded</td>
            <td>Check provider status page; consider switching to backup provider</td>
          </tr>
          <tr>
            <td><strong>Fallback rate &gt; 50%</strong></td>
            <td>Primary provider is down or rejecting most sends</td>
            <td>Incident — swap provider or pause sends until resolved</td>
          </tr>
          <tr>
            <td><strong>Fallback fires for one notification only</strong></td>
            <td>Likely a payload or template issue, not a provider outage</td>
            <td>Check <Link href="/docs/timeline">timeline</Link> for the specific error message</td>
          </tr>
          <tr>
            <td><strong>Fallback fires for one recipient only</strong></td>
            <td>Recipient has invalid address (bounced, deactivated)</td>
            <td>Mark recipient as inactive or prompt them to update their email</td>
          </tr>
        </tbody>
      </table>
      <div className="callout callout-tip">
        <strong>Alert on fallback rate, not count.</strong> A single fallback
        trigger at 3am is noise. But if 20% of your sends are hitting
        fallbacks over a 5-minute window, that&apos;s a provider incident
        worth waking someone for. Use a ratio alert:{" "}
        <code>fallback.fired / delivery.sent &gt; 0.05</code>.
      </div>

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

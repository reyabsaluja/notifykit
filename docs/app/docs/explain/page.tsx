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

      <h2>What you get back</h2>
      <p>
        Here&apos;s a real explanation object. Read it top to bottom — it tells
        the full story of what the engine decided:
      </p>
      <Code
        code={`{
  // Pipeline-level decisions (checked first)
  wouldRateLimit: false,       // under threshold
  wouldDeduplicate: false,     // no matching dedup key
  wouldDigest: false,          // no digest configured
  wouldReplayIdempotent: false,// no matching idempotency key

  // Payload validation
  payloadValidation: { valid: true, errors: [] },

  // Notification metadata
  required: false,             // preferences apply

  // Rate limit state
  rateLimit: { current: 7, max: 30, windowMs: 3600000 },

  // Quiet hours state
  quietHours: { active: false, start: "22:00", end: "08:00", timezone: "America/New_York" },

  // Per-channel resolution
  channels: {
    inbox: {
      outcome: "deliver",      // ✓ will fire
      allowed: true,
      resolvedBy: "app_default",
      trail: [{ layer: "app_default", value: true }],
    },
    email: {
      outcome: "disabled",     // ✗ user opted out
      allowed: false,
      resolvedBy: "user_notification",
      trail: [
        { layer: "app_default", value: true },
        { layer: "notification_default", value: undefined },
        { layer: "tenant_setting", value: undefined },
        { layer: "user_notification", value: false },  // ← blocked here
      ],
    },
  },
}`}
      />
      <div className="callout callout-tip">
        <strong>Read it like a flowchart:</strong> pipeline flags first (rate
        limit? dedup? digest?) → if all pass, check each channel → for blocked
        channels, the <code>trail</code> array shows exactly which preference
        layer said no.
      </div>

      <h2>DeliveryExplanation shape</h2>
      <p>
        The explanation object gives you a complete picture of what the engine
        decided and why:
      </p>
      <table>
        <thead>
          <tr><th>Field</th><th>What it tells you</th></tr>
        </thead>
        <tbody>
          <tr><td><code>channels</code></td><td>Per-channel resolution with outcome and preference trail</td></tr>
          <tr><td><code>required</code></td><td>Whether the notification bypasses preference checks</td></tr>
          <tr><td><code>payloadValidation</code></td><td>Whether the payload passes schema validation (with field-level errors)</td></tr>
          <tr><td><code>wouldRateLimit</code></td><td>Would exceed the configured rate limit</td></tr>
          <tr><td><code>wouldDigest</code></td><td>Would be buffered into a digest window</td></tr>
          <tr><td><code>wouldDeduplicate</code></td><td>Would be dropped as a duplicate</td></tr>
          <tr><td><code>wouldReplayIdempotent</code></td><td>Idempotency key already exists — would replay</td></tr>
          <tr><td><code>rateLimit</code></td><td>Current count vs max, and window size</td></tr>
          <tr><td><code>quietHours</code></td><td>Whether quiet hours are active, and when they end</td></tr>
        </tbody>
      </table>

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
        Each channel includes the full preference resolution trail —
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
      <p>How to read it:</p>
      <table>
        <thead>
          <tr><th>Field</th><th>Meaning</th></tr>
        </thead>
        <tbody>
          <tr><td><code>trail[].layer</code></td><td>Which resolution layer was checked</td></tr>
          <tr><td><code>trail[].value</code></td><td><code>true</code> = enabled, <code>false</code> = disabled, <code>undefined</code> = no opinion (pass through)</td></tr>
          <tr><td><code>resolvedBy</code></td><td>The most specific layer that returned a non-undefined value</td></tr>
          <tr><td><code>allowed</code></td><td>Final answer — will this channel fire?</td></tr>
        </tbody>
      </table>

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

      <h2>Troubleshooting with explain</h2>
      <table>
        <thead>
          <tr><th>Symptom</th><th>Check this field</th><th>Common cause</th></tr>
        </thead>
        <tbody>
          <tr><td>User didn&apos;t get email</td><td><code>channels[email].outcome</code></td><td><code>&quot;disabled&quot;</code> (preferences) or <code>&quot;delayed&quot;</code> (quiet hours)</td></tr>
          <tr><td>Nothing delivered at all</td><td><code>wouldRateLimit</code> / <code>wouldDeduplicate</code></td><td>Rate limit exceeded or duplicate within dedup window</td></tr>
          <tr><td>Send succeeded but no inbox item</td><td><code>channels[inbox].outcome</code></td><td><code>&quot;disabled&quot;</code> — user opted out of inbox for this notification</td></tr>
          <tr><td>Payload validation failed</td><td><code>payloadValidation.errors</code></td><td>Missing required field or wrong type</td></tr>
          <tr><td>Email delivered twice</td><td><code>wouldReplayIdempotent</code></td><td>Missing <code>idempotencyKey</code> on retried sends</td></tr>
        </tbody>
      </table>

      <h2>Debugging workflow</h2>
      <p>
        When a user reports &quot;I didn&apos;t get my notification,&quot;
        follow this sequence:
      </p>
      <div className="overview-flow">
        <div className="overview-flow-step">
          <span className="overview-flow-number">1</span>
          <div>
            <strong>Reproduce with explain</strong>
            <p>Call <code>explain()</code> with the same inputs the original send used. No side effects — safe to run in production.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">2</span>
          <div>
            <strong>Check top-level flags</strong>
            <p>Is <code>wouldRateLimit</code>, <code>wouldDeduplicate</code>, or <code>wouldDigest</code> true? If so, the send never reached channels.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">3</span>
          <div>
            <strong>Inspect the failing channel</strong>
            <p>Find the channel in <code>explanation.channels</code>. Check <code>outcome</code> — it tells you exactly why: disabled, unavailable, delayed.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">4</span>
          <div>
            <strong>Read the preference trail</strong>
            <p>If <code>outcome</code> is <code>&quot;disabled&quot;</code>, the <code>trail</code> array shows which layer blocked it and who set it.</p>
          </div>
        </div>
      </div>
      <Code
        code={`// Quick diagnostic script for support teams:
const e = await notify.explain({
  recipientId: "user_456",
  notificationId: "comment_mentioned",
  payload: { actorName: "Rey", postTitle: "Q4 Plan", postUrl: "/posts/99" },
})

// Shortcut: find all blocked channels
const blocked = Object.entries(e.channels)
  .filter(([, ch]) => ch.outcome !== "deliver")
  .map(([name, ch]) => \`\${name}: \${ch.outcome} (by \${ch.resolvedBy ?? "system"})\`)

console.log(blocked.length ? blocked : "All channels would deliver")`}
      />

      <h2>When to use it</h2>
      <div className="overview-flow">
        <div className="overview-flow-step">
          <span className="overview-flow-number">?</span>
          <div>
            <strong>Debugging</strong>
            <p>&quot;Why didn&apos;t this user get an email?&quot; — run explain, check the preference trail, see exactly which layer blocked it.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">!</span>
          <div>
            <strong>Admin tooling</strong>
            <p>Show operators a preview of what would happen before they trigger a broadcast to 10k users.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">&checkmark;</span>
          <div>
            <strong>Testing</strong>
            <p>Assert expected delivery behavior in your test suite without actually sending emails or writing inbox rows.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">&crarr;</span>
          <div>
            <strong>Preference UIs</strong>
            <p>Show users the live effect of toggling a setting — &quot;if you disable this, you&apos;ll stop receiving email but still see it in your inbox.&quot;</p>
          </div>
        </div>
      </div>

      <h2>Building a support tool</h2>
      <p>
        Non-engineers handle most &quot;I didn&apos;t get my notification&quot;
        tickets. Give them a self-service endpoint that translates explain
        output into plain language:
      </p>
      <Code
        code={`// app/api/admin/diagnose/route.ts
import { notify } from "@/lib/notifykit"
import { requireAdmin } from "@/lib/auth"

export async function GET(request: Request) {
  await requireAdmin(request)
  const url = new URL(request.url)
  const recipientId = url.searchParams.get("user")!
  const notificationId = url.searchParams.get("notification")!

  const explanation = await notify.explain({
    recipientId,
    notificationId,
    payload: getTestPayload(notificationId), // default test values
  })

  // Translate to support-friendly format
  const diagnosis = {
    wouldDeliver: Object.values(explanation.channels)
      .some(ch => ch.outcome === "deliver"),
    blockers: Object.entries(explanation.channels)
      .filter(([, ch]) => ch.outcome !== "deliver")
      .map(([name, ch]) => ({
        channel: name,
        reason: friendlyReason(ch.outcome, ch.resolvedBy),
      })),
    quietHours: explanation.quietHours?.active
      ? \`Active until \${explanation.quietHours.resumesAt}\`
      : "Not active",
    rateLimited: explanation.wouldRateLimit
      ? \`\${explanation.rateLimit.current}/\${explanation.rateLimit.max} in window\`
      : "Under limit",
  }

  return Response.json(diagnosis)
}

function friendlyReason(outcome: string, layer?: string): string {
  const reasons: Record<string, string> = {
    disabled: \`User opted out (set by: \${layer ?? "unknown"})\`,
    unavailable: "No email/phone on file for this user",
    delayed: "Held by quiet hours — will deliver when window ends",
    rate_limited: "Too many sends in window — dropped",
    deduplicated: "Already sent recently — skipped as duplicate",
    digested: "Batched into a digest — will arrive with next flush",
  }
  return reasons[outcome] ?? outcome
}`}
      />
      <table>
        <thead>
          <tr><th>Support question</th><th>Field to check</th><th>Plain-language answer</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>&quot;Why no email?&quot;</td>
            <td><code>blockers[email].reason</code></td>
            <td>&quot;User opted out in their preferences&quot; or &quot;No email address on file&quot;</td>
          </tr>
          <tr>
            <td>&quot;When will it arrive?&quot;</td>
            <td><code>quietHours</code></td>
            <td>&quot;Held until 8:00 AM EST&quot;</td>
          </tr>
          <tr>
            <td>&quot;Did they get anything?&quot;</td>
            <td><code>wouldDeliver</code></td>
            <td>&quot;Yes, inbox will deliver&quot; or &quot;No, all channels blocked&quot;</td>
          </tr>
          <tr>
            <td>&quot;Why duplicated / missing?&quot;</td>
            <td><code>rateLimited</code></td>
            <td>&quot;Hit 20/20 limit this hour — subsequent sends dropped&quot;</td>
          </tr>
        </tbody>
      </table>
      <div className="callout callout-tip">
        <strong>Protect this endpoint.</strong> Explain reveals preference
        state and rate limit counts for any user. Gate it behind admin auth
        and log every access. Never expose it to the public API surface.
      </div>

      <h2>Testing with explain()</h2>
      <p>
        <code>explain()</code> is ideal for test suites — it evaluates the full
        pipeline without writing records or calling providers. Tests run faster,
        produce no side effects, and assert on delivery <em>intent</em> rather
        than delivery <em>outcome</em>.
      </p>

      <table>
        <thead>
          <tr><th>Approach</th><th>Writes records?</th><th>Calls providers?</th><th>Best for</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><strong><code>send()</code></strong></td>
            <td>Yes</td>
            <td>Yes (or faked)</td>
            <td>Integration tests — verify the full delivery cycle end-to-end</td>
          </tr>
          <tr>
            <td><strong><code>explain()</code></strong></td>
            <td>No</td>
            <td>No</td>
            <td>Unit tests — assert on routing decisions without side effects</td>
          </tr>
          <tr>
            <td><strong><code>send({`{ dryRun: true }`})</code></strong></td>
            <td>No</td>
            <td>No</td>
            <td>Same as explain() — use whichever reads better in context</td>
          </tr>
        </tbody>
      </table>

      <Code
        code={`import { describe, it, expect, beforeAll } from "vitest"
import { createNotifyKit, memoryAdapter, fakeEmailProvider } from "@notifykitjs/core"
import { commentMentioned } from "./notifications"

const notify = createNotifyKit({
  notifications: [commentMentioned] as const,
  database: memoryAdapter(),
  providers: { email: fakeEmailProvider() },
})

describe("notification routing", () => {
  beforeAll(async () => {
    await notify.upsertRecipient({ id: "user_1", email: "a@test.com" })
    await notify.upsertRecipient({ id: "user_2" }) // no email
  })

  it("delivers to inbox and email when recipient has both", async () => {
    const e = await notify.explain({
      recipientId: "user_1",
      notificationId: "comment_mentioned",
      payload: { actorName: "Rey", postUrl: "/p/1" },
    })

    expect(e.channels.inbox.outcome).toBe("deliver")
    expect(e.channels.email.outcome).toBe("deliver")
    expect(e.wouldRateLimit).toBe(false)
    expect(e.wouldDeduplicate).toBe(false)
  })

  it("skips email when recipient has no address", async () => {
    const e = await notify.explain({
      recipientId: "user_2",
      notificationId: "comment_mentioned",
      payload: { actorName: "Rey", postUrl: "/p/1" },
    })

    expect(e.channels.inbox.outcome).toBe("deliver")
    expect(e.channels.email.outcome).toBe("unavailable")
  })

  it("respects preference opt-out", async () => {
    await notify.preferences.update({
      recipientId: "user_1",
      notificationId: "comment_mentioned",
      channels: { email: false },
    })

    const e = await notify.explain({
      recipientId: "user_1",
      notificationId: "comment_mentioned",
      payload: { actorName: "Rey", postUrl: "/p/1" },
    })

    expect(e.channels.email.outcome).toBe("disabled")
    expect(e.channels.email.resolvedBy).toBe("user_notification")
  })

  it("reports rate limit status without consuming budget", async () => {
    // Send 30 times to hit the rate limit
    for (let i = 0; i < 30; i++) {
      await notify.send({
        recipientId: "user_1",
        notificationId: "comment_mentioned",
        payload: { actorName: \`User \${i}\`, postUrl: "/p/1" },
      })
    }

    // explain() reports the limit WITHOUT counting against it
    const e = await notify.explain({
      recipientId: "user_1",
      notificationId: "comment_mentioned",
      payload: { actorName: "Next", postUrl: "/p/1" },
    })

    expect(e.wouldRateLimit).toBe(true)
    expect(e.rateLimit.current).toBe(30)
    expect(e.rateLimit.max).toBe(30)
  })
})`}
      />

      <h3>What to assert on</h3>
      <table>
        <thead>
          <tr><th>You want to verify</th><th>Assert on</th><th>Example assertion</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>Channel routing is correct</td>
            <td><code>e.channels[ch].outcome</code></td>
            <td><code>expect(e.channels.email.outcome).toBe(&quot;deliver&quot;)</code></td>
          </tr>
          <tr>
            <td>Preferences are respected</td>
            <td><code>e.channels[ch].resolvedBy</code></td>
            <td><code>expect(e.channels.email.resolvedBy).toBe(&quot;user_notification&quot;)</code></td>
          </tr>
          <tr>
            <td>Quiet hours defer correctly</td>
            <td><code>e.quietHours.active</code></td>
            <td><code>expect(e.quietHours.active).toBe(true)</code></td>
          </tr>
          <tr>
            <td>Rate limits fire at threshold</td>
            <td><code>e.wouldRateLimit</code></td>
            <td><code>expect(e.wouldRateLimit).toBe(true)</code></td>
          </tr>
          <tr>
            <td>Dedup keys work</td>
            <td><code>e.wouldDeduplicate</code></td>
            <td><code>expect(e.wouldDeduplicate).toBe(true)</code> (after a prior send)</td>
          </tr>
          <tr>
            <td>Required bypasses prefs</td>
            <td><code>e.required</code> + <code>e.channels[ch].outcome</code></td>
            <td><code>expect(e.channels.email.outcome).toBe(&quot;deliver&quot;)</code> even when opted out</td>
          </tr>
          <tr>
            <td>Payload validation catches errors</td>
            <td><code>e.payloadValidation.errors</code></td>
            <td><code>expect(e.payloadValidation.errors).toContain(&quot;actorName&quot;)</code></td>
          </tr>
        </tbody>
      </table>

      <div className="callout callout-tip">
        <strong>explain() doesn&apos;t consume rate limit budget.</strong>{" "}
        You can call it 100 times in a test without affecting the counter. This
        makes it safe to assert on rate limit state from multiple test cases
        without interference — only actual <code>send()</code> calls increment
        the counter.
      </div>

      <h3>Testing preference resolution layers</h3>
      <p>
        The preference trail in explain output lets you verify that your
        resolution hierarchy works correctly — especially useful when you have
        tenant defaults, category overrides, and per-notification preferences
        all interacting:
      </p>
      <Code
        code={`it("tenant default overrides app default", async () => {
  // Setup: tenant "free_org" has email off by default
  const e = await notify.explain({
    recipientId: "free_user",
    notificationId: "comment_mentioned",
    payload: { actorName: "Rey", postUrl: "/p/1" },
  })

  // Verify the trail shows which layer won
  const emailTrail = e.channels.email.trail
  const tenantLayer = emailTrail.find(t => t.layer === "tenant_setting")

  expect(tenantLayer?.value).toBe(false)
  expect(e.channels.email.resolvedBy).toBe("tenant_setting")
  expect(e.channels.email.outcome).toBe("disabled")
})

it("user preference overrides tenant default", async () => {
  // User explicitly opted back in despite tenant default
  await notify.preferences.update({
    recipientId: "free_user",
    notificationId: "comment_mentioned",
    channels: { email: true },
  })

  const e = await notify.explain({
    recipientId: "free_user",
    notificationId: "comment_mentioned",
    payload: { actorName: "Rey", postUrl: "/p/1" },
  })

  // User preference wins over tenant default
  expect(e.channels.email.resolvedBy).toBe("user_notification")
  expect(e.channels.email.outcome).toBe("deliver")
})`}
      />
      <div className="callout">
        <strong>Test your resolution hierarchy early.</strong> Preference bugs
        are invisible until a user reports &quot;I never got that email&quot; —
        and then you&apos;re debugging in production. Write explain-based tests
        that cover: app default → category override → tenant override → user
        override → required bypass. Five tests, each one line of setup.
      </div>

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

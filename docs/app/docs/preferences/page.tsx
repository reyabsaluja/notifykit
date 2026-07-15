import type { Metadata } from "next";
import Link from "next/link";
import { Code } from "../../_components/code";

export const metadata: Metadata = { title: "Preferences & unsubscribe" };

export default function PreferencesPage() {
  return (
    <article>
      <h1>Preferences &amp; unsubscribe</h1>
      <p>
        Every send checks a <code>(recipientId, notificationId)</code>{" "}
        preference row before it writes to a channel. If the recipient has
        opted out, the channel is skipped and reported in{" "}
        <code>result.skipped</code> with a reason.
      </p>

      <div className="features">
        <div className="feature-card">
          <h3>Per-channel granularity</h3>
          <p>Users disable email for one notification while keeping inbox on — no all-or-nothing toggles.</p>
        </div>
        <div className="feature-card">
          <h3>Layered resolution</h3>
          <p>App defaults → category → notification → tenant → user. Most specific wins, with a full audit trail.</p>
        </div>
        <div className="feature-card">
          <h3>One-click unsubscribe</h3>
          <p>HMAC-signed email links that work without a session. RFC 8058 compliant for mail client support.</p>
        </div>
        <div className="feature-card">
          <h3>Global &amp; category toggles</h3>
          <p>Master switches for &quot;turn off all email&quot; or &quot;mute social notifications&quot; — with per-notification overrides.</p>
        </div>
      </div>

      <div className="callout callout-tip">
        <strong>Preferences are per-channel, per-notification.</strong> A user
        can disable email for &quot;comment mentions&quot; while keeping inbox
        on — and still receive emails for &quot;order shipped.&quot; No
        all-or-nothing toggles.
      </div>

      <h2>Reading &amp; writing preferences</h2>
      <Code
        code={`// Server-side:
await notify.preferences.update({
  recipientId: user.id,
  notificationId: "comment_mentioned",
  channels: { email: false },
})

const prefs = await notify.preferences.list(user.id)`}
      />
      <Code
        code={`// Client-side (React):
import { usePreferences } from "@notifykitjs/react"

function Settings() {
  const { items, update, isEnabled } = usePreferences()

  return (
    <input
      type="checkbox"
      checked={isEnabled("comment_mentioned", "email")}
      onChange={(e) =>
        update({
          notificationId: "comment_mentioned",
          channels: { email: e.target.checked },
        })
      }
    />
  )
}`}
      />
      <p>
        The React hook is optimistic — toggling the checkbox updates the UI
        before the server confirms, then reverts on error.
      </p>

      <h2>Auto-generating a preferences UI</h2>
      <p>
        The public <code>GET /api/notifykit/notifications</code> route
        returns every registered notification&apos;s ID, channels, category,
        and payload schema. Drive your settings table off it:
      </p>
      <Code
        code={`const meta = await client.notifications.list()
// [
//   { id: "comment_mentioned", channels: ["inbox","email"], category: "social" },
//   { id: "order_shipped", channels: ["email"], category: "billing" },
// ]`}
      />
      <p>
        Add a notification in <code>lib/notifykit.ts</code> and it shows up
        in the UI automatically.
      </p>

      <h2>Organizing with categories</h2>
      <p>
        As your notification count grows, a flat list becomes unusable.
        Use <code>category</code> to group notifications in your settings UI:
      </p>
      <Code
        code={`// In your notification definitions:
notification({ id: "comment_mentioned", category: "activity", ... })
notification({ id: "task_assigned",     category: "activity", ... })
notification({ id: "new_follower",      category: "social",   ... })
notification({ id: "post_liked",        category: "social",   ... })
notification({ id: "invoice_paid",      category: "billing",  ... })`}
      />
      <p>
        Then group the metadata response in your UI by category:
      </p>
      <Code
        code={`const meta = await client.notifications.list()
const grouped = Object.groupBy(meta, n => n.category ?? "other")
// { activity: [...], social: [...], billing: [...] }`}
      />
      <table>
        <thead>
          <tr><th>Category</th><th>UX pattern</th><th>Default recommendation</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>activity</strong></td>
            <td>Show all channels — users want fine control</td>
            <td>Inbox + email on by default</td>
          </tr>
          <tr>
            <td><strong>social</strong></td>
            <td>Show toggle per notification — lower urgency</td>
            <td>Inbox on, email off by default (use <code>defaultChannels</code>)</td>
          </tr>
          <tr>
            <td><strong>billing</strong></td>
            <td>Show as greyed-out / locked (required)</td>
            <td><code>required: true</code> — users can&apos;t opt out</td>
          </tr>
        </tbody>
      </table>
      <div className="callout callout-warn">
        <strong>CAN-SPAM compliance.</strong> If you send marketing emails,
        use <code>classification: &quot;marketing&quot;</code> to distinguish
        them from transactional emails. Marketing notifications should always
        be opt-in (set <code>defaultChannels: {`{ email: false }`}</code>) and
        must include an unsubscribe link.
      </div>

      <h2>Required notifications</h2>
      <p>
        Mark a notification as <code>required: true</code> to bypass
        preference checks. Use for transactional notifications like password
        resets, 2FA codes, or billing receipts:
      </p>
      <Code
        code={`notification({
  id: "password_reset",
  payload: { resetUrl: "string" },
  channels: [email({ subject: "Reset password", body: "{{resetUrl}}" })],
  required: true, // always delivers regardless of preferences
})`}
      />

      <h2>Unsubscribe links</h2>
      <p>
        When you pass an <code>unsubscribe</code> config to{" "}
        <code>createNotifyKit()</code>, every email template can reference{" "}
        <code>{`{{_unsubscribeUrl}}`}</code>. It expands to an HMAC-signed
        URL bound to the specific recipient and notification.
      </p>
      <Code
        code={`createNotifyKit({
  // ...
  unsubscribe: {
    secret: process.env.NOTIFYKIT_SECRET!,
    baseUrl: "https://app.com/api/notifykit",
  },
})

// In your email template:
email({
  subject: "...",
  body: "...\\n\\nUnsubscribe: {{_unsubscribeUrl}}",
})`}
      />

      <h3>How unsubscribe works</h3>
      <div className="overview-flow">
        <div className="overview-flow-step">
          <span className="overview-flow-number">1</span>
          <div>
            <strong>User clicks link in email</strong>
            <p><code>GET /unsubscribe?token=...</code> — verifies HMAC, flips <code>email: false</code>, renders a confirmation page.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">2</span>
          <div>
            <strong>Mail client one-click (RFC 8058)</strong>
            <p><code>POST /unsubscribe</code> — same verification via the <code>List-Unsubscribe-Post</code> header. Returns 200.</p>
          </div>
        </div>
      </div>

      <h3>Security properties</h3>
      <table>
        <thead>
          <tr><th>Property</th><th>Why it matters</th></tr>
        </thead>
        <tbody>
          <tr><td>HMAC-SHA256, timing-safe compare</td><td>Prevents brute-force forgery and timing side-channels</td></tr>
          <tr><td>Signature is the auth</td><td>Works from email clients without a login session</td></tr>
          <tr><td>No expiry</td><td>RFC 8058 requires links to remain valid indefinitely</td></tr>
          <tr><td>Per-notification granularity</td><td>Unsubscribing from one notification doesn&apos;t kill others</td></tr>
        </tbody>
      </table>

      <h2>Preference resolution layers</h2>
      <p>
        When the engine checks whether a channel should fire, it walks
        through layers from broadest to most specific. Each layer can override
        the one above it — the most specific match wins:
      </p>

      <div className="overview-flow">
        <div className="overview-flow-step">
          <span className="overview-flow-number">1</span>
          <div>
            <strong>App default</strong>
            <p><code>defaults.channels</code> — the baseline for all notifications across the app.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">2</span>
          <div>
            <strong>Category default</strong>
            <p><code>defaults.categories[cat]</code> — override for a specific category (e.g. &quot;marketing&quot; emails off).</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">3</span>
          <div>
            <strong>Notification default</strong>
            <p><code>notification.defaultChannels</code> — per-notification override set by the developer.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">4</span>
          <div>
            <strong>Tenant setting</strong>
            <p><code>tenantDefaults(tenantId)</code> — per-org overrides (e.g. free plans have email off).</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">5</span>
          <div>
            <strong>User preference</strong>
            <p>Global → category → notification-specific. The most specific user choice always wins.</p>
          </div>
        </div>
      </div>
      <div className="callout callout-warn">
        <strong>Overrides bypass the hierarchy.</strong>{" "}
        <code>required: true</code> forces delivery regardless of preferences.
        Missing destination (no email/phone) always skips — even for required
        notifications.
      </div>

      <h2>Building a full settings page</h2>
      <p>
        Combine <code>notifications.list()</code> (metadata) with{" "}
        <code>usePreferences()</code> (user state) for a complete settings UI:
      </p>
      <Code
        code={`import { usePreferences } from "@notifykitjs/react"
import { useEffect, useState } from "react"

function NotificationSettings() {
  const { isEnabled, update } = usePreferences()
  const [notifications, setNotifications] = useState([])

  useEffect(() => {
    fetch("/api/notifykit/notifications")
      .then(r => r.json())
      .then(body => setNotifications(body.data))
  }, [])

  return (
    <table>
      <thead>
        <tr><th>Notification</th><th>Inbox</th><th>Email</th></tr>
      </thead>
      <tbody>
        {notifications.map(n => (
          <tr key={n.id}>
            <td>{n.description || n.id}</td>
            {n.channels.map(ch => (
              <td key={ch}>
                <input
                  type="checkbox"
                  checked={isEnabled(n.id, ch)}
                  disabled={n.required}
                  onChange={e => update({
                    notificationId: n.id,
                    channels: { [ch]: e.target.checked },
                  })}
                />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}`}
      />
      <div className="callout callout-tip">
        <strong>Required notifications show as disabled checkboxes.</strong> The{" "}
        <code>required</code> field from metadata tells you which rows the user
        can&apos;t toggle. Show them greyed out rather than hiding them — users
        should understand what they&apos;ll always receive.
      </div>

      <h2>Global channel toggles</h2>
      <p>
        Users often want a master switch: &quot;turn off all email&quot; without
        unchecking every notification individually. Implement this with a global
        preference that overrides per-notification settings:
      </p>
      <Code
        code={`// Set a global channel preference (disables email for everything):
await notify.preferences.update({
  recipientId: user.id,
  notificationId: "*",       // wildcard = applies to all notifications
  channels: { email: false },
})

// Per-notification preferences still exist but are masked:
// User had email ON for "comment_mentioned" — global OFF wins.`}
      />
      <table>
        <thead>
          <tr><th>Pattern</th><th>Key</th><th>Behavior</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Global off</strong></td>
            <td><code>notificationId: &quot;*&quot;</code></td>
            <td>Disables a channel for all notifications (except <code>required: true</code>)</td>
          </tr>
          <tr>
            <td><strong>Category off</strong></td>
            <td><code>category: &quot;social&quot;</code></td>
            <td>Disables a channel for all notifications in that category</td>
          </tr>
          <tr>
            <td><strong>Per-notification</strong></td>
            <td><code>notificationId: &quot;comment_mentioned&quot;</code></td>
            <td>Disables a channel for one specific notification</td>
          </tr>
        </tbody>
      </table>
      <p>
        Resolution is most-specific-wins. A per-notification ON overrides a
        category OFF, which overrides a global OFF:
      </p>
      <Code
        code={`// Typical settings page layout:
//
// ┌─ Email ─────────────────────────────────────┐
// │ [x] Receive email notifications (global)    │
// │                                             │
// │  Activity                                   │
// │    [ ] Comments         ← user disabled     │
// │    [x] Task assigned                        │
// │                                             │
// │  Social                                     │
// │    [x] New followers                        │
// │    [x] Post reactions                       │
// └─────────────────────────────────────────────┘

function SettingsPage() {
  const { isEnabled, update } = usePreferences()

  // Global toggle
  const emailGlobalOn = isEnabled("*", "email")

  return (
    <>
      <label>
        <input
          type="checkbox"
          checked={emailGlobalOn}
          onChange={(e) => update({
            notificationId: "*",
            channels: { email: e.target.checked },
          })}
        />
        Receive email notifications
      </label>

      {/* Per-notification toggles (visually dimmed when global is off) */}
      <fieldset disabled={!emailGlobalOn}>
        {notifications.map(n => (
          <label key={n.id}>
            <input
              type="checkbox"
              checked={isEnabled(n.id, "email")}
              onChange={(e) => update({
                notificationId: n.id,
                channels: { email: e.target.checked },
              })}
            />
            {n.description}
          </label>
        ))}
      </fieldset>
    </>
  )
}`}
      />
      <div className="callout callout-tip">
        <strong>Disable the fieldset when global is off.</strong> Users
        shouldn&apos;t toggle individual notifications while the master switch is
        off — it&apos;s confusing. Use a <code>&lt;fieldset disabled&gt;</code> to
        grey out the per-notification toggles until the global is re-enabled.
      </div>

      <h3>Resolution with global toggles</h3>
      <div className="overview-flow">
        <div className="overview-flow-step">
          <span className="overview-flow-number">1</span>
          <div>
            <strong>Check required</strong>
            <p>If <code>required: true</code> → always deliver. Skip all preference checks.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">2</span>
          <div>
            <strong>Check per-notification</strong>
            <p>If user has a specific preference for this (recipient, notification, channel) → use it.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">3</span>
          <div>
            <strong>Check category</strong>
            <p>If user has a category-level preference → use it.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">4</span>
          <div>
            <strong>Check global</strong>
            <p>If user has <code>notificationId: &quot;*&quot;</code> → use it.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">5</span>
          <div>
            <strong>Fall through to defaults</strong>
            <p>Tenant defaults → notification defaults → app defaults.</p>
          </div>
        </div>
      </div>
      <div className="callout callout-warn">
        <strong>Global OFF doesn&apos;t affect <code>required</code> notifications.</strong>{" "}
        Password resets, security alerts, and other required notifications still
        deliver even when the user has disabled all email. This is intentional —
        communicate it clearly in your UI (&quot;Security notifications will
        always be sent regardless of this setting&quot;).
      </div>

      <h2>Common pitfalls</h2>
      <p>
        Most preference bugs come from the same handful of mistakes. Check this
        table before reaching for <code>explain()</code>:
      </p>
      <table>
        <thead>
          <tr><th>Symptom</th><th>Likely cause</th><th>Fix</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>User opts out but still gets emails</td>
            <td><code>required: true</code> on the notification definition</td>
            <td>Remove <code>required</code> or explain to user that this notification can&apos;t be disabled</td>
          </tr>
          <tr>
            <td>New notification sends to nobody</td>
            <td><code>defaultChannels</code> set to <code>{`{ email: false, inbox: false }`}</code></td>
            <td>Set at least one channel to <code>true</code> in defaults, or omit <code>defaultChannels</code> to inherit app defaults</td>
          </tr>
          <tr>
            <td>Global toggle off but one notification still delivers</td>
            <td>Per-notification preference is explicitly <code>true</code> (most-specific wins)</td>
            <td>Expected behavior — show this in your UI so users understand the override</td>
          </tr>
          <tr>
            <td>Tenant users can&apos;t receive email even when opted in</td>
            <td>Tenant default disables email at layer 4, and no user preference at layer 5 overrides it</td>
            <td>User must explicitly set <code>email: true</code> — an absent preference doesn&apos;t override a tenant OFF</td>
          </tr>
          <tr>
            <td>Category OFF doesn&apos;t apply to a notification</td>
            <td>Notification is missing <code>category</code> field — it falls outside the category filter</td>
            <td>Add <code>category</code> to the notification definition</td>
          </tr>
        </tbody>
      </table>
      <div className="callout callout-warn">
        <strong>Absent ≠ false.</strong> A user with no preference record inherits
        defaults. A user with an explicit <code>false</code> overrides defaults.
        If you delete a preference row (rather than setting it to <code>true</code>),
        the user falls back to whatever the default is — which may not be what
        they expect.
      </div>

      <h2>Testing preference resolution</h2>
      <p>
        Preference bugs are invisible until a user reports &quot;I never got
        that email.&quot; Write tests that cover your resolution hierarchy
        before that happens. Use <code>preferences.explain()</code> for the
        full trail, or <code>explain()</code> (the send dry-run) to verify
        the combined effect on delivery.
      </p>

      <Code
        code={`import { describe, it, expect, beforeEach } from "vitest"
import { createNotifyKit, memoryAdapter, fakeEmailProvider, notification, channel } from "@notifykitjs/core"

const inbox = channel.inbox()
const email = channel.email()

const commentMentioned = notification({
  id: "comment_mentioned",
  category: "activity",
  payload: { actorName: "string", postUrl: "string" },
  channels: [
    inbox({ title: "{{actorName}} mentioned you" }),
    email({ subject: "{{actorName}} mentioned you", body: "Open {{postUrl}}" }),
  ],
})

const passwordReset = notification({
  id: "password_reset",
  payload: { resetUrl: "string" },
  channels: [email({ subject: "Reset password", body: "{{resetUrl}}" })],
  required: true,
})

function createTestNotify(opts = {}) {
  return createNotifyKit({
    notifications: [commentMentioned, passwordReset] as const,
    database: memoryAdapter(),
    providers: { email: fakeEmailProvider() },
    ...opts,
  })
}

describe("preference resolution", () => {
  let notify: ReturnType<typeof createTestNotify>

  beforeEach(async () => {
    notify = createTestNotify()
    await notify.upsertRecipient({ id: "user_1", email: "a@test.com" })
  })

  it("delivers all channels by default (no preferences set)", async () => {
    const e = await notify.explain({
      recipientId: "user_1",
      notificationId: "comment_mentioned",
      payload: { actorName: "Rey", postUrl: "/p/1" },
    })
    expect(e.channels.inbox.outcome).toBe("deliver")
    expect(e.channels.email.outcome).toBe("deliver")
  })

  it("user opt-out disables a single channel", async () => {
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
    expect(e.channels.inbox.outcome).toBe("deliver") // unaffected
  })

  it("required notifications ignore user opt-out", async () => {
    await notify.preferences.update({
      recipientId: "user_1",
      notificationId: "password_reset",
      channels: { email: false },
    })

    const e = await notify.explain({
      recipientId: "user_1",
      notificationId: "password_reset",
      payload: { resetUrl: "/reset/abc" },
    })
    expect(e.channels.email.outcome).toBe("deliver") // required overrides
  })

  it("global OFF disables email for all non-required notifications", async () => {
    await notify.preferences.update({
      recipientId: "user_1",
      notificationId: "*",
      channels: { email: false },
    })

    const mention = await notify.explain({
      recipientId: "user_1",
      notificationId: "comment_mentioned",
      payload: { actorName: "Rey", postUrl: "/p/1" },
    })
    expect(mention.channels.email.outcome).toBe("disabled")

    const reset = await notify.explain({
      recipientId: "user_1",
      notificationId: "password_reset",
      payload: { resetUrl: "/reset/abc" },
    })
    expect(reset.channels.email.outcome).toBe("deliver") // required wins
  })

  it("per-notification ON overrides global OFF", async () => {
    // Global: email off
    await notify.preferences.update({
      recipientId: "user_1",
      notificationId: "*",
      channels: { email: false },
    })
    // Exception: this specific notification stays on
    await notify.preferences.update({
      recipientId: "user_1",
      notificationId: "comment_mentioned",
      channels: { email: true },
    })

    const e = await notify.explain({
      recipientId: "user_1",
      notificationId: "comment_mentioned",
      payload: { actorName: "Rey", postUrl: "/p/1" },
    })
    expect(e.channels.email.outcome).toBe("deliver")
  })
})`}
      />
      <table>
        <thead>
          <tr><th>Test case</th><th>What it catches</th><th>Common mistake</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>Default delivery (no prefs set)</td>
            <td>App defaults are correct</td>
            <td><code>defaultChannels</code> accidentally set to <code>false</code></td>
          </tr>
          <tr>
            <td>Single channel opt-out</td>
            <td>Granular control works</td>
            <td>Opt-out disabling all channels instead of just the target</td>
          </tr>
          <tr>
            <td>Required bypasses opt-out</td>
            <td>Transactional notifications always deliver</td>
            <td><code>required</code> not being checked before preferences</td>
          </tr>
          <tr>
            <td>Global OFF applies broadly</td>
            <td>Wildcard preference works</td>
            <td>Wildcard only matching literal <code>&quot;*&quot;</code> ID</td>
          </tr>
          <tr>
            <td>Specific overrides global</td>
            <td>Most-specific-wins resolution</td>
            <td>Global preference taking precedence over specific</td>
          </tr>
        </tbody>
      </table>
      <div className="callout callout-tip">
        <strong>Add tenant tests if you use multi-tenancy.</strong> The hierarchy
        adds a tenant layer between defaults and user preferences. Test that:
        tenant OFF + user ON = delivers (user wins), and tenant OFF + no user
        preference = doesn&apos;t deliver (tenant wins over app default). See{" "}
        <Link href="/docs/multi-tenancy">Multi-tenancy</Link> for the full
        isolation test pattern.
      </div>

      <h3>Debugging with preferences.explain()</h3>
      <p>
        When a test fails or a user reports unexpected behavior, use{" "}
        <code>preferences.explain()</code> to see the full resolution trail —
        every layer that was checked, which one won, and why:
      </p>
      <Code
        code={`const trail = await notify.preferences.explain({
  recipientId: "user_1",
  notificationId: "comment_mentioned",
})

// trail.email → {
//   outcome: "disabled",
//   resolvedBy: "user_notification",   ← which layer decided
//   trail: [
//     { layer: "app_default",          value: true },
//     { layer: "notification_default", value: true },
//     { layer: "tenant_setting",       value: null },   ← no tenant override
//     { layer: "user_global",          value: null },   ← no global pref
//     { layer: "user_notification",    value: false },  ← ✓ this one won
//   ]
// }`}
      />
      <table>
        <thead>
          <tr><th><code>resolvedBy</code> value</th><th>Meaning</th><th>How to fix (if unexpected)</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><code>app_default</code></td>
            <td>No overrides at any level — using the base config</td>
            <td>Check <code>defaults.channels</code> in <code>createNotifyKit()</code></td>
          </tr>
          <tr>
            <td><code>notification_default</code></td>
            <td>The notification&apos;s <code>defaultChannels</code> overrode the app default</td>
            <td>Check the notification definition&apos;s <code>defaultChannels</code> field</td>
          </tr>
          <tr>
            <td><code>tenant_setting</code></td>
            <td>The tenant&apos;s <code>tenantDefaults()</code> function overrode</td>
            <td>Check what <code>tenantDefaults(tenantId)</code> returns for this org</td>
          </tr>
          <tr>
            <td><code>user_global</code></td>
            <td>User has a wildcard (<code>*</code>) preference set</td>
            <td>User turned off all email — check their global settings page</td>
          </tr>
          <tr>
            <td><code>user_category</code></td>
            <td>User toggled the entire category off</td>
            <td>User disabled all &quot;social&quot; or &quot;activity&quot; notifications</td>
          </tr>
          <tr>
            <td><code>user_notification</code></td>
            <td>User explicitly set this specific (notification, channel) pair</td>
            <td>This is intentional — user made a specific choice</td>
          </tr>
          <tr>
            <td><code>required_override</code></td>
            <td>Notification is <code>required: true</code> — all preferences ignored</td>
            <td>Expected for transactional notifications</td>
          </tr>
        </tbody>
      </table>
      <div className="callout callout-tip">
        <strong>Wire this into your support tooling.</strong> When a support
        agent investigates &quot;user didn&apos;t get the email,&quot; they can
        call <code>preferences.explain()</code> from an admin endpoint and
        immediately see which layer blocked delivery — no guesswork, no checking
        multiple database tables manually. See{" "}
        <Link href="/docs/explain">Explain &amp; dry run</Link> for the full
        send-level dry run.
      </div>

      <div className="page-nav">
        <Link href="/docs/channels">
          <span className="page-nav-label">Previous</span>
          <span className="page-nav-title">Channels</span>
        </Link>
        <Link href="/docs/digests">
          <span className="page-nav-label">Next</span>
          <span className="page-nav-title">Digests & rate limits</span>
        </Link>
      </div>
    </article>
  );
}

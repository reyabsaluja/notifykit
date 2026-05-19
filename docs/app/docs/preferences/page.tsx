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
        <code>result.skippedChannels</code>.
      </p>

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
      <ol>
        <li>
          <strong>GET /unsubscribe?token=...</strong> — Human click from email.
          Verifies HMAC, flips <code>email: false</code>, renders a
          confirmation page.
        </li>
        <li>
          <strong>POST /unsubscribe</strong> — RFC 8058 one-click (mail client
          header). Same verification, returns 200.
        </li>
      </ol>

      <h3>Security properties</h3>
      <ul>
        <li>HMAC-SHA256, timing-safe compare</li>
        <li>Signature is the auth — bypasses <code>identify()</code></li>
        <li>No expiry (RFC 8058 requirement)</li>
        <li>Per-notification granularity — unsubscribing from one doesn&apos;t kill others</li>
      </ul>

      <h2>Preference resolution layers</h2>
      <p>
        When the engine checks whether a channel should fire, it walks
        through layers from lowest to highest priority:
      </p>
      <ol>
        <li>App default (<code>defaults.channels</code>)</li>
        <li>Category default (<code>defaults.categories[cat]</code>)</li>
        <li>Notification default (<code>notification.defaultChannels</code>)</li>
        <li>Tenant setting (<code>tenantDefaults(tenantId)</code>)</li>
        <li>User global preference</li>
        <li>User category preference</li>
        <li>User notification preference (most specific wins)</li>
        <li>Required override (<code>required: true</code> forces delivery)</li>
        <li>Destination unavailable (no email → skip)</li>
      </ol>
      <p>
        Use <code>notify.preferences.explain()</code> to see the full
        resolution trail for any (recipient, notification) pair. See{" "}
        <Link href="/docs/explain">Explain &amp; dry run</Link>.
      </p>

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

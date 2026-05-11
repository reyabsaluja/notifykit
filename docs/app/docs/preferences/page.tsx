import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Preferences & unsubscribe" };

export default function PreferencesPage() {
  return (
    <article>
      <h1>Preferences &amp; unsubscribe</h1>
      <p>
        Every send checks a <code>(recipientId, notificationId)</code>{" "}
        preference row before it writes to a channel. If the recipient has
        opted out of a channel for that notification, the channel is
        skipped and reported in <code>SendResult.skippedChannels</code>.
      </p>

      <h2>Reading &amp; writing preferences</h2>
      <pre>
        <code>{`// Server-side:
await notify.preferences.update({
  recipientId: user.id,
  notificationId: "comment_mentioned",
  channels: { email: false },
})

const prefs = await notify.preferences.list(user.id)

// Client-side (React):
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
}`}</code>
      </pre>
      <p>
        The React hook is optimistic — toggling the checkbox updates the UI
        before the server confirms, and reverts on error.
      </p>

      <h2>Auto-generating a preferences UI</h2>
      <p>
        The public <code>GET /api/notifykit/notifications</code> route
        returns every registered notification&apos;s id, channels, and
        payload schema. Drive your settings table off it — add a
        notification in <code>lib/notifykit.ts</code> and it shows up in the
        UI automatically:
      </p>
      <pre>
        <code>{`const meta = await client.notifications.list()
// [
//   { id: "comment_mentioned", channels: ["inbox","email"], payload: {...} },
//   { id: "order_shipped",     channels: ["email"],         payload: {...} },
// ]`}</code>
      </pre>

      <h2>Unsubscribe links</h2>
      <p>
        When you pass an <code>unsubscribe</code> config to{" "}
        <code>createNotifyKit()</code>, every email template can reference{" "}
        <code>{`{{_unsubscribeUrl}}`}</code> and it expands to a
        HMAC-signed URL bound to the <em>specific recipient and
        notification</em>. The handler&apos;s <code>/unsubscribe</code> route
        verifies the signature and flips{" "}
        <code>preferences.channels.email = false</code>.
      </p>
      <pre>
        <code>{`createNotifyKit({
  // ...
  unsubscribe: {
    secret: process.env.NOTIFYKIT_SECRET!,
    baseUrl: "https://app.com/api/notifykit",
  },
})

createHandler(notify, {
  identify: getSessionUserId,
  unsubscribeSecret: process.env.NOTIFYKIT_SECRET,
})

// In your email template:
email({
  subject: "...",
  body: "...\\n\\n---\\nUnsubscribe: {{_unsubscribeUrl}}",
})`}</code>
      </pre>

      <h3>What the route accepts</h3>
      <ul>
        <li>
          <code>GET /api/notifykit/unsubscribe?token=...</code> — human click
          from the email footer. Returns a minimal HTML confirmation page.
        </li>
        <li>
          <code>POST /api/notifykit/unsubscribe</code> — RFC 8058 one-click
          (mail clients). Token in query, form body, or JSON body. Returns a
          minimal 200 confirmation page.
        </li>
      </ul>

      <h3>Security properties</h3>
      <ul>
        <li>HMAC-SHA256, timing-safe compare.</li>
        <li>Signature is the auth — the route bypasses <code>identify()</code>.</li>
        <li>
          No expiry. RFC 8058 requires unsubscribe links to keep working
          indefinitely.
        </li>
        <li>
          Per-notification granularity. Unsubscribing from{" "}
          <code>comment_mentioned</code> doesn&apos;t kill{" "}
          <code>password_reset</code>.
        </li>
      </ul>

      <p>
        Next: <Link href="/docs/providers">Production providers →</Link>
      </p>
    </article>
  );
}

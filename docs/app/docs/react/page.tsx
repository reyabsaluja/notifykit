import type { Metadata } from "next";
import Link from "next/link";
import { Code } from "../../_components/code";

export const metadata: Metadata = { title: "React hooks & components" };

export default function ReactPage() {
  return (
    <article>
      <h1>React hooks &amp; components</h1>
      <p>
        The <code>@notifykitjs/react</code> package provides hooks and
        pre-built components for building notification UIs. Everything is
        typed against your notification definitions.
      </p>

      <h2>Setup</h2>
      <Code
        lang="bash"
        code={`npm install @notifykitjs/react`}
      />
      <p>
        Wrap your app in the provider (see{" "}
        <Link href="/docs/nextjs">Next.js integration</Link>):
      </p>
      <Code
        code={`import { NotifyKitProvider } from "@notifykitjs/react"

<NotifyKitProvider options={{ baseUrl: "/api/notifykit" }}>
  {children}
</NotifyKitProvider>`}
      />

      <h2>useInbox()</h2>
      <p>
        Fetches and manages the current user&apos;s inbox. Automatically
        connects to realtime updates when a realtime adapter is configured
        server-side.
      </p>
      <Code
        code={`import { useInbox } from "@notifykitjs/react"

function InboxPage() {
  const {
    items,           // InboxItem[]
    status,          // "idle" | "loading" | "ready" | "error"
    error,           // string | null
    unreadCount,     // number
    realtimeStatus,  // "connected" | "connecting" | "disconnected"
    refresh,         // () => Promise<InboxItem[]>
    markRead,        // (id: string) => Promise<InboxItem | null>
    markAllRead,     // () => Promise<number>
    archive,         // (id: string) => Promise<InboxItem | null>
    unarchive,       // (id: string) => Promise<InboxItem | null>
    deleteItem,      // (id: string) => Promise<void>
  } = useInbox()

  return (
    <ul>
      {items.map(item => (
        <li key={item.id}>
          <strong>{item.title}</strong>
          {item.body && <p>{item.body}</p>}
          {!item.readAt && (
            <button onClick={() => markRead(item.id)}>Mark read</button>
          )}
        </li>
      ))}
    </ul>
  )
}`}
      />

      <h3>Options</h3>
      <Code
        code={`// Disable auto-loading (useful for conditional rendering)
const inbox = useInbox({ autoLoad: false })

// Then manually load when ready:
useEffect(() => { inbox.refresh() }, [])`}
      />

      <h2>usePreferences()</h2>
      <p>
        Fetches and manages the current user&apos;s notification preferences.
        Updates are optimistic — the UI updates immediately, then reverts on
        error.
      </p>
      <Code
        code={`import { usePreferences } from "@notifykitjs/react"

function NotificationSettings() {
  const {
    items,       // RecipientPreference[]
    status,      // "idle" | "loading" | "ready" | "error"
    error,       // string | null
    refresh,     // () => Promise<RecipientPreference[]>
    update,      // (input) => Promise<RecipientPreference>
    isEnabled,   // (notificationId, channel) => boolean
  } = usePreferences()

  return (
    <label>
      <input
        type="checkbox"
        checked={isEnabled("comment_mentioned", "email")}
        onChange={(e) => update({
          notificationId: "comment_mentioned",
          channels: { email: e.target.checked },
        })}
      />
      Email me when someone mentions me
    </label>
  )
}`}
      />

      <h2>Pre-built components</h2>

      <h3>&lt;NotificationBell /&gt;</h3>
      <p>Renders the unread count. Pass a custom renderer for full control:</p>
      <Code
        code={`import { NotificationBell } from "@notifykitjs/react"

// Default: renders "(3)" when 3 unread
<NotificationBell />

// Custom:
<NotificationBell render={({ unreadCount }) => (
  <div className="bell-icon">
    {unreadCount > 0 && <span className="badge">{unreadCount}</span>}
  </div>
)} />`}
      />

      <h3>&lt;Inbox /&gt;</h3>
      <p>
        Renders the full inbox list with mark-read buttons. Customize with{" "}
        <code>renderItem</code> and <code>emptyState</code>:
      </p>
      <Code
        code={`import { Inbox } from "@notifykitjs/react"

<Inbox
  emptyState={<p>You're all caught up!</p>}
  renderItem={({ item, markRead }) => (
    <div className="notification-card">
      <h4>{item.title}</h4>
      <p>{item.body}</p>
      {item.actionUrl && <a href={item.actionUrl}>View</a>}
      {!item.readAt && (
        <button onClick={() => markRead(item.id)}>Dismiss</button>
      )}
    </div>
  )}
/>`}
      />

      <h2>Client SDK (advanced)</h2>
      <p>
        For non-React environments or custom integrations, use the client
        directly:
      </p>
      <Code
        code={`import { createNotifyKitClient } from "@notifykitjs/react"

const client = createNotifyKitClient({ baseUrl: "/api/notifykit" })

// Inbox operations
const items = await client.inbox.list()
await client.inbox.markRead(items[0].id)
await client.inbox.markAllRead()
await client.inbox.archive(items[0].id)
await client.inbox.deleteItem(items[0].id)

// Preferences
const prefs = await client.preferences.list()
await client.preferences.update({
  notificationId: "comment_mentioned",
  channels: { email: false },
})

// Notification metadata (for building settings UIs)
const notifications = await client.notifications.list()
// [{ id: "comment_mentioned", channels: ["inbox","email"], ... }]`}
      />

      <h2>Realtime</h2>
      <p>
        When a <Link href="/docs/realtime">realtime adapter</Link> is
        configured server-side, <code>useInbox()</code> automatically
        connects and receives live updates. New inbox items appear
        instantly, and the unread count updates in real time.
      </p>
      <p>
        The <code>realtimeStatus</code> field tells you the connection state:
      </p>
      <ul>
        <li><code>&quot;connected&quot;</code> — receiving live updates</li>
        <li><code>&quot;connecting&quot;</code> — handshake in progress</li>
        <li><code>&quot;disconnected&quot;</code> — no realtime (falls back to polling on refresh)</li>
      </ul>

      <div className="page-nav">
        <Link href="/docs/nextjs">
          <span className="page-nav-label">Previous</span>
          <span className="page-nav-title">Next.js</span>
        </Link>
        <Link href="/docs/realtime">
          <span className="page-nav-label">Next</span>
          <span className="page-nav-title">Realtime</span>
        </Link>
      </div>
    </article>
  );
}

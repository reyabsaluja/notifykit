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

      <table>
        <thead>
          <tr><th>Approach</th><th>When to use</th></tr>
        </thead>
        <tbody>
          <tr><td><strong>Hooks</strong> (<code>useInbox</code>, <code>usePreferences</code>)</td><td>Full control over UI — you render everything yourself</td></tr>
          <tr><td><strong>Components</strong> (<code>&lt;Inbox /&gt;</code>, <code>&lt;NotificationBell /&gt;</code>)</td><td>Quick start — pre-built with customization via render props</td></tr>
          <tr><td><strong>Client SDK</strong> (<code>createNotifyKitClient</code>)</td><td>Non-React environments (Vue, Svelte, vanilla JS)</td></tr>
        </tbody>
      </table>

      <h2>Which approach fits?</h2>
      <div className="features">
        <div className="feature-card">
          <h3>Do you need a custom design?</h3>
          <p>Yes → use <strong>hooks</strong> (<code>useInbox</code>, <code>usePreferences</code>). No → use <strong>components</strong> (<code>&lt;Inbox /&gt;</code>, <code>&lt;NotificationBell /&gt;</code>) for instant UI.</p>
        </div>
        <div className="feature-card">
          <h3>Are you using React?</h3>
          <p>Yes → hooks or components (both work). No → use <strong>createNotifyKitClient</strong> directly — same HTTP layer, no React dependency.</p>
        </div>
        <div className="feature-card">
          <h3>Do you need realtime updates?</h3>
          <p>Configure a <Link href="/docs/realtime">realtime adapter</Link> server-side. Hooks connect automatically — no client config needed.</p>
        </div>
      </div>

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
        filename="app/layout.tsx"
        code={`import { NotifyKitProvider } from "@notifykitjs/react"

<NotifyKitProvider options={{ baseUrl: "/api/notifykit" }}>
  {children}
</NotifyKitProvider>`}
      />

      <h2>Hook quick reference</h2>
      <p>Every hook and its key methods on one screen. Find what you need, then scroll down for full docs and examples:</p>
      <div className="features">
        <div className="feature-card">
          <h3>useInbox()</h3>
          <p>Full inbox state + mutations. Returns <code>items</code>, <code>unreadCount</code>, <code>status</code>, <code>realtimeStatus</code>.</p>
          <code style={{ fontSize: "0.75em", whiteSpace: "pre", display: "block", marginTop: "0.5rem" }}>{`markRead(id)\nmarkAllRead()\narchive(id)\ndeleteItem(id)\nrefresh()`}</code>
        </div>
        <div className="feature-card">
          <h3>usePreferences()</h3>
          <p>Channel toggles for the current user. Returns <code>items</code>, <code>status</code>, <code>error</code>.</p>
          <code style={{ fontSize: "0.75em", whiteSpace: "pre", display: "block", marginTop: "0.5rem" }}>{`isEnabled(id, channel)\nupdate({ notificationId,\n  channels })\nrefresh()`}</code>
        </div>
        <div className="feature-card">
          <h3>useUnreadCount()</h3>
          <p>Just the badge number. Lighter than <code>useInbox</code> when you only need the count.</p>
          <code style={{ fontSize: "0.75em", whiteSpace: "pre", display: "block", marginTop: "0.5rem" }}>{`{ unreadCount: number }`}</code>
        </div>
        <div className="feature-card">
          <h3>createNotifyKitClient()</h3>
          <p>Non-React SDK. Same HTTP layer, no hooks. Works with Vue, Svelte, vanilla JS.</p>
          <code style={{ fontSize: "0.75em", whiteSpace: "pre", display: "block", marginTop: "0.5rem" }}>{`client.inbox.list()\nclient.preferences.list()\nclient.notifications.list()`}</code>
        </div>
      </div>
      <div className="callout callout-tip">
        <strong>All hooks share state through the provider.</strong> If{" "}
        <code>useInbox()</code> marks an item as read, <code>useUnreadCount()</code>{" "}
        decrements automatically — no manual coordination needed between components.
      </div>

      <h2>useInbox()</h2>
      <p>
        Fetches and manages the current user&apos;s inbox. Automatically
        connects to realtime updates when a realtime adapter is configured
        server-side.
      </p>

      <table>
        <thead>
          <tr><th>Return field</th><th>Type</th><th>Description</th></tr>
        </thead>
        <tbody>
          <tr><td><code>items</code></td><td><code>InboxItem[]</code></td><td>Current inbox items</td></tr>
          <tr><td><code>status</code></td><td><code>&quot;idle&quot; | &quot;loading&quot; | &quot;ready&quot; | &quot;error&quot;</code></td><td>Fetch state</td></tr>
          <tr><td><code>unreadCount</code></td><td><code>number</code></td><td>Count of unread items</td></tr>
          <tr><td><code>realtimeStatus</code></td><td><code>&quot;connected&quot; | &quot;connecting&quot; | &quot;disconnected&quot;</code></td><td>SSE connection state</td></tr>
          <tr><td><code>markRead(id)</code></td><td><code>Promise&lt;InboxItem&gt;</code></td><td>Mark one item as read</td></tr>
          <tr><td><code>markAllRead()</code></td><td><code>Promise&lt;number&gt;</code></td><td>Mark all read, returns count</td></tr>
          <tr><td><code>archive(id)</code></td><td><code>Promise&lt;InboxItem&gt;</code></td><td>Archive an item</td></tr>
          <tr><td><code>deleteItem(id)</code></td><td><code>Promise&lt;void&gt;</code></td><td>Permanently delete</td></tr>
          <tr><td><code>refresh()</code></td><td><code>Promise&lt;InboxItem[]&gt;</code></td><td>Re-fetch from server</td></tr>
        </tbody>
      </table>

      <Code
        filename="components/inbox.tsx"
        code={`import { useInbox } from "@notifykitjs/react"

function InboxPage() {
  const { items, markRead } = useInbox()

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

      <h2>Handling loading &amp; error states</h2>
      <p>
        The <code>status</code> field tells you where the hook is in its
        lifecycle. Always handle at least loading and error for production UIs:
      </p>
      <Code
        code={`function InboxWithStates() {
  const { items, status, markRead, refresh } = useInbox()

  if (status === "loading") return <Skeleton count={3} />
  if (status === "error") return (
    <div className="error">
      Failed to load notifications.
      <button onClick={refresh}>Retry</button>
    </div>
  )

  if (items.length === 0) return <p>No notifications yet.</p>

  return items.map(item => (
    <NotificationCard key={item.id} item={item} onRead={markRead} />
  ))
}`}
      />
      <table>
        <thead>
          <tr><th><code>status</code></th><th>Render</th><th>Notes</th></tr>
        </thead>
        <tbody>
          <tr><td><code>&quot;idle&quot;</code></td><td>Nothing (or skeleton)</td><td>Brief initial state before first fetch starts</td></tr>
          <tr><td><code>&quot;loading&quot;</code></td><td>Skeleton / spinner</td><td>First load only — subsequent refreshes don&apos;t reset status</td></tr>
          <tr><td><code>&quot;ready&quot;</code></td><td>Your inbox UI</td><td><code>items</code> is populated</td></tr>
          <tr><td><code>&quot;error&quot;</code></td><td>Error message + retry button</td><td>Usually a 401 (session expired) or network failure</td></tr>
        </tbody>
      </table>
      <div className="callout callout-tip">
        <strong>Mutations don&apos;t change status.</strong> Calling{" "}
        <code>markRead()</code> or <code>archive()</code> updates the item
        optimistically without flipping status back to <code>&quot;loading&quot;</code>.
        If the server rejects, the item reverts silently. Handle mutation errors
        with a try/catch on the returned promise.
      </div>

      <h2>usePreferences()</h2>
      <p>
        Fetches and manages the current user&apos;s notification preferences.
        Updates are optimistic — the UI updates immediately, then reverts on
        error.
      </p>

      <table>
        <thead>
          <tr><th>Return field</th><th>Type</th><th>Description</th></tr>
        </thead>
        <tbody>
          <tr><td><code>items</code></td><td><code>RecipientPreference[]</code></td><td>All preferences for this user</td></tr>
          <tr><td><code>status</code></td><td><code>&quot;idle&quot; | &quot;loading&quot; | &quot;ready&quot; | &quot;error&quot;</code></td><td>Fetch state</td></tr>
          <tr><td><code>error</code></td><td><code>string | null</code></td><td>Error message if fetch/update failed</td></tr>
          <tr><td><code>isEnabled(id, channel)</code></td><td><code>boolean</code></td><td>Check if a channel is enabled for a notification</td></tr>
          <tr><td><code>update(input)</code></td><td><code>Promise&lt;RecipientPreference&gt;</code></td><td>Toggle channels (optimistic)</td></tr>
          <tr><td><code>refresh()</code></td><td><code>Promise&lt;RecipientPreference[]&gt;</code></td><td>Re-fetch from server</td></tr>
        </tbody>
      </table>

      <Code
        filename="components/notification-settings.tsx"
        code={`import { usePreferences } from "@notifykitjs/react"

function NotificationSettings() {
  const { isEnabled, update } = usePreferences()

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

      <h3>Full preferences page</h3>
      <p>
        A real settings page lists all notifications (grouped by category)
        with per-channel toggles. Combine <code>usePreferences</code> with
        the notification metadata endpoint:
      </p>
      <Code
        code={`import { usePreferences } from "@notifykitjs/react"
import { createNotifyKitClient } from "@notifykitjs/react"
import { useEffect, useState } from "react"

const client = createNotifyKitClient({ baseUrl: "/api/notifykit" })

type NotificationMeta = {
  id: string
  description?: string
  category?: string
  channels: string[]
  required?: boolean
}

function NotificationPreferencesPage() {
  const { isEnabled, update, status } = usePreferences()
  const [notifications, setNotifications] = useState<NotificationMeta[]>([])

  useEffect(() => {
    client.notifications.list().then(setNotifications)
  }, [])

  if (status === "loading" || notifications.length === 0) {
    return <p>Loading preferences...</p>
  }

  // Group by category
  const grouped = Object.groupBy(notifications, n => n.category ?? "General")

  return (
    <div className="preferences-page">
      <h1>Notification settings</h1>
      <p>Choose how you want to be notified for each type of event.</p>

      {Object.entries(grouped).map(([category, items]) => (
        <section key={category}>
          <h2>{category}</h2>
          <table>
            <thead>
              <tr>
                <th>Notification</th>
                <th>Inbox</th>
                <th>Email</th>
              </tr>
            </thead>
            <tbody>
              {items?.map(n => (
                <tr key={n.id}>
                  <td>
                    <strong>{n.id.replace(/_/g, " ")}</strong>
                    {n.description && <p>{n.description}</p>}
                    {n.required && <span className="badge">Required</span>}
                  </td>
                  {["inbox", "email"].map(ch => (
                    <td key={ch}>
                      {n.channels.includes(ch) ? (
                        <input
                          type="checkbox"
                          checked={isEnabled(n.id, ch)}
                          disabled={n.required}
                          onChange={e => update({
                            notificationId: n.id,
                            channels: { [ch]: e.target.checked },
                          })}
                          aria-label={\`\${ch} for \${n.id.replace(/_/g, " ")}\`}
                        />
                      ) : (
                        <span aria-label="Not available">—</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  )
}`}
      />
      <table>
        <thead>
          <tr><th>Detail</th><th>Why</th></tr>
        </thead>
        <tbody>
          <tr><td><code>notifications.list()</code></td><td>Fetches registered notification metadata — IDs, channels, categories, and required flags</td></tr>
          <tr><td><code>Object.groupBy()</code></td><td>Groups notifications by their <code>category</code> field for a cleaner settings layout</td></tr>
          <tr><td><code>n.required</code></td><td>Required notifications can&apos;t be toggled off — disable the checkbox and show a badge</td></tr>
          <tr><td><code>n.channels.includes(ch)</code></td><td>Only show a toggle if that notification actually supports the channel</td></tr>
        </tbody>
      </table>
      <div className="callout callout-tip">
        <strong>Optimistic by default.</strong> The <code>update()</code> call
        toggles the checkbox immediately, then syncs with the server. If the
        server rejects (e.g. trying to disable a required notification), the
        checkbox reverts. No loading spinners needed for individual toggles.
      </div>

      <h2>useUnreadCount()</h2>
      <p>
        A lightweight hook that returns only the unread notification count.
        Use it when you need a badge number but don&apos;t need the full inbox
        payload — it skips fetching items entirely, so it&apos;s cheaper on
        bandwidth and renders faster.
      </p>

      <table>
        <thead>
          <tr><th>Return field</th><th>Type</th><th>Description</th></tr>
        </thead>
        <tbody>
          <tr><td><code>unreadCount</code></td><td><code>number</code></td><td>Current unread notification count</td></tr>
          <tr><td><code>status</code></td><td><code>&quot;idle&quot; | &quot;loading&quot; | &quot;ready&quot; | &quot;error&quot;</code></td><td>Fetch state</td></tr>
          <tr><td><code>error</code></td><td><code>string | null</code></td><td>Error message if the count request failed</td></tr>
          <tr><td><code>refresh()</code></td><td><code>Promise&lt;number&gt;</code></td><td>Manually re-fetch the count</td></tr>
        </tbody>
      </table>

      <h3>Options</h3>
      <table>
        <thead>
          <tr><th>Option</th><th>Type</th><th>Default</th><th>Description</th></tr>
        </thead>
        <tbody>
          <tr><td><code>pollInterval</code></td><td><code>number | false</code></td><td><code>false</code></td><td>Milliseconds between automatic re-fetches. Set to <code>false</code> to rely on realtime updates only.</td></tr>
        </tbody>
      </table>

      <Code
        code={`import { useUnreadCount } from "@notifykitjs/react"

function NotificationBadge() {
  const { unreadCount } = useUnreadCount({ pollInterval: 10_000 })

  if (unreadCount === 0) return null

  return (
    <span className="badge">{unreadCount > 99 ? "99+" : unreadCount}</span>
  )
}`}
      />

      <h3>When to use useUnreadCount() vs useInbox()</h3>
      <div className="features" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div className="feature-card">
          <h3>useUnreadCount()</h3>
          <p>You only need the badge number — nav bars, tab titles, app icons. Skips fetching full items.</p>
        </div>
        <div className="feature-card">
          <h3>useInbox().unreadCount</h3>
          <p>You already render the inbox list. No extra request — the count comes free with the items payload.</p>
        </div>
      </div>
      <div className="callout callout-info">
        <strong>Both stay in sync.</strong> If you mount both hooks on the same
        page, they share the same realtime connection. Marking an item read
        via <code>useInbox</code> decrements <code>useUnreadCount</code> automatically.
      </div>

      <h2>Pre-built components</h2>
      <table>
        <thead>
          <tr><th>Component</th><th>What it renders</th><th>Customization</th></tr>
        </thead>
        <tbody>
          <tr><td><code>&lt;NotificationBell /&gt;</code></td><td>Unread count badge</td><td><code>render</code> prop</td></tr>
          <tr><td><code>&lt;Inbox /&gt;</code></td><td>Full inbox list with actions</td><td><code>renderItem</code>, <code>emptyState</code></td></tr>
        </tbody>
      </table>

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

      <div className="callout callout-tip">
        <strong>Common pattern.</strong> Use <code>&lt;NotificationBell /&gt;</code>{" "}
        in your nav bar and <code>&lt;Inbox /&gt;</code> in a dropdown or
        dedicated page. Both share the same <code>useInbox()</code> state
        under the hood — the unread count updates when items are read.
      </div>

      <h2>Client SDK (advanced)</h2>
      <div className="callout callout-tip">
        <strong>Not using React?</strong> The client SDK is the same HTTP
        layer that powers the hooks — just without the React state management.
        Use it with Vue, Svelte, vanilla JS, or server-side scripts.
      </div>
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

      <h2>Putting it together</h2>
      <p>
        The most common pattern: a bell icon in your nav that opens a
        notification dropdown. Both components share state automatically
        through the provider.
      </p>
      <Code
        code={`import { useInbox } from "@notifykitjs/react"
import { useState } from "react"

function NotificationCenter() {
  const { items, unreadCount, markRead, markAllRead } = useInbox()
  const [open, setOpen] = useState(false)

  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)}>
        🔔 {unreadCount > 0 && <span className="badge">{unreadCount}</span>}
      </button>

      {open && (
        <div className="dropdown">
          <div className="header">
            <span>Notifications</span>
            {unreadCount > 0 && (
              <button onClick={markAllRead}>Mark all read</button>
            )}
          </div>
          {items.length === 0
            ? <p>You're all caught up!</p>
            : items.map(item => (
                <a
                  key={item.id}
                  href={item.actionUrl ?? "#"}
                  onClick={() => !item.readAt && markRead(item.id)}
                  className={item.readAt ? "read" : "unread"}
                >
                  <strong>{item.title}</strong>
                  {item.body && <p>{item.body}</p>}
                </a>
              ))
          }
        </div>
      )}
    </div>
  )
}`}
      />

      <h2>Realtime</h2>
      <p>
        When a <Link href="/docs/realtime">realtime adapter</Link> is
        configured server-side, <code>useInbox()</code> automatically
        connects and receives live updates. New inbox items appear
        instantly, and the unread count updates in real time.
      </p>
      <table>
        <thead>
          <tr><th><code>realtimeStatus</code></th><th>Meaning</th><th>User experience</th></tr>
        </thead>
        <tbody>
          <tr><td><code>&quot;connected&quot;</code></td><td>SSE stream open</td><td>New items appear instantly without refresh</td></tr>
          <tr><td><code>&quot;connecting&quot;</code></td><td>Handshake in progress</td><td>Show a subtle loading indicator</td></tr>
          <tr><td><code>&quot;disconnected&quot;</code></td><td>No realtime adapter configured</td><td>Falls back to polling on <code>refresh()</code></td></tr>
        </tbody>
      </table>
      <div className="callout callout-tip">
        <strong>No config needed client-side.</strong> The React hooks
        detect the SSE endpoint automatically. If the server has a
        realtime adapter, the client connects. If not, everything works
        the same — just without live pushes.
      </div>

      <h2>Common UI recipes</h2>
      <p>
        Real-world inbox UIs need more than a flat list. These patterns
        use the same <code>useInbox()</code> data — no extra API calls.
      </p>

      <h3>Filtering: all / unread / archived</h3>
      <Code
        code={`function FilteredInbox() {
  const { items, refresh } = useInbox()
  const [tab, setTab] = useState<"all" | "unread" | "archived">("all")

  const filtered = items.filter(item => {
    if (tab === "unread") return !item.readAt
    if (tab === "archived") return !!item.archivedAt
    return !item.archivedAt // "all" = non-archived
  })

  return (
    <>
      <nav className="tabs" role="tablist">
        {(["all", "unread", "archived"] as const).map(t => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
          >
            {t === "all" ? "All" : t === "unread" ? "Unread" : "Archived"}
          </button>
        ))}
      </nav>
      {filtered.length === 0
        ? <p className="empty">No {tab} notifications</p>
        : filtered.map(item => <NotificationCard key={item.id} item={item} />)
      }
    </>
  )
}`}
      />

      <h3>Grouping by date</h3>
      <Code
        code={`function GroupedInbox() {
  const { items } = useInbox()

  const groups = Object.groupBy(items, item => {
    const d = new Date(item.createdAt)
    const today = new Date()
    if (d.toDateString() === today.toDateString()) return "Today"
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    if (d.toDateString() === yesterday.toDateString()) return "Yesterday"
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" })
  })

  return (
    <>
      {Object.entries(groups).map(([label, groupItems]) => (
        <section key={label}>
          <h4 className="group-label">{label}</h4>
          {groupItems.map(item => <NotificationCard key={item.id} item={item} />)}
        </section>
      ))}
    </>
  )
}`}
      />

      <h3>Rendering by notification type</h3>
      <p>
        Real inboxes render different notification types with different UIs —
        a team invite needs action buttons, a comment mention shows a preview,
        and a deploy notification shows a status badge. Use{" "}
        <code>item.notificationId</code> to branch:
      </p>
      <Code
        code={`function TypedNotificationCard({ item, markRead }: {
  item: InboxItem
  markRead: (id: string) => Promise<InboxItem>
}) {
  switch (item.notificationId) {
    case "team_invite":
      return (
        <div className="notification-card notification-card--invite">
          <strong>{item.title}</strong>
          <div className="notification-actions">
            <button onClick={() => acceptInvite(item)}>Accept</button>
            <button onClick={() => declineInvite(item)}>Decline</button>
          </div>
        </div>
      )

    case "comment_mentioned":
      return (
        <div className="notification-card notification-card--mention">
          <strong>{item.title}</strong>
          {item.body && <blockquote>{item.body}</blockquote>}
          <a href={item.actionUrl ?? "#"}>View thread</a>
        </div>
      )

    case "deploy_succeeded":
    case "deploy_failed":
      return (
        <div className="notification-card notification-card--deploy">
          <span className={item.notificationId === "deploy_succeeded" ? "badge-green" : "badge-red"}>
            {item.notificationId === "deploy_succeeded" ? "✓" : "✗"}
          </span>
          <strong>{item.title}</strong>
          {item.actionUrl && <a href={item.actionUrl}>View logs</a>}
        </div>
      )

    default:
      return (
        <div className="notification-card">
          <strong>{item.title}</strong>
          {item.body && <p>{item.body}</p>}
          {!item.readAt && (
            <button onClick={() => markRead(item.id)}>Dismiss</button>
          )}
        </div>
      )
  }
}`}
      />
      <table>
        <thead>
          <tr><th>Pattern</th><th>When to use</th><th>Consideration</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Switch on <code>notificationId</code></strong></td>
            <td>3–10 notification types with distinct UIs</td>
            <td>Simple and explicit. Add a <code>default</code> case for unknown types to avoid blank cards after deploys.</td>
          </tr>
          <tr>
            <td><strong>Registry object</strong></td>
            <td>10+ types or dynamic rendering (plugins, third-party)</td>
            <td>Map <code>notificationId → Component</code>. Scales without long switch blocks.</td>
          </tr>
          <tr>
            <td><strong>Feature-based branching</strong></td>
            <td>Shared structure with small variations (badge color, icon)</td>
            <td>One component with conditional props. Best when types differ only in accent, not layout.</td>
          </tr>
        </tbody>
      </table>
      <Code
        code={`// Registry pattern — scales to many types without a long switch
const RENDERERS: Record<string, React.ComponentType<{ item: InboxItem }>> = {
  team_invite: InviteCard,
  comment_mentioned: MentionCard,
  deploy_succeeded: DeployCard,
  deploy_failed: DeployCard,
}

function NotificationCard({ item }: { item: InboxItem }) {
  const Renderer = RENDERERS[item.notificationId] ?? GenericCard
  return <Renderer item={item} />
}`}
      />
      <div className="callout callout-tip">
        <strong>Always include a default renderer.</strong> When you add a new
        notification type server-side, users with an older client bundle will
        receive items with an unrecognized <code>notificationId</code>. The
        default case prevents blank cards between deploys.
      </div>

      <h3>Infinite scroll / load more</h3>
      <Code
        code={`function PaginatedInbox() {
  const { items, status } = useInbox()
  const [visibleCount, setVisibleCount] = useState(10)

  const visible = items.slice(0, visibleCount)
  const hasMore = visibleCount < items.length

  return (
    <>
      {visible.map(item => <NotificationCard key={item.id} item={item} />)}
      {hasMore && (
        <button onClick={() => setVisibleCount(c => c + 10)}>
          Load more ({items.length - visibleCount} remaining)
        </button>
      )}
    </>
  )
}`}
      />

      <table>
        <thead>
          <tr><th>Pattern</th><th>When to use</th><th>Consideration</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Tab filtering</strong></td>
            <td>Inbox with 20+ items where unread matters</td>
            <td>Client-side filter — all items are already loaded by the hook</td>
          </tr>
          <tr>
            <td><strong>Date grouping</strong></td>
            <td>Activity feed or timeline-style UI</td>
            <td>Use <code>Object.groupBy()</code> (ES2024) or a polyfill</td>
          </tr>
          <tr>
            <td><strong>Load more / infinite scroll</strong></td>
            <td>Large inboxes (100+ items)</td>
            <td>Slice the already-fetched array — for true pagination, pass <code>limit</code> to the API</td>
          </tr>
          <tr>
            <td><strong>Empty states per tab</strong></td>
            <td>Always — avoids confusing blank screens</td>
            <td>Different message per tab: &quot;All caught up!&quot; vs &quot;No archived items&quot;</td>
          </tr>
        </tbody>
      </table>
      <div className="callout callout-tip">
        <strong>All filtering is client-side.</strong> The hook fetches the full
        inbox once. Tabs, grouping, and search filter the same array in memory —
        no extra network requests. For server-side filtering (large inboxes),
        pass <code>?archived=true</code> or <code>?limit=50</code> to the REST
        API directly via <code>createNotifyKitClient()</code>.
      </div>

      <h2>Toast notifications on new items</h2>
      <p>
        The inbox list shows history — but users want to <em>know immediately</em>{" "}
        when something new arrives. A toast (temporary popup) bridges that gap.
        Here&apos;s how to react to new realtime items and show a transient
        notification:
      </p>
      <Code
        code={`import { useInbox } from "@notifykitjs/react"
import { useEffect, useRef, useState } from "react"

function useNotificationToast() {
  const { items } = useInbox()
  const [toast, setToast] = useState<{ id: string; title: string } | null>(null)
  const prevCount = useRef(items.length)

  useEffect(() => {
    // Only trigger on new items (count increased), not on initial load
    if (items.length > prevCount.current && prevCount.current > 0) {
      const newest = items[0]
      setToast({ id: newest.id, title: newest.title })

      // Auto-dismiss after 5 seconds
      const timer = setTimeout(() => setToast(null), 5000)
      return () => clearTimeout(timer)
    }
    prevCount.current = items.length
  }, [items.length])

  return { toast, dismiss: () => setToast(null) }
}

function AppLayout({ children }: { children: React.ReactNode }) {
  const { toast, dismiss } = useNotificationToast()

  return (
    <>
      {children}
      {toast && (
        <div className="toast" role="status" aria-live="polite">
          <span>{toast.title}</span>
          <button onClick={dismiss} aria-label="Dismiss">×</button>
        </div>
      )}
    </>
  )
}`}
      />
      <table>
        <thead>
          <tr><th>Decision</th><th>Why</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>Check <code>prevCount &gt; 0</code></td>
            <td>Prevents a toast on initial page load — only triggers for live arrivals</td>
          </tr>
          <tr>
            <td>Use <code>items[0]</code> as the newest</td>
            <td>Items are sorted newest-first by default. If you re-sort, adjust the index.</td>
          </tr>
          <tr>
            <td>Auto-dismiss after 5 seconds</td>
            <td>Toasts shouldn&apos;t require action. Persistent popups become banner blindness.</td>
          </tr>
          <tr>
            <td><code>role=&quot;status&quot;</code> + <code>aria-live=&quot;polite&quot;</code></td>
            <td>Screen readers announce the toast without interrupting the current task</td>
          </tr>
        </tbody>
      </table>

      <h3>Stacking multiple toasts</h3>
      <p>
        When notifications arrive in rapid succession (e.g. during a broadcast),
        queue them instead of replacing:
      </p>
      <Code
        code={`function useToastQueue(maxVisible = 3) {
  const { items } = useInbox()
  const [toasts, setToasts] = useState<Array<{ id: string; title: string }>>([])
  const prevCount = useRef(items.length)

  useEffect(() => {
    if (items.length > prevCount.current && prevCount.current > 0) {
      const newest = items[0]
      setToasts(prev => [{ id: newest.id, title: newest.title }, ...prev].slice(0, maxVisible))

      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== newest.id))
      }, 5000)
    }
    prevCount.current = items.length
  }, [items.length])

  return { toasts, dismiss: (id: string) => setToasts(prev => prev.filter(t => t.id !== id)) }
}`}
      />
      <div className="callout callout-tip">
        <strong>Cap visible toasts at 3.</strong> More than three stacked toasts
        overwhelm the screen. If a burst arrives (5 notifications in 2 seconds),
        show the first 3 and let them auto-dismiss — the inbox list has the rest.
        For digest-worthy bursts, consider showing &quot;3 new notifications&quot;
        as a single toast instead.
      </div>

      <h2>Accessibility</h2>
      <p>
        Notification UIs are difficult to get right for screen readers and
        keyboard users. Follow these patterns to ensure all users can interact
        with their notifications:
      </p>
      <table>
        <thead>
          <tr><th>Pattern</th><th>Why</th><th>Implementation</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Live region for new items</strong></td>
            <td>Screen readers announce new notifications without focus change</td>
            <td><code>aria-live=&quot;polite&quot;</code> on the inbox container</td>
          </tr>
          <tr>
            <td><strong>Badge announces count</strong></td>
            <td>Users can&apos;t see a visual badge — they need a text equivalent</td>
            <td><code>aria-label={`\`\${unreadCount} unread notifications\``}</code></td>
          </tr>
          <tr>
            <td><strong>Keyboard-navigable list</strong></td>
            <td>Arrow keys should move between items, Enter/Space should activate</td>
            <td><code>role=&quot;listbox&quot;</code> with <code>role=&quot;option&quot;</code> children</td>
          </tr>
          <tr>
            <td><strong>Action buttons labeled</strong></td>
            <td>&quot;Mark read&quot; is ambiguous without context of which item</td>
            <td><code>aria-label={`\`Mark \${item.title} as read\``}</code></td>
          </tr>
        </tbody>
      </table>
      <Code
        code={`function AccessibleInbox() {
  const { items, unreadCount, markRead } = useInbox()

  return (
    <>
      <button aria-label={\`Notifications, \${unreadCount} unread\`}>
        🔔 {unreadCount > 0 && <span aria-hidden="true">{unreadCount}</span>}
      </button>

      <ul role="listbox" aria-label="Notifications" aria-live="polite">
        {items.map(item => (
          <li key={item.id} role="option" aria-selected={!item.readAt}>
            <a href={item.actionUrl ?? "#"}>
              <strong>{item.title}</strong>
              {item.body && <p>{item.body}</p>}
            </a>
            {!item.readAt && (
              <button
                aria-label={\`Mark "\${item.title}" as read\`}
                onClick={() => markRead(item.id)}
              >
                Dismiss
              </button>
            )}
          </li>
        ))}
      </ul>
    </>
  )
}`}
      />
      <div className="callout callout-tip">
        <strong>Test with VoiceOver or NVDA.</strong> Open your inbox, send a
        test notification, and verify the screen reader announces it without
        stealing focus. Then tab through the list and confirm every action
        is reachable and labeled.
      </div>

      <h2>Testing components</h2>
      <p>
        Components that use NotifyKit hooks need a provider wrapper in tests.
        The provider talks to a real (in-memory) NotifyKit instance — no
        HTTP mocking needed.
      </p>

      <table>
        <thead>
          <tr><th>Approach</th><th>Speed</th><th>What it tests</th><th>Best for</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>In-memory handler</strong></td>
            <td>Sub-millisecond</td>
            <td>Full round-trip: hook → API → database → response</td>
            <td>Most component tests — realistic without network</td>
          </tr>
          <tr>
            <td><strong>Mock fetch</strong></td>
            <td>Instant</td>
            <td>Component rendering given specific API responses</td>
            <td>Edge cases (errors, empty states, malformed data)</td>
          </tr>
          <tr>
            <td><strong>E2E (Playwright/Cypress)</strong></td>
            <td>Seconds</td>
            <td>Real browser, real server, real SSE</td>
            <td>Smoke tests, realtime behavior, cross-browser</td>
          </tr>
        </tbody>
      </table>

      <Code
        code={`import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect, beforeEach } from "vitest"
import { NotifyKitProvider } from "@notifykitjs/react"
import { createNotifyKit, memoryAdapter, fakeEmailProvider, createHandler } from "@notifykitjs/core"
import { commentMentioned } from "@/lib/notifications"
import { InboxPage } from "./inbox-page" // your component

// 1. Create a test NotifyKit instance with in-memory everything
const testNotify = createNotifyKit({
  notifications: [commentMentioned] as const,
  database: memoryAdapter(),
  providers: { email: fakeEmailProvider() },
})

// 2. Create a handler that the provider will call
const handler = createHandler(testNotify, {
  identify: async () => ({ recipientId: "test_user" }),
})

// 3. Wrapper that intercepts fetch and routes to the handler
function TestWrapper({ children }: { children: React.ReactNode }) {
  return (
    <NotifyKitProvider
      options={{ baseUrl: "/api/notifykit", fetcher: (url, init) => handler(new Request(url, init)) }}
    >
      {children}
    </NotifyKitProvider>
  )
}

describe("InboxPage", () => {
  beforeEach(async () => {
    await testNotify.upsertRecipient({ id: "test_user", email: "test@test.com" })
  })

  it("renders inbox items after send", async () => {
    await testNotify.send({
      recipientId: "test_user",
      notificationId: "comment_mentioned",
      payload: { actorName: "Rey", postUrl: "/p/1" },
    })

    render(<InboxPage />, { wrapper: TestWrapper })

    await waitFor(() => {
      expect(screen.getByText(/Rey mentioned you/)).toBeInTheDocument()
    })
  })

  it("marks item as read on click", async () => {
    await testNotify.send({
      recipientId: "test_user",
      notificationId: "comment_mentioned",
      payload: { actorName: "Sam", postUrl: "/p/2" },
    })

    render(<InboxPage />, { wrapper: TestWrapper })

    await waitFor(() => {
      expect(screen.getByText(/Sam mentioned you/)).toBeInTheDocument()
    })

    await userEvent.click(screen.getByRole("button", { name: /mark.*read/i }))

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /mark.*read/i })).not.toBeInTheDocument()
    })
  })

  it("shows empty state when inbox is empty", async () => {
    render(<InboxPage />, { wrapper: TestWrapper })

    await waitFor(() => {
      expect(screen.getByText(/no notifications/i)).toBeInTheDocument()
    })
  })
})`}
      />

      <h3>Testing preferences toggles</h3>
      <Code
        code={`import { PreferencesPage } from "./preferences-page"

it("toggles email off for a notification", async () => {
  render(<PreferencesPage />, { wrapper: TestWrapper })

  await waitFor(() => {
    expect(screen.getByLabelText(/email.*comment/i)).toBeChecked()
  })

  await userEvent.click(screen.getByLabelText(/email.*comment/i))

  await waitFor(() => {
    expect(screen.getByLabelText(/email.*comment/i)).not.toBeChecked()
  })

  // Verify the preference persisted
  const e = await testNotify.explain({
    recipientId: "test_user",
    notificationId: "comment_mentioned",
    payload: { actorName: "Rey", postUrl: "/p/1" },
  })
  expect(e.channels.email.outcome).toBe("disabled")
})`}
      />

      <h3>Testing error states</h3>
      <Code
        code={`// For testing error UI, use a mock fetcher that rejects
function ErrorWrapper({ children }: { children: React.ReactNode }) {
  return (
    <NotifyKitProvider
      options={{
        baseUrl: "/api/notifykit",
        fetcher: () => Promise.resolve(new Response(null, { status: 401 })),
      }}
    >
      {children}
    </NotifyKitProvider>
  )
}

it("shows error state on 401", async () => {
  render(<InboxPage />, { wrapper: ErrorWrapper })

  await waitFor(() => {
    expect(screen.getByText(/failed to load/i)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument()
  })
})`}
      />

      <table>
        <thead>
          <tr><th>What to test</th><th>How</th><th>Catches</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>Items render after send</td>
            <td>Send via <code>testNotify</code>, assert DOM</td>
            <td>Broken data mapping, missing fields, template errors</td>
          </tr>
          <tr>
            <td>Mark read updates UI</td>
            <td>Click button, assert item changes visually</td>
            <td>Optimistic update bugs, missing API calls</td>
          </tr>
          <tr>
            <td>Empty state shows</td>
            <td>Render with no items, assert placeholder</td>
            <td>Conditional rendering bugs, flash of wrong state</td>
          </tr>
          <tr>
            <td>Error state with retry</td>
            <td>Mock 401 response, click retry</td>
            <td>Missing error handling, broken retry logic</td>
          </tr>
          <tr>
            <td>Preference toggle persists</td>
            <td>Click checkbox, verify via <code>explain()</code></td>
            <td>Optimistic revert, scope mismatch, wrong API payload</td>
          </tr>
          <tr>
            <td>Unread count badge</td>
            <td>Send items, assert count in DOM</td>
            <td>Stale count, count not updating after markRead</td>
          </tr>
        </tbody>
      </table>

      <div className="callout callout-tip">
        <strong>No HTTP mocking library needed.</strong> The{" "}
        <code>fetcher</code> option on the provider accepts a custom fetch
        function. Point it at your in-memory handler and your tests exercise
        the real API contract — serialization, status codes, and all — without
        network I/O or <code>msw</code> setup.
      </div>

      <h2>Troubleshooting</h2>
      <p>
        Most hook issues come from provider misconfiguration or timing
        mismatches between server sends and client state. Match your symptom
        to the fix:
      </p>
      <table>
        <thead>
          <tr><th>Symptom</th><th>Cause</th><th>Fix</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><code>useInbox()</code> returns empty <code>items</code> forever</td>
            <td><code>&lt;NotifyKitProvider&gt;</code> missing or <code>baseUrl</code> wrong</td>
            <td>Wrap your layout in the provider. Check DevTools Network tab — you should see a request to <code>/api/notifykit/inbox</code>.</td>
          </tr>
          <tr>
            <td>Hook returns <code>status: &quot;error&quot;</code> with no details</td>
            <td><code>identify()</code> returns <code>null</code> — user isn&apos;t authenticated</td>
            <td>The handler returns 401 when identity can&apos;t be resolved. Verify session cookies are sent (<code>credentials: &quot;include&quot;</code> is set by the SDK).</td>
          </tr>
          <tr>
            <td>Items appear on refresh but not in realtime</td>
            <td>No realtime adapter configured server-side</td>
            <td>Check <code>realtimeStatus</code> — if <code>&quot;disconnected&quot;</code>, add a realtime adapter to <code>createNotifyKit()</code>. See <Link href="/docs/realtime">Realtime</Link>.</td>
          </tr>
          <tr>
            <td>SSE reconnects every few seconds in dev</td>
            <td>Next.js HMR or React Strict Mode remounting the component</td>
            <td>Expected in development — the hook cleans up and reconnects on remount. Doesn&apos;t happen in production builds.</td>
          </tr>
          <tr>
            <td><code>markRead()</code> works visually but reverts after 1 second</td>
            <td>Server rejected the mutation (wrong recipient or tenant scope)</td>
            <td>Check the Network tab for a non-200 response. The <code>identify()</code> scope must match the item&apos;s scope.</td>
          </tr>
          <tr>
            <td>Preferences toggle doesn&apos;t persist across page reloads</td>
            <td><code>tenantId</code> mismatch between client and server contexts</td>
            <td>If your app uses multi-tenancy, ensure <code>identify()</code> returns the same <code>tenantId</code> as the original <code>send()</code>.</td>
          </tr>
          <tr>
            <td>Unread count badge doesn&apos;t update when <code>useInbox()</code> marks items read</td>
            <td>Using <code>useUnreadCount()</code> in a component outside the same provider tree</td>
            <td>Both hooks must share the same <code>&lt;NotifyKitProvider&gt;</code> ancestor. One provider per app, usually in the root layout.</td>
          </tr>
          <tr>
            <td>TypeScript error: <code>Cannot find module &apos;@notifykitjs/react&apos;</code></td>
            <td>Package not installed, or <code>moduleResolution</code> is too restrictive</td>
            <td>Run <code>npm install @notifykitjs/react</code>. Ensure <code>tsconfig.json</code> uses <code>&quot;moduleResolution&quot;: &quot;bundler&quot;</code> or <code>&quot;node16&quot;</code>.</td>
          </tr>
        </tbody>
      </table>
      <div className="callout callout-tip">
        <strong>Debug with the Network tab first.</strong> Hooks are thin
        wrappers around HTTP calls to your handler. If the Network tab shows
        successful responses with data, the issue is in your rendering logic.
        If it shows errors or empty responses, the issue is server-side
        (auth, routing, or missing data).
      </div>

      <h3>Development vs production behavior</h3>
      <p>
        Some behaviors differ between development and production. Know which
        &quot;bugs&quot; are just dev-mode artifacts:
      </p>
      <table>
        <thead>
          <tr><th>Behavior</th><th>In development</th><th>In production</th><th>Why</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>SSE connects twice on mount</td>
            <td>Yes (React Strict Mode)</td>
            <td>No — single connection</td>
            <td>Strict Mode mounts → unmounts → remounts to catch cleanup bugs</td>
          </tr>
          <tr>
            <td>Inbox flashes empty then loads</td>
            <td>More noticeable (slower HMR rebuild)</td>
            <td>Sub-100ms in production</td>
            <td>Dev server is slower; production serves from cache</td>
          </tr>
          <tr>
            <td>Console warning about unmounted state update</td>
            <td>Occasionally during HMR</td>
            <td>Never</td>
            <td>HMR swaps components while async operations are in-flight</td>
          </tr>
          <tr>
            <td>Data resets between saves</td>
            <td>Yes (if using <code>memoryAdapter()</code>)</td>
            <td>No — persistent database</td>
            <td>In-memory adapter loses state on server restart. Use SQLite for persistent dev data.</td>
          </tr>
        </tbody>
      </table>

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

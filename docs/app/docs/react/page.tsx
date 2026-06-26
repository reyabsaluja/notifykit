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
      <div className="overview-flow">
        <div className="overview-flow-step">
          <span className="overview-flow-number">?</span>
          <div>
            <strong>Do you need a custom design?</strong>
            <p>Yes → use <strong>hooks</strong> (<code>useInbox</code>, <code>usePreferences</code>). No → use <strong>components</strong> (<code>&lt;Inbox /&gt;</code>, <code>&lt;NotificationBell /&gt;</code>) for instant UI.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">?</span>
          <div>
            <strong>Are you using React?</strong>
            <p>Yes → hooks or components (both work). No → use <strong>createNotifyKitClient</strong> directly — same HTTP layer, no React dependency.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">?</span>
          <div>
            <strong>Do you need realtime updates?</strong>
            <p>Configure a <Link href="/docs/realtime">realtime adapter</Link> server-side. Hooks connect automatically — no client config needed.</p>
          </div>
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
      <div className="callout">
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
      <div className="callout">
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

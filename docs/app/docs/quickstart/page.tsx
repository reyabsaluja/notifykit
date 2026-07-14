import type { Metadata } from "next";
import Link from "next/link";
import { Code } from "../../_components/code";

export const metadata: Metadata = { title: "Quickstart" };

export default function QuickstartPage() {
  return (
    <article>
      <h1>Quickstart</h1>
      <p>
        Get a working notification system in under 5 minutes. This guide
        uses the starter scaffold — a Next.js app with everything wired up.
      </p>

      <h2>Create the app</h2>
      <Code
        lang="bash"
        code={`npx create-notifykit-app my-app
cd my-app
cp .env.example .env.local
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# paste the output as NOTIFYKIT_SECRET in .env.local
npm install
npm run dev`}
      />
      <p>
        Open <code>http://localhost:3000</code>. The scaffold uses the
        in-memory adapter and a fake email provider — everything works
        offline.
      </p>

      <table>
        <thead>
          <tr><th>Step</th><th>Takes</th><th>You know it worked when</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><code>npx create-notifykit-app</code></td>
            <td>~10s</td>
            <td>Directory created with <code>package.json</code></td>
          </tr>
          <tr>
            <td><code>npm install</code></td>
            <td>~15s</td>
            <td>No errors in terminal, <code>node_modules</code> exists</td>
          </tr>
          <tr>
            <td><code>npm run dev</code></td>
            <td>~3s</td>
            <td>Terminal shows <code>Ready on http://localhost:3000</code></td>
          </tr>
          <tr>
            <td>Open browser</td>
            <td>Instant</td>
            <td>You see the scaffold homepage with an inbox UI and a &quot;Send test&quot; button</td>
          </tr>
        </tbody>
      </table>

      <h2>What you get</h2>
      <div className="features">
        <div className="feature-card">
          <h3>Notification definitions</h3>
          <p><code>lib/notifykit.ts</code> with typed payloads and channel configs ready to edit.</p>
        </div>
        <div className="feature-card">
          <h3>API route handler</h3>
          <p><code>/api/notifykit/[...route]</code> — inbox, preferences, and unsubscribe endpoints wired up.</p>
        </div>
        <div className="feature-card">
          <h3>Preferences UI</h3>
          <p>A settings page where users toggle channels per notification, with optimistic updates.</p>
        </div>
        <div className="feature-card">
          <h3>Realtime inbox</h3>
          <p>New notifications appear instantly. Read/unread, archive, and delete out of the box.</p>
        </div>
        <div className="feature-card">
          <h3>Signed unsubscribes</h3>
          <p>HMAC-SHA256 one-click unsubscribe links in every email. RFC 8058 compliant.</p>
        </div>
        <div className="feature-card">
          <h3>Works offline</h3>
          <p>In-memory adapter + fake email provider. No API keys, no database setup for local dev.</p>
        </div>
      </div>

      <h2>Scaffold file tree</h2>
      <p>
        The scaffold creates a small, focused structure. Here&apos;s where
        everything lives — you&apos;ll edit 2–3 of these files in the first
        session:
      </p>
      <Code
        code={`my-app/
├── app/
│   ├── api/
│   │   └── notifykit/
│   │       └── [...notifykit]/
│   │           └── route.ts        ← Handler: auth + all REST endpoints
│   ├── layout.tsx                  ← Wraps app in <NotifyKitProvider>
│   ├── page.tsx                    ← Demo page with "Send test" button
│   └── settings/
│       └── notifications/
│           └── page.tsx            ← Preferences UI (channel toggles)
├── components/
│   └── inbox.tsx                   ← Notification bell + item list
├── lib/
│   ├── notifykit.ts                ← START HERE: definitions + config
│   └── auth.ts                     ← identify() wiring (stub in scaffold)
├── .env.example
├── .env.local                      ← Your NOTIFYKIT_SECRET
└── package.json`}
      />
      <table>
        <thead>
          <tr><th>File</th><th>You&apos;ll edit it to</th><th>Guide</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><code>lib/notifykit.ts</code></td>
            <td>Add notifications, change channels, swap providers</td>
            <td><Link href="/docs/defining">Defining</Link></td>
          </tr>
          <tr>
            <td><code>api/.../route.ts</code></td>
            <td>Wire real auth into <code>identify()</code></td>
            <td><Link href="/docs/nextjs">Next.js integration</Link></td>
          </tr>
          <tr>
            <td><code>components/inbox.tsx</code></td>
            <td>Style the bell, add filtering, customize layout</td>
            <td><Link href="/docs/react">React hooks</Link></td>
          </tr>
          <tr>
            <td><code>lib/auth.ts</code></td>
            <td>Replace the stub with your session library</td>
            <td><Link href="/docs/security">Security model</Link></td>
          </tr>
        </tbody>
      </table>
      <div className="callout callout-tip">
        <strong>Start in <code>lib/notifykit.ts</code>.</strong> It&apos;s a
        single file with your notification definitions, database adapter, and
        provider. Every change you make to notifications starts there — the
        scaffold imports it everywhere else.
      </div>

      <h2>Send your first notification</h2>
      <p>
        From a server action, API route, or anywhere on the server:
      </p>
      <Code
        code={`import { notify } from "@/lib/notifykit"

await notify.upsertRecipient({
  id: user.id,
  email: user.email,
  name: user.name,
})

const result = await notify.send({
  recipientId: user.id,
  notificationId: "welcome",
  payload: { name: user.name },
})

console.log(result.inboxItems) // inbox row created
console.log(result.deliveries) // email delivery record`}
      />

      <h3>What just happened</h3>
      <p>
        That single <code>send()</code> triggered the full pipeline. Here&apos;s
        the path your notification took through the engine:
      </p>

      <div className="overview-flow">
        <div className="overview-flow-step">
          <span className="overview-flow-number">1</span>
          <div>
            <strong>Validate payload</strong>
            <p><code>{`{ name: user.name }`}</code> checked against the notification schema. Passes.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">2</span>
          <div>
            <strong>Resolve preferences</strong>
            <p>No opt-outs configured — inbox and email both allowed.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">3</span>
          <div>
            <strong>Render templates</strong>
            <p>Channel templates interpolate the payload into a title, body, and email HTML.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">4</span>
          <div>
            <strong>Deliver</strong>
            <p>Inbox row written to the database. Email handed to the provider (fake in dev).</p>
          </div>
        </div>
      </div>

      <div className="callout callout-tip">
        <strong>Stages that didn&apos;t fire:</strong> dedup, rate limit, digest, and quiet hours
        are all off by default. They activate when you configure them on the notification definition.
        See the <Link href="/docs">full pipeline overview</Link> for all 10 stages.
      </div>

      <p>And here&apos;s what the result object tells you:</p>
      <table>
        <thead>
          <tr><th>Field</th><th>You&apos;ll see</th><th>It means</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><code>result.notification</code></td>
            <td>A <code>NotificationRecord</code> with an ID</td>
            <td>The send was recorded — you can look it up later via timeline</td>
          </tr>
          <tr>
            <td><code>result.inboxItems[0]</code></td>
            <td>An <code>InboxItem</code> with title, body, timestamps</td>
            <td>The inbox channel wrote a row — the React hooks will pick it up</td>
          </tr>
          <tr>
            <td><code>result.deliveries[0]</code></td>
            <td>A <code>DeliveryRecord</code> with <code>status: &quot;sent&quot;</code></td>
            <td>Email was queued and the (fake) provider confirmed delivery</td>
          </tr>
          <tr>
            <td><code>result.skipped</code></td>
            <td>Empty array <code>[]</code></td>
            <td>No channels were blocked — preferences allow everything by default</td>
          </tr>
        </tbody>
      </table>
      <div className="callout callout-tip">
        <strong>Try disabling email.</strong> Open <code>/settings/notifications</code>{" "}
        in the scaffold, uncheck email for the &quot;welcome&quot; notification,
        then send again. You&apos;ll see <code>result.skipped</code> include
        email with reason <code>&quot;preferences_disabled&quot;</code> — the
        pipeline is working.
      </div>

      <h2>See it in your inbox</h2>
      <p>
        You sent a notification server-side — now display it in the UI. The
        scaffold already has this wired up, but here&apos;s what the code looks
        like so you can add it anywhere in your app:
      </p>
      <Code
        code={`"use client"
import { useInbox, useUnreadCount } from "@notifykitjs/react"

function NotificationBell() {
  const { unreadCount } = useUnreadCount()
  const { items, markAsRead, archive } = useInbox()

  return (
    <div>
      <button>
        🔔 {unreadCount > 0 && <span>{unreadCount}</span>}
      </button>

      <ul>
        {items.map((item) => (
          <li key={item.id} style={{ opacity: item.readAt ? 0.6 : 1 }}>
            <strong>{item.title}</strong>
            <p>{item.body}</p>
            {!item.readAt && (
              <button onClick={() => markAsRead(item.id)}>Mark read</button>
            )}
            <button onClick={() => archive(item.id)}>Archive</button>
          </li>
        ))}
      </ul>
    </div>
  )
}`}
      />
      <table>
        <thead>
          <tr><th>Hook</th><th>Returns</th><th>Updates when</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><code>useUnreadCount()</code></td>
            <td>Live count of unread items</td>
            <td>New notification arrives, item marked read, mark-all-read</td>
          </tr>
          <tr>
            <td><code>useInbox()</code></td>
            <td>Items array + mutation methods (<code>markAsRead</code>, <code>archive</code>, <code>delete</code>)</td>
            <td>SSE event arrives — no polling, no manual refresh</td>
          </tr>
        </tbody>
      </table>
      <div className="callout callout-tip">
        <strong>Both hooks update in real time.</strong> When{" "}
        <code>send()</code> fires on the server, the inbox component updates
        instantly via SSE — no page reload needed. Mutations are optimistic:
        the UI updates immediately, then syncs with the server. See{" "}
        <Link href="/docs/react">React hooks</Link> for the full API.
      </div>

      <h2>Add your own notification</h2>
      <p>
        The scaffold includes a demo notification. Here&apos;s how to add a real
        one that matches your app — the single edit you&apos;ll make in your first
        session:
      </p>

      <div className="overview-flow">
        <div className="overview-flow-step">
          <span className="overview-flow-number">1</span>
          <div>
            <strong>Define</strong>
            <p>Add a notification to <code>lib/notifykit.ts</code> with your payload fields and channel templates.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">2</span>
          <div>
            <strong>Register</strong>
            <p>Add it to the <code>notifications</code> array so the engine knows about it.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">3</span>
          <div>
            <strong>Send</strong>
            <p>Call <code>send()</code> from your server code. TypeScript enforces the correct payload shape.</p>
          </div>
        </div>
      </div>

      <Code
        code={`// lib/notifykit.ts — add below existing definitions:
export const taskAssigned = notification({
  id: "task_assigned",
  payload: {
    assignerName: "string",
    taskTitle: "string",
    taskUrl: "string",
  },
  channels: [
    inbox({
      title: "{{assignerName}} assigned you a task",
      body: "{{taskTitle}}",
      actionUrl: "{{taskUrl}}",
    }),
    email({
      subject: "New task: {{taskTitle}}",
      body: "{{assignerName}} assigned you '{{taskTitle}}'.\\n\\nOpen it: {{taskUrl}}\\n\\nUnsubscribe: {{_unsubscribeUrl}}",
    }),
  ],
})

// Register it:
export const notify = createNotifyKit({
  notifications: [commentMentioned, taskAssigned] as const,
  //                                 ^^^^^^^^^^^ add here
  ...
})`}
      />
      <Code
        code={`// Anywhere on the server — send it:
import { notify } from "@/lib/notifykit"

await notify.send({
  recipientId: assignee.id,
  notificationId: "task_assigned",
  //              ^^^^^^^^^^^^^^^ autocomplete shows your registered IDs
  payload: {
    assignerName: currentUser.name,
    taskTitle: "Fix auth bug",
    taskUrl: "/tasks/42",
  },
})
// TypeScript error if you misspell a field or miss one`}
      />
      <table>
        <thead>
          <tr><th>What to decide</th><th>Your options</th><th>Start with</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Which channels?</strong></td>
            <td>Inbox, email, SMS, webhook — in any combination</td>
            <td>Inbox + email covers most use cases</td>
          </tr>
          <tr>
            <td><strong>What payload fields?</strong></td>
            <td>Any strings/numbers your templates reference</td>
            <td>Actor name + action URL is the minimum useful set</td>
          </tr>
          <tr>
            <td><strong>Can users opt out?</strong></td>
            <td><code>required: false</code> (default) or <code>required: true</code></td>
            <td>Leave as default — only force security/transactional notifications</td>
          </tr>
        </tbody>
      </table>
      <div className="callout callout-tip">
        <strong>Type safety catches mistakes instantly.</strong> If you add a{" "}
        <code>{`{{dueDate}}`}</code> to your template but forget to add{" "}
        <code>dueDate</code> to the payload schema, TypeScript errors at{" "}
        <code>send()</code> time — not at runtime when a user gets a blank
        notification. See <Link href="/docs/defining">Defining notifications</Link>{" "}
        for advanced patterns like categories, conditional rendering, and i18n.
      </div>

      <h2>Go to production</h2>
      <p>
        When you&apos;re ready to ship, swap three things:
      </p>
      <div className="overview-flow">
        <div className="overview-flow-step">
          <span className="overview-flow-number">1</span>
          <div>
            <strong>Database</strong>
            <p>Replace <code>memoryAdapter()</code> with <Link href="/docs/database">Drizzle SQLite or Postgres</Link>.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">2</span>
          <div>
            <strong>Email provider</strong>
            <p>Replace <code>fakeEmailProvider()</code> with <Link href="/docs/providers">Resend, Postmark, or your own</Link>.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">3</span>
          <div>
            <strong>Auth</strong>
            <p>Wire your real session into <code>identify()</code> in the <Link href="/docs/nextjs">route handler</Link>.</p>
          </div>
        </div>
      </div>

      <p>
        Here&apos;s the concrete diff in <code>lib/notifykit.ts</code>:
      </p>
      <Code
        code={`// BEFORE (dev — in-memory, fake email):
import {
  createNotifyKit, memoryAdapter, fakeEmailProvider, channel, notification,
} from "@notifykitjs/core"

export const notify = createNotifyKit({
  notifications: [commentMentioned] as const,
  database: memoryAdapter(),
  providers: { email: fakeEmailProvider() },
  unsubscribe: { secret: process.env.NOTIFYKIT_SECRET!, baseUrl: "http://localhost:3000/api/notifykit" },
})

// AFTER (production — Drizzle + Resend):
import { createNotifyKit, channel, notification } from "@notifykitjs/core"
import { drizzlePostgresAdapter } from "@notifykitjs/drizzle"
import { resendProvider } from "@notifykitjs/resend"
import { db } from "@/lib/db"

export const notify = createNotifyKit({
  notifications: [commentMentioned] as const,
  database: drizzlePostgresAdapter(db),
  providers: { email: resendProvider({ apiKey: process.env.RESEND_API_KEY!, from: "notifications@yourapp.com" }) },
  unsubscribe: { secret: process.env.NOTIFYKIT_SECRET!, baseUrl: "https://yourapp.com/api/notifykit" },
})`}
      />
      <table>
        <thead>
          <tr><th>What changed</th><th>Dev value</th><th>Production value</th><th>New package</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><code>database</code></td>
            <td><code>memoryAdapter()</code></td>
            <td><code>drizzlePostgresAdapter(db)</code></td>
            <td><code>@notifykitjs/drizzle</code></td>
          </tr>
          <tr>
            <td><code>providers.email</code></td>
            <td><code>fakeEmailProvider()</code></td>
            <td><code>resendProvider({`{...}`})</code></td>
            <td><code>@notifykitjs/resend</code></td>
          </tr>
          <tr>
            <td><code>unsubscribe.baseUrl</code></td>
            <td><code>http://localhost:3000/...</code></td>
            <td><code>https://yourapp.com/...</code></td>
            <td>—</td>
          </tr>
          <tr>
            <td><code>identify()</code></td>
            <td>Demo user / hardcoded</td>
            <td>Your real auth session</td>
            <td>—</td>
          </tr>
        </tbody>
      </table>
      <div className="callout callout-tip">
        <strong>That&apos;s it.</strong> No migration scripts, no config files,
        no environment matrix. The same code that worked locally works in prod
        with real providers. Notification definitions, channel templates, and
        all pipeline behavior stay identical.
      </div>

      <h2>Remove the scaffold demo</h2>
      <p>
        Once you&apos;ve added your own notifications, remove the scaffold&apos;s
        demo code. Here&apos;s what to delete and what&apos;s safe to leave:
      </p>
      <table>
        <thead>
          <tr><th>File / code</th><th>Action</th><th>Why</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><code>app/page.tsx</code> (demo page with &quot;Send test&quot; button)</td>
            <td>Delete or replace with your own homepage</td>
            <td>It&apos;s just a demo UI — no other code depends on it</td>
          </tr>
          <tr>
            <td>The demo notification definition (e.g. <code>welcome</code>)</td>
            <td>Remove from <code>notifications</code> array</td>
            <td>Once removed, it stops appearing in preferences UI and can&apos;t be sent</td>
          </tr>
          <tr>
            <td><code>fakeEmailProvider()</code> import</td>
            <td>Remove after swapping to a real provider</td>
            <td>Dead code — won&apos;t cause errors but clutters the file</td>
          </tr>
          <tr>
            <td>Existing demo inbox items in the database</td>
            <td>Leave them (harmless) or clear with a script</td>
            <td>Old items stay visible in the inbox until archived or deleted. They don&apos;t affect new notifications.</td>
          </tr>
          <tr>
            <td>Preference rows for the removed notification</td>
            <td>Leave them (ignored automatically)</td>
            <td>Preferences for unknown notification IDs are silently skipped — no cleanup needed</td>
          </tr>
        </tbody>
      </table>
      <div className="callout callout-tip">
        <strong>Removing a notification is safe.</strong> Delete it from the
        array and remove all <code>send()</code> calls that reference it.
        Existing inbox items from that notification remain visible (they&apos;re
        just data), and orphaned preferences are harmlessly ignored. No
        migration script needed. See{" "}
        <Link href="/docs/defining">Defining notifications</Link> for the full
        change-safety matrix.
      </div>

      <h2>Common first-run issues</h2>
      <p>
        Most quickstart problems fall into one of these categories. Check the
        table before searching — the fix is usually one line:
      </p>
      <table>
        <thead>
          <tr><th>Symptom</th><th>Cause</th><th>Fix</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><code>NOTIFYKIT_SECRET is required</code> on startup</td>
            <td>Missing or empty <code>.env.local</code></td>
            <td>Run the <code>node -e &quot;...&quot;</code> command above and paste the output as <code>NOTIFYKIT_SECRET</code></td>
          </tr>
          <tr>
            <td>Inbox shows no items after clicking &quot;Send test&quot;</td>
            <td>Browser is on a different port than the API</td>
            <td>Ensure you&apos;re on <code>localhost:3000</code> (not 3001). The provider points at port 3000 by default.</td>
          </tr>
          <tr>
            <td><code>NotifyKitNotFoundError: Recipient not found</code></td>
            <td><code>upsertRecipient()</code> wasn&apos;t called before <code>send()</code></td>
            <td>Always create the recipient first — see the &quot;Send your first notification&quot; example above</td>
          </tr>
          <tr>
            <td>TypeScript error on <code>notificationId</code></td>
            <td>The ID doesn&apos;t match any registered definition</td>
            <td>Check the exact <code>id</code> string in your notification definitions — it&apos;s case-sensitive</td>
          </tr>
          <tr>
            <td><code>Module not found: @notifykitjs/core</code></td>
            <td><code>npm install</code> didn&apos;t complete or ran in wrong directory</td>
            <td>Run <code>npm install</code> again from the project root (where <code>package.json</code> is)</td>
          </tr>
          <tr>
            <td>Email &quot;sent&quot; but nothing in your inbox</td>
            <td>The scaffold uses <code>fakeEmailProvider()</code> — it logs, not sends</td>
            <td>Expected! Check terminal output for the logged email. Swap to a real provider for actual delivery.</td>
          </tr>
          <tr>
            <td>Preferences page shows empty list</td>
            <td>No notifications registered or provider not wrapping the app</td>
            <td>Verify <code>&lt;NotifyKitProvider&gt;</code> wraps your layout and <code>notifications</code> array isn&apos;t empty</td>
          </tr>
        </tbody>
      </table>
      <div className="callout callout-tip">
        <strong>Still stuck?</strong> Run{" "}
        <code>await notify.explain({`{...your send input}`})</code> from a
        server file. It shows the full pipeline resolution — preferences,
        quiet hours, channels — without writing any records. See{" "}
        <Link href="/docs/explain">Explain &amp; dry run</Link>.
      </div>

      <h3>Verifying each layer works</h3>
      <p>
        If you&apos;re unsure where the problem is, test each layer in
        isolation. This eliminates guesswork:
      </p>
      <div className="overview-flow">
        <div className="overview-flow-step">
          <span className="overview-flow-number">1</span>
          <div>
            <strong>Can you import <code>notify</code>?</strong>
            <p>Add <code>console.log(notify.notifications.length)</code> to a server file. If it prints a number, the instance is configured correctly.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">2</span>
          <div>
            <strong>Does the API route respond?</strong>
            <p>Visit <code>/api/notifykit/notifications</code> in your browser. You should see a JSON array of notification metadata.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">3</span>
          <div>
            <strong>Does the provider wrap the page?</strong>
            <p>Open React DevTools → search for <code>NotifyKitProvider</code>. If it&apos;s not in the tree, hooks will return empty state.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">4</span>
          <div>
            <strong>Does send() return a result?</strong>
            <p>Log the full <code>result</code> object. Check <code>result.inboxItems</code> (should have items) and <code>result.skipped</code> (should explain any missing channels).</p>
          </div>
        </div>
      </div>

      <h2>What to try next</h2>
      <div className="button-row">
        <Link href="/docs/defining" className="primary">Define a notification</Link>
        <Link href="/docs/react">Add inbox UI</Link>
        <Link href="/docs/preferences">User preferences</Link>
      </div>
      <table>
        <thead>
          <tr><th>Goal</th><th>Page</th><th>What you&apos;ll learn</th></tr>
        </thead>
        <tbody>
          <tr><td>Add a second notification type</td><td><Link href="/docs/defining">Defining</Link></td><td>Payload schemas, categories, optional fields</td></tr>
          <tr><td>Let users opt out of email</td><td><Link href="/docs/preferences">Preferences</Link></td><td>Per-channel toggles, unsubscribe links</td></tr>
          <tr><td>Batch noisy events</td><td><Link href="/docs/digests">Digests</Link></td><td>Window-based coalescing with <code>render()</code></td></tr>
          <tr><td>Show a live notification bell</td><td><Link href="/docs/react">React hooks</Link></td><td><code>useInbox()</code>, realtime updates</td></tr>
          <tr><td>Understand why something was skipped</td><td><Link href="/docs/explain">Explain</Link></td><td>Dry-run a send and inspect the resolution trail</td></tr>
        </tbody>
      </table>

      <div className="page-nav">
        <Link href="/docs/installation">
          <span className="page-nav-label">Previous</span>
          <span className="page-nav-title">Installation</span>
        </Link>
        <Link href="/docs/defining">
          <span className="page-nav-label">Next</span>
          <span className="page-nav-title">Defining notifications</span>
        </Link>
      </div>
    </article>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { Code } from "../../_components/code";

export const metadata: Metadata = { title: "Next.js" };

export default function NextjsPage() {
  return (
    <article>
      <h1>Next.js integration</h1>
      <p>
        The <code>@notifykitjs/next</code> package provides a route handler,
        server actions, and optional middleware for CORS. It works with
        Next.js 14+ App Router.
      </p>

      <div className="overview-flow">
        <div className="overview-flow-step">
          <span className="overview-flow-number">1</span>
          <div>
            <strong>Route handler</strong>
            <p>Required. Exposes the REST API that the React SDK calls.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">2</span>
          <div>
            <strong>Provider</strong>
            <p>Required. Wraps your app so hooks know where the API lives.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">3</span>
          <div>
            <strong>Server actions</strong>
            <p>Optional. Skip REST and call NotifyKit directly from server components.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">4</span>
          <div>
            <strong>Middleware</strong>
            <p>Optional. Only needed for cross-origin clients (mobile webviews, separate frontends).</p>
          </div>
        </div>
      </div>

      <h2>Install</h2>
      <Code
        lang="bash"
        code={`npm install @notifykitjs/core @notifykitjs/next @notifykitjs/react`}
      />

      <h2>Route handler</h2>
      <p>
        Create a catch-all route that exposes the NotifyKit REST API for the
        React client:
      </p>
      <Code
        filename="app/api/notifykit/[...route]/route.ts"
        code={`import { createRouteHandler } from "@notifykitjs/next"
import { notify } from "@/lib/notifykit"
import { auth } from "@/lib/auth"

export const { GET, POST, DELETE, OPTIONS, dynamic } = createRouteHandler({
  notifykit: notify,
  identify: async (request) => {
    const session = await auth(request)
    if (!session) return null // → 401

    return {
      recipientId: session.user.id,
      tenantId: session.organizationId,     // optional
      workspaceId: session.workspaceId,     // optional
    }
  },
  unsubscribeSecret: process.env.NOTIFYKIT_SECRET,
})`}
      />
      <p>
        The <code>identify</code> function resolves the current user from the
        request. Return <code>null</code> to reject unauthenticated requests
        with a 401.
      </p>

      <h3>What identify() should return</h3>
      <table>
        <thead>
          <tr><th>App shape</th><th>Return value</th><th>What it unlocks</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>Single-user app</td>
            <td><code>{`{ recipientId: userId }`}</code></td>
            <td>Inbox + preferences scoped to the user</td>
          </tr>
          <tr>
            <td>Multi-tenant SaaS</td>
            <td><code>{`{ recipientId, tenantId }`}</code></td>
            <td>+ tenant isolation — users can&apos;t cross orgs</td>
          </tr>
          <tr>
            <td>Workspace-per-project</td>
            <td><code>{`{ recipientId, tenantId, workspaceId }`}</code></td>
            <td>+ workspace-level preference overrides</td>
          </tr>
          <tr>
            <td>Unauthenticated</td>
            <td><code>null</code></td>
            <td>Request rejected with 401 — no data exposed</td>
          </tr>
        </tbody>
      </table>
      <div className="callout">
        <strong>Only <code>recipientId</code> is required.</strong> Add{" "}
        <code>tenantId</code> or <code>workspaceId</code> when you need scoping.
        Extra fields you return are available in hooks and <code>authorize()</code>{" "}
        but don&apos;t affect routing.
      </div>

      <h2>Server actions</h2>
      <div className="callout callout-tip">
        <strong>Route handler vs server actions?</strong> Use the route handler
        when your UI uses React hooks (<code>useInbox</code>,{" "}
        <code>usePreferences</code>). Use server actions when you want to
        read/write from server components or form actions without a client SDK.
        Both use the same <code>identify()</code> pattern.
      </div>
      <p>
        For tighter integration without REST calls, use server actions directly:
      </p>
      <Code
        filename="lib/notifykit-actions.ts"
        code={`import { createServerActions } from "@notifykitjs/next"
import { notify } from "@/lib/notifykit"
import { getSessionUserId } from "@/lib/session"

export const notifyActions = createServerActions({
  notifykit: notify,
  identify: () => getSessionUserId(),
})`}
      />
      <Code
        filename="app/settings/notifications/page.tsx"
        code={`import { notifyActions } from "@/lib/notifykit-actions"

export default async function NotificationSettings() {
  const preferences = await notifyActions.getPreferences()

  async function toggleEmail(formData: FormData) {
    "use server"
    await notifyActions.updatePreference({
      notificationId: formData.get("notificationId") as string,
      channels: { email: formData.get("enabled") === "true" },
    })
  }

  return (
    <form action={toggleEmail}>
      {/* render preferences with form inputs */}
    </form>
  )
}`}
      />

      <h2>Middleware (CORS)</h2>
      <p>
        When your client is on a different origin (e.g. a mobile web view
        hitting your API):
      </p>
      <Code
        filename="middleware.ts"
        code={`import { createNotifyKitMiddleware } from "@notifykitjs/next/middleware"
import type { NextRequest } from "next/server"

const withNotifyKit = createNotifyKitMiddleware({
  cors: { origin: "https://app.example.com" },
})

export function middleware(request: NextRequest) {
  return withNotifyKit(request)
}

export const config = { matcher: "/api/notifykit/:path*" }`}
      />

      <h2>Provider pattern</h2>
      <p>
        Wrap your app in <code>NotifyKitProvider</code> to make hooks work.
        Point it at the route handler:
      </p>
      <Code
        filename="app/layout.tsx"
        code={`import { NotifyKitProvider } from "@notifykitjs/react"

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>
        <NotifyKitProvider options={{ baseUrl: "/api/notifykit" }}>
          {children}
        </NotifyKitProvider>
      </body>
    </html>
  )
}`}
      />

      <h2>Full file tree</h2>
      <table>
        <thead>
          <tr><th>File</th><th>Required</th><th>What it does</th></tr>
        </thead>
        <tbody>
          <tr><td><code>lib/notifykit.ts</code></td><td>Yes</td><td>Creates the NotifyKit instance + notification definitions</td></tr>
          <tr><td><code>app/api/notifykit/[...route]/route.ts</code></td><td>Yes</td><td>REST handler — inbox, preferences, unsubscribe, realtime</td></tr>
          <tr><td><code>app/layout.tsx</code></td><td>Yes</td><td>Wraps app in <code>&lt;NotifyKitProvider&gt;</code> so hooks work</td></tr>
          <tr><td><code>lib/session.ts</code></td><td>Yes</td><td>Your auth helper — returns the current user ID</td></tr>
          <tr><td><code>lib/notifykit-actions.ts</code></td><td>No</td><td>Server actions for reading/writing without REST</td></tr>
          <tr><td><code>middleware.ts</code></td><td>No</td><td>CORS support for cross-origin clients</td></tr>
        </tbody>
      </table>
      <div className="callout callout-tip">
        <strong>Minimum viable setup = 3 files.</strong> The NotifyKit instance,
        the route handler, and the provider in layout. Server actions and
        middleware are optional add-ons for specific use cases.
      </div>

      <h2>Route reference</h2>
      <p>
        The handler exposes these REST endpoints. The React SDK calls them
        automatically — this reference is for custom clients, mobile apps, or
        debugging with <code>curl</code>.
      </p>
      <table>
        <thead>
          <tr><th>Method</th><th>Path</th><th>Auth</th><th>Purpose</th></tr>
        </thead>
        <tbody>
          <tr><td><code>GET</code></td><td><code>/inbox</code></td><td>Required</td><td>List inbox items for the authenticated user</td></tr>
          <tr><td><code>POST</code></td><td><code>/inbox/:id/read</code></td><td>Required</td><td>Mark a single item as read</td></tr>
          <tr><td><code>POST</code></td><td><code>/inbox/read-all</code></td><td>Required</td><td>Mark all items as read</td></tr>
          <tr><td><code>POST</code></td><td><code>/inbox/:id/archive</code></td><td>Required</td><td>Archive an item</td></tr>
          <tr><td><code>POST</code></td><td><code>/inbox/:id/unarchive</code></td><td>Required</td><td>Unarchive an item</td></tr>
          <tr><td><code>DELETE</code></td><td><code>/inbox/:id</code></td><td>Required</td><td>Permanently delete an item</td></tr>
          <tr><td><code>GET</code></td><td><code>/inbox/unread-count</code></td><td>Required</td><td>Get unread count (for badges)</td></tr>
          <tr><td><code>GET</code></td><td><code>/preferences</code></td><td>Required</td><td>List all preferences for the user</td></tr>
          <tr><td><code>POST</code></td><td><code>/preferences</code></td><td>Required</td><td>Update channel preference for a notification</td></tr>
          <tr><td><code>GET</code></td><td><code>/notifications</code></td><td>Optional</td><td>List registered notification metadata (for building UIs)</td></tr>
          <tr><td><code>GET</code></td><td><code>/events</code></td><td>Required</td><td>SSE stream — realtime inbox events</td></tr>
          <tr><td><code>GET</code></td><td><code>/unsubscribe</code></td><td>Token</td><td>One-click email unsubscribe (HMAC-verified)</td></tr>
        </tbody>
      </table>

      <h3>Query parameters</h3>
      <table>
        <thead>
          <tr><th>Route</th><th>Parameter</th><th>Default</th><th>Example</th></tr>
        </thead>
        <tbody>
          <tr><td><code>GET /inbox</code></td><td><code>archived</code></td><td><code>false</code></td><td><code>/inbox?archived=true</code> — list archived items</td></tr>
          <tr><td><code>GET /inbox</code></td><td><code>limit</code></td><td><code>50</code></td><td><code>/inbox?limit=20</code> — cap returned items</td></tr>
          <tr><td><code>POST /preferences</code></td><td>Body: <code>notificationId</code>, <code>channels</code></td><td>—</td><td><code>{`{"notificationId":"x","channels":{"email":false}}`}</code></td></tr>
        </tbody>
      </table>

      <div className="callout callout-tip">
        <strong>Debug with curl.</strong> All routes use cookie-based auth (same as
        your app). To test from a terminal, grab a session cookie from your browser
        and pass it: <code>curl -b &quot;session=...&quot; http://localhost:3000/api/notifykit/inbox</code>
      </div>

      <h2>Integration testing</h2>
      <p>
        Test the full stack — handler, identify, hooks — without deploying.
        Create a test NotifyKit instance with memory adapter and hit the
        routes directly:
      </p>
      <Code
        code={`import { describe, it, expect, beforeAll } from "vitest"
import { createNotifyKit, memoryAdapter, fakeEmailProvider } from "@notifykitjs/core"
import { createHandler } from "@notifykitjs/core"
import { commentMentioned } from "@/lib/notifications/comment-mentioned"

const testNotify = createNotifyKit({
  notifications: [commentMentioned] as const,
  database: memoryAdapter(),
  providers: { email: fakeEmailProvider() },
})

const handler = createHandler(testNotify, {
  identify: async () => ({ recipientId: "test_user" }),
})

describe("NotifyKit handler", () => {
  beforeAll(async () => {
    await testNotify.upsertRecipient({ id: "test_user", email: "test@example.com" })
    await testNotify.send({
      recipientId: "test_user",
      notificationId: "comment_mentioned",
      payload: { actorName: "Rey", postTitle: "Test", postUrl: "/posts/1" },
    })
  })

  it("GET /inbox returns items", async () => {
    const req = new Request("http://localhost/inbox")
    const res = await handler(req)
    expect(res.status).toBe(200)
    const items = await res.json()
    expect(items.length).toBeGreaterThan(0)
    expect(items[0].title).toContain("Rey")
  })

  it("POST /inbox/:id/read marks as read", async () => {
    const listRes = await handler(new Request("http://localhost/inbox"))
    const [item] = await listRes.json()

    const req = new Request(\`http://localhost/inbox/\${item.id}/read\`, { method: "POST" })
    const res = await handler(req)
    expect(res.status).toBe(200)
    const updated = await res.json()
    expect(updated.readAt).not.toBeNull()
  })

  it("POST /preferences updates channel opt-out", async () => {
    const req = new Request("http://localhost/preferences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notificationId: "comment_mentioned", channels: { email: false } }),
    })
    const res = await handler(req)
    expect(res.status).toBe(200)
    const pref = await res.json()
    expect(pref.channels.email).toBe(false)
  })

  it("returns 401 when identify returns null", async () => {
    const noAuthHandler = createHandler(testNotify, { identify: async () => null })
    const req = new Request("http://localhost/inbox")
    const res = await noAuthHandler(req)
    expect(res.status).toBe(401)
  })
})`}
      />
      <table>
        <thead>
          <tr><th>What to test</th><th>Assert</th><th>Catches</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>Inbox read/write</td>
            <td>Items return after send, markRead sets <code>readAt</code></td>
            <td>Broken handler wiring, schema mismatches</td>
          </tr>
          <tr>
            <td>Preferences round-trip</td>
            <td>Update persists and affects next send</td>
            <td>Scope leaks, tenant isolation bugs</td>
          </tr>
          <tr>
            <td>Auth rejection</td>
            <td><code>identify() → null</code> returns 401</td>
            <td>Auth bypass, missing null check</td>
          </tr>
          <tr>
            <td>Multi-tenant isolation</td>
            <td>Org A handler can&apos;t see Org B items</td>
            <td>Cross-tenant data leaks</td>
          </tr>
        </tbody>
      </table>
      <div className="callout callout-tip">
        <strong>No HTTP server needed.</strong> The handler is a standard{" "}
        <code>(Request) → Response</code> function. Call it directly in tests
        with <code>new Request()</code> — no <code>supertest</code>, no
        server boot, sub-millisecond execution.
      </div>

      <h2>Troubleshooting</h2>
      <table>
        <thead>
          <tr><th>Symptom</th><th>Cause</th><th>Fix</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>401 on every client request</td>
            <td><code>identify()</code> returns <code>undefined</code> instead of <code>null</code></td>
            <td>Return <code>null</code> explicitly when no session. <code>undefined</code> is treated as a broken handler, not &quot;unauthenticated.&quot;</td>
          </tr>
          <tr>
            <td>Hooks return empty data</td>
            <td>Missing <code>&lt;NotifyKitProvider&gt;</code> or wrong <code>baseUrl</code></td>
            <td>Verify the provider wraps your component tree and <code>baseUrl</code> matches the route (e.g. <code>/api/notifykit</code>).</td>
          </tr>
          <tr>
            <td>SSE stream disconnects immediately</td>
            <td>Route cached by Next.js static optimization</td>
            <td>The <code>dynamic</code> export from <code>createRouteHandler()</code> handles this — make sure you export it.</td>
          </tr>
          <tr>
            <td>CORS errors from a separate frontend</td>
            <td>No CORS headers on the NotifyKit routes</td>
            <td>Add <code>cors</code> option to the handler or use the middleware helper. <code>OPTIONS</code> must also be exported.</td>
          </tr>
          <tr>
            <td>Preferences update but revert on refresh</td>
            <td>Tenant/workspace mismatch between reads and writes</td>
            <td>Ensure <code>identify()</code> returns the same scope for all requests from the same session.</td>
          </tr>
        </tbody>
      </table>

      <div className="page-nav">
        <Link href="/docs/fallbacks">
          <span className="page-nav-label">Previous</span>
          <span className="page-nav-title">Fallback channels</span>
        </Link>
        <Link href="/docs/react">
          <span className="page-nav-label">Next</span>
          <span className="page-nav-title">React hooks & components</span>
        </Link>
      </div>
    </article>
  );
}

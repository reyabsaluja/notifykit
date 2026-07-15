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

      <div className="features">
        <div className="feature-card">
          <h3>Zero-config route handler</h3>
          <p>One catch-all route exposes inbox, preferences, unsubscribe, and SSE. No manual endpoint wiring.</p>
        </div>
        <div className="feature-card">
          <h3>Any auth library</h3>
          <p>Works with NextAuth, Clerk, Supabase, Lucia — just return the user ID from your session helper.</p>
        </div>
        <div className="feature-card">
          <h3>Server actions support</h3>
          <p>Read and write notifications from server components and form actions without a client-side SDK.</p>
        </div>
        <div className="feature-card">
          <h3>App Router native</h3>
          <p>Built for Next.js 14+ App Router. Route groups, layouts, and streaming all work out of the box.</p>
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
      <div className="callout callout-tip">
        <strong>Only <code>recipientId</code> is required.</strong> Add{" "}
        <code>tenantId</code> or <code>workspaceId</code> when you need scoping.
        Extra fields you return are available in hooks and <code>authorize()</code>{" "}
        but don&apos;t affect routing.
      </div>

      <h2>Auth library examples</h2>
      <p>
        The <code>identify()</code> function is where your auth library meets
        NotifyKit. Here&apos;s the exact wiring for the most common Next.js
        auth solutions:
      </p>
      <table>
        <thead>
          <tr><th>Library</th><th>Session source</th><th>User ID field</th></tr>
        </thead>
        <tbody>
          <tr><td><strong>NextAuth / Auth.js</strong></td><td><code>auth()</code> or <code>getServerSession()</code></td><td><code>session.user.id</code></td></tr>
          <tr><td><strong>Clerk</strong></td><td><code>auth()</code> from <code>@clerk/nextjs/server</code></td><td><code>userId</code> (direct)</td></tr>
          <tr><td><strong>Supabase Auth</strong></td><td><code>createRouteHandlerClient</code></td><td><code>user.id</code> from <code>getUser()</code></td></tr>
          <tr><td><strong>Lucia</strong></td><td><code>lucia.readSessionCookie</code> + <code>validateSession</code></td><td><code>session.userId</code></td></tr>
        </tbody>
      </table>

      <h3>NextAuth / Auth.js</h3>
      <Code
        code={`import { auth } from "@/auth"

export const { GET, POST, DELETE, OPTIONS, dynamic } = createRouteHandler({
  notifykit: notify,
  identify: async () => {
    const session = await auth()
    if (!session?.user?.id) return null
    return { recipientId: session.user.id }
  },
})`}
      />

      <h3>Clerk</h3>
      <p>
        Clerk exposes <code>orgId</code> directly — pass it as{" "}
        <code>tenantId</code> to get multi-tenant isolation for free.
      </p>
      <Code
        code={`import { auth } from "@clerk/nextjs/server"

export const { GET, POST, DELETE, OPTIONS, dynamic } = createRouteHandler({
  notifykit: notify,
  identify: async () => {
    const { userId, orgId } = await auth()
    if (!userId) return null
    return { recipientId: userId, tenantId: orgId ?? undefined }
  },
})`}
      />

      <h3>Supabase Auth</h3>
      <Code
        code={`import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"

export const { GET, POST, DELETE, OPTIONS, dynamic } = createRouteHandler({
  notifykit: notify,
  identify: async () => {
    const supabase = createRouteHandlerClient({ cookies })
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null
    return { recipientId: user.id }
  },
})`}
      />

      <h3>Lucia</h3>
      <Code
        code={`import { lucia } from "@/lib/lucia"
import { cookies } from "next/headers"

export const { GET, POST, DELETE, OPTIONS, dynamic } = createRouteHandler({
  notifykit: notify,
  identify: async () => {
    const cookieStore = await cookies()
    const sessionId = lucia.readSessionCookie(cookieStore.toString())
    if (!sessionId) return null
    const { session } = await lucia.validateSession(sessionId)
    if (!session) return null
    return { recipientId: session.userId }
  },
})`}
      />

      <div className="callout callout-tip">
        <strong>Match the ID you upsert recipients with.</strong> The value you
        return as <code>recipientId</code> in <code>identify()</code> must be
        the same string you pass to <code>upsertRecipient({`{ id }`})</code>
        when creating recipients. If your auth library uses <code>user_abc123</code>
        but you upsert with a database UUID, the inbox will be empty.
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
        Point it at the route handler. The provider must only render for
        authenticated users — it opens an SSE connection that requires a
        valid session.
      </p>

      <h3>Basic: single layout</h3>
      <p>
        For apps where every page requires auth, wrap at the root:
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

      <h3>Recommended: route groups</h3>
      <p>
        Most Next.js apps have public pages (landing, login, docs) that
        don&apos;t need notifications. Use route groups to scope the
        provider to authenticated routes only:
      </p>
      <Code
        code={`app/
├── (public)/              ← No provider, no SSE connection
│   ├── layout.tsx         ← Plain layout (no NotifyKitProvider)
│   ├── page.tsx           ← Landing page
│   └── login/page.tsx     ← Login page
├── (app)/                 ← Provider wraps this group
│   ├── layout.tsx         ← Has NotifyKitProvider
│   ├── dashboard/page.tsx
│   └── settings/page.tsx
└── api/
    └── notifykit/[...route]/route.ts`}
      />
      <Code
        filename="app/(app)/layout.tsx"
        code={`import { NotifyKitProvider } from "@notifykitjs/react"
import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session) redirect("/login")

  return (
    <NotifyKitProvider options={{ baseUrl: "/api/notifykit" }}>
      {children}
    </NotifyKitProvider>
  )
}`}
      />
      <table>
        <thead>
          <tr><th>Pattern</th><th>When to use</th><th>Trade-off</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Root layout</strong></td>
            <td>Every page requires auth (dashboards, internal tools)</td>
            <td>Simple, but unauthenticated pages trigger 401s from the SSE connection</td>
          </tr>
          <tr>
            <td><strong>Route groups</strong></td>
            <td>Mix of public and authenticated pages</td>
            <td>Slightly more files, but no wasted connections on public pages</td>
          </tr>
          <tr>
            <td><strong>Conditional render</strong></td>
            <td>Single layout, but some users are logged out</td>
            <td>Provider mounts/unmounts on auth state change — hooks reset on login</td>
          </tr>
        </tbody>
      </table>

      <h3>Conditional render (alternative)</h3>
      <p>
        If route groups don&apos;t fit your structure, conditionally render
        the provider based on session state:
      </p>
      <Code
        filename="app/layout.tsx"
        code={`import { NotifyKitProvider } from "@notifykitjs/react"
import { auth } from "@/lib/auth"

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()

  return (
    <html>
      <body>
        {session ? (
          <NotifyKitProvider options={{ baseUrl: "/api/notifykit" }}>
            {children}
          </NotifyKitProvider>
        ) : (
          children
        )}
      </body>
    </html>
  )
}`}
      />
      <div className="callout callout-warn">
        <strong>Don&apos;t render the provider without a session.</strong> The
        inbox hooks immediately load user data, and hooks connect to{" "}
        <code>/inbox/stream</code> when realtime is enabled. Without a valid
        session, those requests return 401 and add avoidable noise.
      </div>
      <div className="callout callout-tip">
        <strong>Route groups are the cleanest pattern.</strong> They avoid
        conditional logic in layouts, prevent SSE connections on public pages,
        and make the auth boundary explicit in your file tree. Start here unless
        you have a reason not to.
      </div>

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
          <tr><td><code>POST</code></td><td><code>/inbox/mark-all-read</code></td><td>Required</td><td>Mark all items as read</td></tr>
          <tr><td><code>POST</code></td><td><code>/inbox/:id/archive</code></td><td>Required</td><td>Archive an item</td></tr>
          <tr><td><code>POST</code></td><td><code>/inbox/:id/unarchive</code></td><td>Required</td><td>Unarchive an item</td></tr>
          <tr><td><code>DELETE</code></td><td><code>/inbox/:id</code></td><td>Required</td><td>Permanently delete an item</td></tr>
          <tr><td><code>GET</code></td><td><code>/inbox/unread-count</code></td><td>Required</td><td>Get unread count (for badges)</td></tr>
          <tr><td><code>GET</code></td><td><code>/preferences</code></td><td>Required</td><td>List all preferences for the user</td></tr>
          <tr><td><code>POST</code></td><td><code>/preferences</code></td><td>Required</td><td>Update channel preference for a notification</td></tr>
          <tr><td><code>GET</code></td><td><code>/notifications</code></td><td>Optional</td><td>List registered notification metadata (for building UIs)</td></tr>
          <tr><td><code>GET</code></td><td><code>/inbox/stream</code></td><td>Required</td><td>SSE stream — realtime inbox events</td></tr>
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
  basePath: "/",
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
    const { data: items } = await res.json()
    expect(items.length).toBeGreaterThan(0)
    expect(items[0].title).toContain("Rey")
  })

  it("POST /inbox/:id/read marks as read", async () => {
    const listRes = await handler(new Request("http://localhost/inbox"))
    const { data: items } = await listRes.json()
    const [item] = items

    const req = new Request(\`http://localhost/inbox/\${item.id}/read\`, { method: "POST" })
    const res = await handler(req)
    expect(res.status).toBe(200)
    const { data: updated } = await res.json()
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
    const { data: pref } = await res.json()
    expect(pref.channels.email).toBe(false)
  })

  it("returns 401 when identify returns null", async () => {
    const noAuthHandler = createHandler(testNotify, {
      identify: async () => null,
      basePath: "/",
    })
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

      <h2>Deploying</h2>
      <p>
        Your local setup uses memory adapters and fake providers. Production
        needs real credentials and platform-specific config. Here&apos;s what
        changes per hosting platform:
      </p>
      <table>
        <thead>
          <tr><th>Platform</th><th>SSE / realtime</th><th>Flush strategy</th><th>Key constraint</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Vercel Functions</strong></td>
            <td>Streaming works until the invocation&apos;s maximum duration</td>
            <td>External cron (Vercel Cron or upstream)</td>
            <td>Instances are ephemeral; use shared storage and expect client reconnects</td>
          </tr>
          <tr>
            <td><strong>Self-hosted (Node)</strong></td>
            <td>Full SSE with no timeout</td>
            <td><code>setInterval</code> in-process</td>
            <td>Manage your own process lifecycle, TLS termination, and scaling</td>
          </tr>
          <tr>
            <td><strong>Docker / Railway / Fly</strong></td>
            <td>Full SSE (long-lived containers)</td>
            <td><code>setInterval</code> or platform cron</td>
            <td>Set proxy idle timeouts above NotifyKit&apos;s 30-second SSE heartbeat</td>
          </tr>
          <tr>
            <td><strong>AWS Lambda (via SST/OpenNext)</strong></td>
            <td>Streaming lifetime is bounded by the function timeout</td>
            <td>EventBridge Scheduler or SQS</td>
            <td>Use polling or an external WebSocket service for realtime</td>
          </tr>
        </tbody>
      </table>

      <h3>Environment variables</h3>
      <p>
        Set these in your platform&apos;s environment configuration. All are
        required for a working production deploy:
      </p>
      <table>
        <thead>
          <tr><th>Variable</th><th>Purpose</th><th>Where to get it</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><code>NOTIFYKIT_SECRET</code></td>
            <td>Signs unsubscribe tokens (HMAC-SHA256)</td>
            <td>Generate: <code>openssl rand -hex 32</code></td>
          </tr>
          <tr>
            <td><code>DATABASE_URL</code></td>
            <td>Postgres connection string for the Drizzle adapter</td>
            <td>Your database provider (Neon, Supabase, RDS, etc.)</td>
          </tr>
          <tr>
            <td><code>RESEND_API_KEY</code></td>
            <td>Email delivery (or your provider&apos;s equivalent)</td>
            <td>Provider dashboard → API Keys</td>
          </tr>
          <tr>
            <td><code>RESEND_FROM</code></td>
            <td>Sender address: <code>App &lt;noreply@yourapp.com&gt;</code></td>
            <td>Must match a verified domain in your provider</td>
          </tr>
        </tbody>
      </table>
      <div className="callout callout-warn">
        <strong>NOTIFYKIT_SECRET must be stable.</strong> Rotating it invalidates
        all outstanding unsubscribe links in sent emails. If you must rotate,
        keep the old secret in a <code>NOTIFYKIT_SECRET_PREVIOUS</code> env var
        and configure both — the handler tries both when verifying tokens.
      </div>

      <h3>Pre-deploy checklist</h3>
      <div className="overview-flow">
        <div className="overview-flow-step">
          <span className="overview-flow-number">1</span>
          <div>
            <strong>Swap adapters</strong>
            <p><code>memoryAdapter()</code> → <code>drizzlePostgresAdapter(db)</code>. Run migrations.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">2</span>
          <div>
            <strong>Swap providers</strong>
            <p><code>fakeEmailProvider()</code> → <code>resendProvider()</code>. Test with <Link href="/docs/providers">the smoke test script</Link>.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">3</span>
          <div>
            <strong>Wire real auth</strong>
            <p>Replace any hardcoded <code>identify()</code> with your production session resolver.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">4</span>
          <div>
            <strong>Set baseUrl</strong>
            <p>Update <code>unsubscribe.baseUrl</code> to your production URL (e.g. <code>https://app.com/api/notifykit</code>).</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">5</span>
          <div>
            <strong>Verify end-to-end</strong>
            <p>Send a test notification to yourself. Confirm: inbox item appears, email arrives, unsubscribe link works.</p>
          </div>
        </div>
      </div>
      <div className="callout callout-tip">
        <strong>Deploy without email first.</strong> Ship with{" "}
        <code>fakeEmailProvider()</code> and only <code>inbox</code> channels
        enabled. Verify the route handler, auth, and database work in production.
        Then swap in the real email provider in a follow-up deploy — this
        isolates failures.
      </div>

      <h2>Cron routes for serverless</h2>
      <p>
        Serverless platforms (Vercel, Lambda) have no persistent process to run
        timers. You need cron-triggered routes that call{" "}
        <code>flushScheduledSends()</code> and <code>flushDigests()</code> on a
        schedule. Without these, quiet-hours sends and digests never fire.
      </p>
      <Code
        filename="app/api/cron/notifykit/route.ts"
        code={`import { notify } from "@/lib/notifykit"
import { NextResponse } from "next/server"

// Vercel Cron calls this route on a schedule.
// Protect with CRON_SECRET to prevent public access.
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization")
  if (authHeader !== \`Bearer \${process.env.CRON_SECRET}\`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const [scheduledResults, digestResults] = await Promise.all([
    notify.flushScheduledSends(),
    notify.flushDigests(),
  ])

  return NextResponse.json({
    scheduled: scheduledResults.length,
    digests: digestResults.length,
    flushedAt: new Date().toISOString(),
  })
}`}
      />
      <Code
        filename="vercel.json"
        code={`{
  "crons": [
    {
      "path": "/api/cron/notifykit",
      "schedule": "* * * * *"
    }
  ]
}`}
      />
      <table>
        <thead>
          <tr><th>Method</th><th>What it flushes</th><th>When it matters</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><code>flushScheduledSends()</code></td>
            <td>Sends deferred by quiet hours</td>
            <td>User has quiet hours 10pm–8am — email queued at 11pm delivers at 8am</td>
          </tr>
          <tr>
            <td><code>flushDigests()</code></td>
            <td>Digest buckets past their window</td>
            <td>User gets a single &quot;5 new comments&quot; email instead of 5 separate ones</td>
          </tr>
        </tbody>
      </table>
      <div className="callout callout-warn">
        <strong>Protect the cron endpoint.</strong> Without the{" "}
        <code>CRON_SECRET</code> check, anyone can trigger flushes by hitting
        the URL. Vercel automatically sends the <code>Authorization</code> header
        from your environment — set <code>CRON_SECRET</code> in your Vercel
        project settings to match.
      </div>
      <div className="callout callout-tip">
        <strong>1-minute schedule is fine for most apps.</strong> Cron fires every
        minute but only processes items whose window has expired. If nothing is
        pending, the call returns immediately with zero results. The cost is one
        cold start per minute, not one email per minute.
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

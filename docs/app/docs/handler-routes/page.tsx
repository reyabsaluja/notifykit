import type { Metadata } from "next";
import Link from "next/link";
import { Code } from "../../_components/code";

export const metadata: Metadata = { title: "Handler routes" };

export default function HandlerRoutesPage() {
  return (
    <article>
      <h1>Handler routes</h1>
      <p>
        The handler (<code>createHandler</code> / <code>createRouteHandler</code>)
        exposes a REST API that the React client consumes. This page
        documents every route.
      </p>

      <h2>Mounting the handler</h2>
      <p>
        Before the routes exist, you need to wire the handler into your
        framework. Here are the two most common setups:
      </p>
      <Code
        code={`// app/api/notifykit/[...notifykit]/route.ts  (Next.js App Router)
import { createRouteHandler } from "@notifykitjs/nextjs"
import { notify } from "@/lib/notifykit"
import { auth } from "@/lib/auth"

const handler = createRouteHandler({
  notifykit: notify,
  identify: async (request) => {
    const session = await auth(request)
    if (!session) return null
    return { recipientId: session.userId }
  },
})

export { handler as GET, handler as POST, handler as DELETE }`}
      />
      <Code
        code={`// src/routes/notifykit.ts  (Express / Node.js)
import { createHandler } from "@notifykitjs/core"
import { notify } from "../lib/notifykit"

const handler = createHandler(notify, {
  identify: async (req) => {
    const user = req.user // from your auth middleware
    if (!user) return null
    return { recipientId: user.id }
  },
})

app.all("/api/notifykit/*", handler)`}
      />
      <div className="callout callout-tip">
        <strong>The catch-all route is intentional.</strong> A single route file
        serves all NotifyKit endpoints — inbox, preferences, events, webhooks.
        The handler does its own path matching internally.
      </div>

      <h2>Route overview</h2>
      <table>
        <thead>
          <tr><th>Method</th><th>Path</th><th>Auth</th><th>Purpose</th></tr>
        </thead>
        <tbody>
          <tr><td><code>GET</code></td><td><code>/inbox</code></td><td>Required</td><td>List inbox items</td></tr>
          <tr><td><code>POST</code></td><td><code>/inbox/:id/read</code></td><td>Required</td><td>Mark read</td></tr>
          <tr><td><code>POST</code></td><td><code>/inbox/mark-all-read</code></td><td>Required</td><td>Mark all read</td></tr>
          <tr><td><code>POST</code></td><td><code>/inbox/:id/archive</code></td><td>Required</td><td>Archive item</td></tr>
          <tr><td><code>POST</code></td><td><code>/inbox/:id/unarchive</code></td><td>Required</td><td>Unarchive item</td></tr>
          <tr><td><code>DELETE</code></td><td><code>/inbox/:id</code></td><td>Required</td><td>Delete item</td></tr>
          <tr><td><code>GET</code></td><td><code>/preferences</code></td><td>Required</td><td>List preferences</td></tr>
          <tr><td><code>POST</code></td><td><code>/preferences</code></td><td>Required</td><td>Update preference</td></tr>
          <tr><td><code>GET</code></td><td><code>/notifications</code></td><td>Optional</td><td>List registered definitions</td></tr>
          <tr><td><code>GET</code></td><td><code>/deliveries</code></td><td>Admin</td><td>List delivery records</td></tr>
          <tr><td><code>GET</code></td><td><code>/unsubscribe</code></td><td>Token</td><td>Email unsubscribe (human click)</td></tr>
          <tr><td><code>POST</code></td><td><code>/unsubscribe</code></td><td>Token</td><td>RFC 8058 one-click unsubscribe</td></tr>
          <tr><td><code>GET</code></td><td><code>/events</code></td><td>Required</td><td>SSE realtime stream</td></tr>
          <tr><td><code>POST</code></td><td><code>/webhooks/:provider</code></td><td>Signature</td><td>Inbound provider webhooks</td></tr>
        </tbody>
      </table>

      <div className="callout callout-tip">
        <strong>You rarely call these directly.</strong> The React SDK and{" "}
        <code>useInbox()</code> / <code>usePreferences()</code> hooks call
        these routes automatically. This reference is for debugging, custom
        clients, or non-React integrations.
      </div>

      <h2>Request lifecycle</h2>
      <p>
        Every request to the handler follows the same flow. Understanding it
        helps you debug auth issues and add custom middleware:
      </p>
      <div className="overview-flow">
        <div className="overview-flow-step">
          <span className="overview-flow-number">1</span>
          <div>
            <strong>CORS check</strong>
            <p>If <code>cors</code> is configured, preflight <code>OPTIONS</code> returns headers immediately. Invalid origins get no CORS headers (browser blocks).</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">2</span>
          <div>
            <strong>Rate limit</strong>
            <p>If <code>requestRateLimit</code> is set, checks the sliding window. Over-limit → <code>429</code> with <code>Retry-After</code> header.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">3</span>
          <div>
            <strong>identify()</strong>
            <p>Your function resolves the user from cookies/headers. Returns <code>null</code> → <code>401</code>. Returns scope object → continues.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">4</span>
          <div>
            <strong>authorize()</strong>
            <p>Optional fine-grained check. Called with the resolved identity + the requested permission. Returns <code>false</code> → <code>403</code>.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">5</span>
          <div>
            <strong>Route handler</strong>
            <p>Dispatches to the matched route (inbox, preferences, etc). Scoped by the identity — cross-tenant access is impossible.</p>
          </div>
        </div>
      </div>

      <table>
        <thead>
          <tr><th>Stage fails at</th><th>Response</th><th>Client SDK behavior</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>CORS</td>
            <td>No response (browser blocks)</td>
            <td>Network error in DevTools — check origin config</td>
          </tr>
          <tr>
            <td>Rate limit</td>
            <td><code>429</code> + <code>Retry-After</code></td>
            <td>SDK backs off automatically, retries after delay</td>
          </tr>
          <tr>
            <td>identify()</td>
            <td><code>401</code></td>
            <td>SDK stops retrying — surface a login prompt</td>
          </tr>
          <tr>
            <td>authorize()</td>
            <td><code>403</code></td>
            <td>SDK surfaces the error — user lacks permission</td>
          </tr>
          <tr>
            <td>Route handler</td>
            <td><code>404</code> / <code>400</code> / <code>500</code></td>
            <td>SDK reverts optimistic updates, surfaces error state</td>
          </tr>
        </tbody>
      </table>

      <div className="callout callout-tip">
        <strong>The unsubscribe route skips identify().</strong> It uses the
        HMAC token in the URL for auth instead — email clients can&apos;t send
        cookies. Same for inbound webhook routes, which verify provider signatures.
      </div>

      <h2>Authorization patterns</h2>
      <p>
        <code>identify()</code> answers &quot;who is this?&quot; The optional{" "}
        <code>authorize()</code> callback answers &quot;can they do this?&quot;
        Use it when different users have different access levels:
      </p>
      <table>
        <thead>
          <tr><th>Pattern</th><th>identify() returns</th><th>authorize() checks</th><th>Use case</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Basic (most apps)</strong></td>
            <td><code>{`{ recipientId }`}</code></td>
            <td>Not needed — handler auto-scopes by recipient</td>
            <td>Single user accessing their own inbox/preferences</td>
          </tr>
          <tr>
            <td><strong>Multi-tenant</strong></td>
            <td><code>{`{ recipientId, tenantId }`}</code></td>
            <td>Not needed — scoping prevents cross-tenant access</td>
            <td>SaaS with organizations</td>
          </tr>
          <tr>
            <td><strong>Admin access</strong></td>
            <td><code>{`{ recipientId, role: "admin" }`}</code></td>
            <td>Allow admins to read any user&apos;s deliveries</td>
            <td>Support dashboards, admin panels</td>
          </tr>
          <tr>
            <td><strong>Team permissions</strong></td>
            <td><code>{`{ recipientId, tenantId, permissions }`}</code></td>
            <td>Check specific permissions per route</td>
            <td>Org admins managing other users&apos; preferences</td>
          </tr>
        </tbody>
      </table>
      <Code
        code={`// Admin access pattern: support team can read any user's deliveries
createRouteHandler({
  notifykit: notify,
  identify: async (request) => {
    const session = await auth(request)
    if (!session) return null
    return {
      recipientId: session.userId,
      tenantId: session.orgId,
      role: session.role,
    }
  },
  authorize: async (ctx, permission) => {
    // "deliveries:list" requires admin role
    if (permission === "deliveries:list" && ctx.role !== "admin") {
      return false
    }
    // All other routes: any authenticated user can access their own data
    return true
  },
})`}
      />

      <h3>Permission values</h3>
      <p>
        The <code>authorize()</code> callback receives a permission string
        matching the route being accessed:
      </p>
      <table>
        <thead>
          <tr><th>Route</th><th>Permission</th><th>Typical rule</th></tr>
        </thead>
        <tbody>
          <tr><td><code>GET /inbox</code></td><td><code>inbox:list</code></td><td>Allow all authenticated users</td></tr>
          <tr><td><code>POST /inbox/:id/read</code></td><td><code>inbox:update</code></td><td>Allow all (handler enforces ownership)</td></tr>
          <tr><td><code>DELETE /inbox/:id</code></td><td><code>inbox:delete</code></td><td>Allow all (handler enforces ownership)</td></tr>
          <tr><td><code>GET /preferences</code></td><td><code>preferences:list</code></td><td>Allow all authenticated users</td></tr>
          <tr><td><code>POST /preferences</code></td><td><code>preferences:update</code></td><td>Allow all (users manage their own)</td></tr>
          <tr><td><code>GET /deliveries</code></td><td><code>deliveries:list</code></td><td>Admin only</td></tr>
          <tr><td><code>GET /notifications</code></td><td><code>notifications:list</code></td><td>Public (unless <code>protectNotifications: true</code>)</td></tr>
        </tbody>
      </table>
      <div className="callout">
        <strong>You don&apos;t need authorize() for most apps.</strong> The handler
        already enforces ownership — a user can only read/modify their own inbox
        items and preferences. <code>authorize()</code> is for additional rules
        on top of that: admin access, team-level permission systems, or restricting
        specific routes entirely.
      </div>

      <h2>Configuration</h2>
      <Code
        code={`import { createHandler } from "@notifykitjs/core"

const handler = createHandler(notify, {
  identify: async (request) => ({ recipientId, tenantId?, workspaceId? } | null),
  authorize?: async (ctx, permission) => boolean,
  unsubscribeSecret?: string,
  cors?: string | string[],
  protectNotifications?: boolean,
  requestRateLimit?: { max: number; windowMs: number },
  webhooks?: Record<string, (headers: Headers, body: string) => boolean | Promise<boolean>>,
  onWebhookEvent?: (provider: string, payload: unknown) => void | Promise<void>,
})`}
      />

      <h2>Inbox routes</h2>
      <table>
        <thead>
          <tr><th>Route</th><th>Returns</th><th>Notes</th></tr>
        </thead>
        <tbody>
          <tr><td><code>GET /inbox</code></td><td><code>InboxItem[]</code></td><td>Query params: <code>?archived</code> (boolean), <code>?limit</code> (number)</td></tr>
          <tr><td><code>POST /inbox/:id/read</code></td><td><code>InboxItem</code></td><td>403 if item belongs to another user</td></tr>
          <tr><td><code>POST /inbox/mark-all-read</code></td><td><code>{`{ count }`}</code></td><td>Returns number of items marked</td></tr>
          <tr><td><code>POST /inbox/:id/archive</code></td><td><code>InboxItem</code></td><td>Sets <code>archivedAt</code></td></tr>
          <tr><td><code>POST /inbox/:id/unarchive</code></td><td><code>InboxItem</code></td><td>Clears <code>archivedAt</code></td></tr>
          <tr><td><code>DELETE /inbox/:id</code></td><td><code>204</code></td><td>Permanent — cannot be undone</td></tr>
        </tbody>
      </table>

      <h2>Preference routes</h2>
      <table>
        <thead>
          <tr><th>Route</th><th>Returns</th><th>Notes</th></tr>
        </thead>
        <tbody>
          <tr><td><code>GET /preferences</code></td><td><code>RecipientPreference[]</code></td><td>All preferences for the authenticated user</td></tr>
          <tr><td><code>POST /preferences</code></td><td><code>RecipientPreference</code></td><td>Upserts — creates if not exists</td></tr>
        </tbody>
      </table>
      <Code
        code={`// POST /preferences body:
{
  "notificationId": "comment_mentioned",
  "channels": { "email": false }
}`}
      />

      <h2>Other routes</h2>
      <table>
        <thead>
          <tr><th>Route</th><th>Auth</th><th>Returns</th><th>Notes</th></tr>
        </thead>
        <tbody>
          <tr><td><code>GET /notifications</code></td><td>Optional</td><td>Notification metadata array</td><td>Public by default. Set <code>protectNotifications: true</code> to require auth.</td></tr>
          <tr><td><code>GET /deliveries</code></td><td>Admin</td><td><code>DeliveryRecord[]</code></td><td>Sensitive fields (body, subject, to) are redacted. Non-admins see only own records.</td></tr>
        </tbody>
      </table>

      <h2>Unsubscribe, realtime &amp; webhooks</h2>
      <table>
        <thead>
          <tr><th>Route</th><th>Auth</th><th>Purpose</th></tr>
        </thead>
        <tbody>
          <tr><td><code>GET /unsubscribe?token=...</code></td><td>HMAC token</td><td>Human click from email — verifies token, disables email, renders confirmation</td></tr>
          <tr><td><code>POST /unsubscribe</code></td><td>HMAC token</td><td>RFC 8058 one-click (mail client header). Same verification, returns 200.</td></tr>
          <tr><td><code>GET /events</code></td><td>Required</td><td>SSE stream — inbox mutations in real time. React client connects automatically.</td></tr>
          <tr><td><code>POST /webhooks/:provider</code></td><td>Signature</td><td>Inbound provider webhooks (delivery status, bounces, opens). 401 on invalid sig.</td></tr>
        </tbody>
      </table>

      <h2>Error responses</h2>
      <p>
        Every error returns a JSON body with the same shape. Use{" "}
        <code>error</code> for programmatic handling and <code>message</code>{" "}
        for developer-facing logs:
      </p>
      <Code
        code={`{ "error": "not_found", "message": "Inbox item not found or not owned by this user" }`}
      />
      <table>
        <thead>
          <tr><th>Status</th><th><code>error</code> value</th><th>When</th></tr>
        </thead>
        <tbody>
          <tr><td><code>400</code></td><td><code>bad_request</code></td><td>Missing or malformed request body / query params</td></tr>
          <tr><td><code>401</code></td><td><code>unauthorized</code></td><td><code>identify()</code> returned <code>null</code> — no valid session</td></tr>
          <tr><td><code>403</code></td><td><code>forbidden</code></td><td>Authenticated but not authorized (cross-tenant access, missing permission)</td></tr>
          <tr><td><code>404</code></td><td><code>not_found</code></td><td>Resource doesn&apos;t exist or isn&apos;t owned by this user</td></tr>
          <tr><td><code>429</code></td><td><code>rate_limited</code></td><td><code>requestRateLimit</code> exceeded — includes <code>Retry-After</code> header</td></tr>
          <tr><td><code>500</code></td><td><code>internal_error</code></td><td>Unhandled error — check server logs</td></tr>
        </tbody>
      </table>
      <div className="callout callout-tip">
        <strong>The React SDK handles these for you.</strong> On 401 it stops
        retrying. On 429 it backs off automatically. On 4xx mutations it
        reverts optimistic updates. You only need this reference when building
        a custom client or debugging with the network tab.
      </div>

      <h2>Request &amp; response examples</h2>
      <p>
        Complete examples for debugging in the terminal or building non-React
        clients. All paths are relative to your handler base (e.g.{" "}
        <code>/api/notifykit</code>).
      </p>
      <Code
        lang="bash"
        code={`# List inbox items (most recent first)
curl -s http://localhost:3000/api/notifykit/inbox?limit=5 \\
  -H "Cookie: session=..." | jq .`}
      />
      <Code
        code={`// Response: InboxItem[]
[
  {
    "id": "inb_a1b2c3",
    "notificationId": "comment_mentioned",
    "recipientId": "user_123",
    "title": "Rey mentioned you",
    "body": "In Launch Plan",
    "actionUrl": "/posts/42",
    "readAt": null,
    "archivedAt": null,
    "createdAt": "2025-03-15T10:30:00.000Z"
  }
]`}
      />
      <Code
        lang="bash"
        code={`# Mark an item as read
curl -s -X POST http://localhost:3000/api/notifykit/inbox/inb_a1b2c3/read \\
  -H "Cookie: session=..."`}
      />
      <Code
        code={`// Response: InboxItem (updated)
{
  "id": "inb_a1b2c3",
  "title": "Rey mentioned you",
  "readAt": "2025-03-15T10:31:22.000Z",
  ...
}`}
      />
      <Code
        lang="bash"
        code={`# Update preferences (disable email for a notification)
curl -s -X POST http://localhost:3000/api/notifykit/preferences \\
  -H "Cookie: session=..." \\
  -H "Content-Type: application/json" \\
  -d '{"notificationId": "comment_mentioned", "channels": {"email": false}}'`}
      />
      <Code
        code={`// Response: RecipientPreference
{
  "recipientId": "user_123",
  "notificationId": "comment_mentioned",
  "channels": { "inbox": true, "email": false },
  "updatedAt": "2025-03-15T10:32:00.000Z"
}`}
      />
      <Code
        lang="bash"
        code={`# List registered notifications (public metadata)
curl -s http://localhost:3000/api/notifykit/notifications | jq .`}
      />
      <Code
        code={`// Response: NotificationMeta[]
[
  {
    "id": "comment_mentioned",
    "channels": ["inbox", "email"],
    "category": "activity",
    "description": "Someone mentioned you in a comment",
    "required": false
  },
  {
    "id": "password_reset",
    "channels": ["email"],
    "category": "billing",
    "description": "Password reset link",
    "required": true
  }
]`}
      />
      <div className="callout callout-tip">
        <strong>Pipe to <code>jq</code> for readable output.</strong> All
        responses are JSON. Use <code>jq .</code> for pretty printing, or{" "}
        <code>jq &apos;.[0].title&apos;</code> to extract specific fields
        when scripting against the API.
      </div>

      <h2>CORS &amp; rate limiting</h2>
      <table>
        <thead>
          <tr><th>Option</th><th>Effect</th></tr>
        </thead>
        <tbody>
          <tr><td><code>cors: &quot;https://app.com&quot;</code></td><td>All routes respond to <code>OPTIONS</code> with configured CORS headers</td></tr>
          <tr><td><code>requestRateLimit: {`{ max, windowMs }`}</code></td><td>Per-identity sliding window on authenticated routes. Exceeding returns <code>429</code>.</td></tr>
        </tbody>
      </table>
      <div className="callout">
        <strong>Unauthenticated routes</strong> (notifications, unsubscribe) are
        not throttled by <code>requestRateLimit</code>. Apply IP-based limiting
        at your reverse proxy for those.
      </div>

      <h2>Building a custom client</h2>
      <p>
        The React SDK calls these routes for you. If you&apos;re building a
        mobile app, a Vue/Svelte frontend, or a backend-to-backend integration,
        call them directly:
      </p>
      <Code
        code={`// Minimal fetch-based client (works anywhere with fetch)
const BASE = "https://app.com/api/notifykit"

async function notifyFetch(path, opts = {}) {
  const res = await fetch(\`\${BASE}\${path}\`, {
    headers: {
      "Content-Type": "application/json",
      // Your auth header — cookie, bearer token, etc.
      ...opts.headers,
    },
    credentials: "include",
    ...opts,
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(\`\${res.status}: \${err.message}\`)
  }
  return res.status === 204 ? null : res.json()
}

// Inbox operations
const items = await notifyFetch("/inbox?limit=20")
await notifyFetch("/inbox/inb_abc/read", { method: "POST" })
await notifyFetch("/inbox/mark-all-read", { method: "POST" })
await notifyFetch("/inbox/inb_abc", { method: "DELETE" })

// Preferences
const prefs = await notifyFetch("/preferences")
await notifyFetch("/preferences", {
  method: "POST",
  body: JSON.stringify({
    notificationId: "comment_mentioned",
    channels: { email: false },
  }),
})

// SSE realtime (browser EventSource)
const events = new EventSource(\`\${BASE}/events\`, { withCredentials: true })
events.onmessage = (e) => {
  const data = JSON.parse(e.data)
  if (data.event === "inbox.created") addToList(data.payload)
}`}
      />
      <table>
        <thead>
          <tr><th>Platform</th><th>Auth approach</th><th>SSE support</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Web (same origin)</strong></td>
            <td>Cookies via <code>credentials: &quot;include&quot;</code></td>
            <td>Native <code>EventSource</code></td>
          </tr>
          <tr>
            <td><strong>Web (cross-origin)</strong></td>
            <td>Bearer token + CORS config on handler</td>
            <td>Native <code>EventSource</code> (limited header support — use query param token)</td>
          </tr>
          <tr>
            <td><strong>React Native / mobile</strong></td>
            <td>Bearer token in <code>Authorization</code> header</td>
            <td>Use <code>react-native-sse</code> or polyfill</td>
          </tr>
          <tr>
            <td><strong>Backend service</strong></td>
            <td>Service token or API key via custom <code>identify()</code></td>
            <td>Not needed — poll <code>/inbox</code> or use hooks server-side</td>
          </tr>
        </tbody>
      </table>
      <div className="callout callout-warn">
        <strong>EventSource doesn&apos;t support custom headers.</strong> If
        your auth requires a bearer token (not cookies), pass it as a query
        param (<code>/events?token=...</code>) and verify it in your{" "}
        <code>identify()</code> function. Never log these URLs.
      </div>

      <h2>SSE event reference</h2>
      <p>
        The <code>GET /events</code> route streams Server-Sent Events to
        connected clients. Each SSE frame follows the standard wire format —
        an <code>event:</code> line, a <code>data:</code> line with JSON, and
        a blank line terminator:
      </p>
      <Code
        lang="bash"
        code={`event: inbox.created
data: {"id":"inb_a1b2c3","notificationId":"comment_mentioned","recipientId":"user_123","title":"Rey mentioned you","body":"In Launch Plan","actionUrl":"/posts/42","readAt":null,"archivedAt":null,"createdAt":"2025-03-15T10:30:00.000Z"}

event: inbox.updated
data: {"id":"inb_a1b2c3","readAt":"2025-03-15T10:31:22.000Z"}

event: heartbeat
data: {}`}
      />
      <table>
        <thead>
          <tr><th>Event type</th><th>Payload</th><th>When it fires</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><code>inbox.created</code></td>
            <td>Full <code>InboxItem</code></td>
            <td>New notification delivered to this recipient&apos;s inbox</td>
          </tr>
          <tr>
            <td><code>inbox.updated</code></td>
            <td>Partial <code>InboxItem</code> (id + changed fields)</td>
            <td>Item marked read, archived, or unarchived</td>
          </tr>
          <tr>
            <td><code>inbox.deleted</code></td>
            <td><code>{`{ "id": "inb_..." }`}</code></td>
            <td>Item permanently deleted</td>
          </tr>
          <tr>
            <td><code>inbox.all_read</code></td>
            <td><code>{`{ "count": 5, "readAt": "..." }`}</code></td>
            <td>Bulk mark-all-read action</td>
          </tr>
          <tr>
            <td><code>heartbeat</code></td>
            <td><code>{`{}`}</code></td>
            <td>Every 30 seconds — keeps the connection alive past proxies</td>
          </tr>
        </tbody>
      </table>

      <h3>Handling events in a custom client</h3>
      <Code
        code={`const events = new EventSource(\`\${BASE}/events\`, { withCredentials: true })

// Named event listeners (preferred — each event type gets its own handler)
events.addEventListener("inbox.created", (e) => {
  const item = JSON.parse(e.data)
  addToInbox(item)
  incrementUnreadCount()
})

events.addEventListener("inbox.updated", (e) => {
  const patch = JSON.parse(e.data)
  updateInboxItem(patch.id, patch)
  if (patch.readAt) decrementUnreadCount()
})

events.addEventListener("inbox.deleted", (e) => {
  const { id } = JSON.parse(e.data)
  removeFromInbox(id)
})

events.addEventListener("inbox.all_read", (e) => {
  const { readAt } = JSON.parse(e.data)
  markAllItemsRead(readAt)
  resetUnreadCount()
})

// Reconnection: EventSource auto-reconnects on network drops.
// The server replays missed events using the Last-Event-ID header.
events.onerror = () => {
  // Browser retries automatically — no manual reconnect needed.
  // Show a "reconnecting..." indicator if desired.
}`}
      />

      <h3>Connection lifecycle</h3>
      <div className="overview-flow">
        <div className="overview-flow-step">
          <span className="overview-flow-number">1</span>
          <div>
            <strong>Connect</strong>
            <p>Client opens <code>GET /events</code>. Server runs <code>identify()</code> and holds the connection open.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">2</span>
          <div>
            <strong>Stream</strong>
            <p>Events push as mutations happen. Heartbeats fire every 30s to prevent proxy/load-balancer timeouts.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">3</span>
          <div>
            <strong>Disconnect</strong>
            <p>Network drops or tab closes. Browser <code>EventSource</code> auto-reconnects with <code>Last-Event-ID</code>.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">4</span>
          <div>
            <strong>Replay</strong>
            <p>Server replays missed events since the last ID. Client state catches up without a full refetch.</p>
          </div>
        </div>
      </div>
      <div className="callout callout-tip">
        <strong>The React SDK handles all of this.</strong>{" "}
        <code>useInbox()</code> connects to SSE automatically, reconciles
        missed events on reconnect, and updates the component state. This
        reference is only needed for custom clients or debugging the event
        stream in DevTools.
      </div>

      <div className="page-nav">
        <Link href="/docs/types">
          <span className="page-nav-label">Previous</span>
          <span className="page-nav-title">TypeScript types</span>
        </Link>
        <Link href="/demo">
          <span className="page-nav-label">Next</span>
          <span className="page-nav-title">Live demo</span>
        </Link>
      </div>
    </article>
  );
}

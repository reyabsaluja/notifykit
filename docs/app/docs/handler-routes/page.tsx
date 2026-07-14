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

      <div className="features">
        <div className="feature-card">
          <h3>Single catch-all route</h3>
          <p>One file serves inbox, preferences, events, unsubscribe, and webhooks. No manual routing.</p>
        </div>
        <div className="feature-card">
          <h3>Identity-scoped</h3>
          <p>Every request resolves the user via your <code>identify()</code> callback. Cross-tenant access is impossible.</p>
        </div>
        <div className="feature-card">
          <h3>SSE realtime stream</h3>
          <p>The <code>/events</code> endpoint pushes inbox updates to the client — no polling, no WebSocket setup.</p>
        </div>
        <div className="feature-card">
          <h3>Optimistic SDK</h3>
          <p>The React SDK calls these routes automatically with optimistic updates and automatic error recovery.</p>
        </div>
      </div>

      <h2>Mounting the handler</h2>
      <p>
        Before the routes exist, you need to wire the handler into your
        framework. Here are the two most common setups:
      </p>
      <Code
        filename="app/api/notifykit/[...notifykit]/route.ts"
        code={`import { createRouteHandler } from "@notifykitjs/nextjs"
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
        filename="src/routes/notifykit.ts"
        code={`import { createHandler } from "@notifykitjs/core"
import { notify } from "../lib/notifykit"

const handler = createHandler(notify, {
  identify: async (req) => {
    const user = req.user
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
        filename="app/api/notifykit/[...notifykit]/route.ts"
        code={`createRouteHandler({
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
    if (permission === "deliveries:list" && ctx.role !== "admin") {
      return false
    }
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
      <div className="callout callout-tip">
        <strong>You don&apos;t need authorize() for most apps.</strong> The handler
        already enforces ownership — a user can only read/modify their own inbox
        items and preferences. <code>authorize()</code> is for additional rules
        on top of that: admin access, team-level permission systems, or restricting
        specific routes entirely.
      </div>

      <h2>Configuration</h2>
      <Code
        filename="lib/handler.ts"
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
      <table>
        <thead>
          <tr><th>Option</th><th>Required</th><th>Default</th><th>Purpose</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><code>identify</code></td>
            <td>Yes</td>
            <td>—</td>
            <td>Resolves the current user from the request. Return <code>null</code> to reject (401). Return an object with at minimum <code>recipientId</code>.</td>
          </tr>
          <tr>
            <td><code>authorize</code></td>
            <td>No</td>
            <td>Allow all</td>
            <td>Fine-grained permission check after identity resolves. Return <code>false</code> to reject (403).</td>
          </tr>
          <tr>
            <td><code>unsubscribeSecret</code></td>
            <td>No</td>
            <td>—</td>
            <td>HMAC secret for verifying email unsubscribe links. Required if you use the inbox channel with email fallback.</td>
          </tr>
          <tr>
            <td><code>cors</code></td>
            <td>No</td>
            <td>Disabled</td>
            <td>Allowed origins for CORS preflight. Pass a string or array of strings. Omit to disable CORS headers entirely.</td>
          </tr>
          <tr>
            <td><code>protectNotifications</code></td>
            <td>No</td>
            <td><code>false</code></td>
            <td>When <code>true</code>, the <code>GET /notifications</code> route requires authentication. Useful if notification definitions are sensitive.</td>
          </tr>
          <tr>
            <td><code>requestRateLimit</code></td>
            <td>No</td>
            <td>Disabled</td>
            <td>Per-identity sliding window. <code>max</code>: requests allowed per window. <code>windowMs</code>: window duration in ms.</td>
          </tr>
          <tr>
            <td><code>webhooks</code></td>
            <td>No</td>
            <td>—</td>
            <td>Signature verification functions keyed by provider name. Called on <code>POST /webhooks/:provider</code>. Return <code>false</code> to reject (401).</td>
          </tr>
          <tr>
            <td><code>onWebhookEvent</code></td>
            <td>No</td>
            <td>—</td>
            <td>Callback fired after a webhook passes signature verification. Use for processing delivery status updates, bounces, or opens.</td>
          </tr>
        </tbody>
      </table>
      <div className="callout callout-tip">
        <strong>Start with just <code>identify</code>.</strong> Every other option
        has a sensible default. Add <code>cors</code> when your frontend is on a
        different origin, <code>requestRateLimit</code> when you go to production,
        and <code>authorize</code> only if you need admin-level routes.
      </div>

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
        lang="json"
        code={`{
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
        lang="json"
        code={`[
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
        lang="json"
        code={`{
  "id": "inb_a1b2c3",
  "title": "Rey mentioned you",
  "readAt": "2025-03-15T10:31:22.000Z"
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
        lang="json"
        code={`{
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
        lang="json"
        code={`[
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
      <div className="callout callout-warn">
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
        filename="lib/notifykit-client.ts"
        code={`const BASE = "https://app.com/api/notifykit"

async function notifyFetch(path, opts = {}) {
  const res = await fetch(\`\${BASE}\${path}\`, {
    headers: {
      "Content-Type": "application/json",
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
        filename="lib/realtime-events.ts"
        code={`const events = new EventSource(\`\${BASE}/events\`, { withCredentials: true })

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

events.onerror = () => {
  // Browser retries automatically — no manual reconnect needed
}`}
      />

      <h2>Optimistic updates</h2>
      <p>
        The React SDK applies optimistic updates automatically — mark-read
        updates the UI instantly, then confirms with the server. If you&apos;re
        building a custom client, implement this pattern yourself to avoid
        perceived latency:
      </p>
      <div className="overview-flow">
        <div className="overview-flow-step">
          <span className="overview-flow-number">1</span>
          <div>
            <strong>Update UI immediately</strong>
            <p>Set <code>readAt</code> / remove from list before the server responds.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">2</span>
          <div>
            <strong>Fire request</strong>
            <p>POST to the server in the background.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">3</span>
          <div>
            <strong>On success: confirm</strong>
            <p>Replace the optimistic state with the server&apos;s response (authoritative timestamps).</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">4</span>
          <div>
            <strong>On failure: rollback</strong>
            <p>Revert to the previous state. Show a toast or error indicator.</p>
          </div>
        </div>
      </div>
      <Code
        filename="lib/inbox-store.ts"
        code={`function createInboxStore(baseUrl) {
  let items = []
  let unreadCount = 0
  const listeners = new Set()

  function notify() { listeners.forEach(fn => fn({ items, unreadCount })) }

  return {
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn) },

    setItems(newItems) {
      items = newItems
      unreadCount = items.filter(i => !i.readAt).length
      notify()
    },

    async markRead(itemId) {
      // 1. Snapshot for rollback
      const prev = items.map(i => ({ ...i }))
      const prevCount = unreadCount

      // 2. Optimistic update
      items = items.map(i =>
        i.id === itemId ? { ...i, readAt: new Date().toISOString() } : i
      )
      unreadCount = items.filter(i => !i.readAt).length
      notify()

      // 3. Confirm with server
      try {
        const res = await fetch(\`\${baseUrl}/inbox/\${itemId}/read\`, { method: "POST", credentials: "include" })
        if (!res.ok) throw new Error(res.statusText)
        const updated = await res.json()
        items = items.map(i => i.id === itemId ? updated : i)
        notify()
      } catch {
        // 4. Rollback on failure
        items = prev
        unreadCount = prevCount
        notify()
      }
    },

    async markAllRead() {
      const prev = items.map(i => ({ ...i }))
      items = items.map(i => ({ ...i, readAt: i.readAt ?? new Date().toISOString() }))
      unreadCount = 0
      notify()

      try {
        const res = await fetch(\`\${baseUrl}/inbox/mark-all-read\`, { method: "POST", credentials: "include" })
        if (!res.ok) throw new Error(res.statusText)
      } catch {
        items = prev
        unreadCount = prev.filter(i => !i.readAt).length
        notify()
      }
    },

    async deleteItem(itemId) {
      const prev = items.map(i => ({ ...i }))
      items = items.filter(i => i.id !== itemId)
      unreadCount = items.filter(i => !i.readAt).length
      notify()

      try {
        const res = await fetch(\`\${baseUrl}/inbox/\${itemId}\`, { method: "DELETE", credentials: "include" })
        if (!res.ok) throw new Error(res.statusText)
      } catch {
        items = prev
        unreadCount = prev.filter(i => !i.readAt).length
        notify()
      }
    },
  }
}`}
      />
      <table>
        <thead>
          <tr><th>Operation</th><th>Optimistic behavior</th><th>Rollback on failure</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Mark read</strong></td>
            <td>Set <code>readAt</code> instantly, decrement badge</td>
            <td>Clear <code>readAt</code>, restore badge count</td>
          </tr>
          <tr>
            <td><strong>Mark all read</strong></td>
            <td>Set <code>readAt</code> on all items, zero the badge</td>
            <td>Restore original <code>readAt</code> values and count</td>
          </tr>
          <tr>
            <td><strong>Archive</strong></td>
            <td>Remove from visible list immediately</td>
            <td>Re-insert at original position</td>
          </tr>
          <tr>
            <td><strong>Delete</strong></td>
            <td>Remove from list, update count</td>
            <td>Re-insert item, restore count</td>
          </tr>
        </tbody>
      </table>
      <div className="callout callout-tip">
        <strong>SSE confirms or conflicts.</strong> If your SSE connection is
        active, you&apos;ll receive an <code>inbox.updated</code> event after
        the server processes the mutation. Use it to replace your optimistic
        state with the authoritative version — this handles the case where
        another tab or device made the same change.
      </div>
      <div className="callout callout-warn">
        <strong>Never optimistically delete — unless you can undo.</strong>{" "}
        DELETE is permanent on the server. If the request fails after you&apos;ve
        removed the item from the UI, the user has no way to get it back. Either
        add a brief undo window (5 seconds before firing the request) or show
        a confirmation first.
      </div>

      <h2>Pagination</h2>
      <p>
        Real inbox UIs need pagination — a user with 200 notifications
        shouldn&apos;t load them all at once. The handler supports cursor-based
        pagination via <code>?cursor</code> and <code>?limit</code> query params:
      </p>
      <table>
        <thead>
          <tr><th>Param</th><th>Type</th><th>Default</th><th>Purpose</th></tr>
        </thead>
        <tbody>
          <tr><td><code>limit</code></td><td>number</td><td>20</td><td>Max items to return per page</td></tr>
          <tr><td><code>cursor</code></td><td>string (item ID)</td><td>—</td><td>Return items older than this ID (exclusive)</td></tr>
          <tr><td><code>archived</code></td><td>boolean</td><td>false</td><td>Include only archived items when <code>true</code></td></tr>
        </tbody>
      </table>
      <Code
        lang="bash"
        code={`GET /api/notifykit/inbox?limit=20

# To load the next page, pass the last item's ID as cursor:
GET /api/notifykit/inbox?limit=20&cursor=inb_oldest_on_page

# When you get fewer items than the limit, you've reached the end.`}
      />

      <h3>Infinite scroll pattern</h3>
      <p>
        The most common inbox pattern: load more items as the user scrolls
        down. Use the last item&apos;s ID as the cursor for each subsequent fetch:
      </p>
      <Code
        filename="hooks/use-infinite-inbox.ts"
        code={`function useInfiniteInbox(baseUrl) {
  const [items, setItems] = useState([])
  const [cursor, setCursor] = useState(null)
  const [hasMore, setHasMore] = useState(true)
  const [loading, setLoading] = useState(false)

  const PAGE_SIZE = 20

  async function loadMore() {
    if (loading || !hasMore) return
    setLoading(true)

    const params = new URLSearchParams({ limit: String(PAGE_SIZE) })
    if (cursor) params.set("cursor", cursor)

    const res = await fetch(\`\${baseUrl}/inbox?\${params}\`, {
      credentials: "include",
    })
    const page = await res.json()

    setItems(prev => [...prev, ...page])
    setHasMore(page.length === PAGE_SIZE)
    if (page.length > 0) setCursor(page[page.length - 1].id)
    setLoading(false)
  }

  // Load first page on mount
  useEffect(() => { loadMore() }, [])

  return { items, loadMore, hasMore, loading }
}`}
      />

      <h3>Load-more button vs infinite scroll</h3>
      <table>
        <thead>
          <tr><th>Pattern</th><th>Best for</th><th>Implementation</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Infinite scroll</strong></td>
            <td>Primary inbox view — users browse casually</td>
            <td>Attach an <code>IntersectionObserver</code> to a sentinel element at the bottom of the list. When visible, call <code>loadMore()</code>.</td>
          </tr>
          <tr>
            <td><strong>Load more button</strong></td>
            <td>Settings/archive pages — users browse intentionally</td>
            <td>Render a button below the list that calls <code>loadMore()</code> on click. Simpler, more accessible.</td>
          </tr>
          <tr>
            <td><strong>Virtual list</strong></td>
            <td>Power users with 500+ items — performance-critical</td>
            <td>Use a virtualization library (react-window, TanStack Virtual). Combine with pagination to load chunks as the user scrolls into unloaded regions.</td>
          </tr>
        </tbody>
      </table>
      <Code
        filename="components/inbox-list.tsx"
        code={`function InboxList() {
  const { items, loadMore, hasMore, loading } = useInfiniteInbox(BASE_URL)
  const sentinelRef = useRef(null)

  useEffect(() => {
    if (!sentinelRef.current) return
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) loadMore() },
      { rootMargin: "200px" } // trigger 200px before the sentinel is visible
    )
    observer.observe(sentinelRef.current)
    return () => observer.disconnect()
  }, [loadMore])

  return (
    <ul>
      {items.map(item => <InboxRow key={item.id} item={item} />)}
      {hasMore && <li ref={sentinelRef}>{loading ? "Loading..." : ""}</li>}
    </ul>
  )
}`}
      />

      <h3>SSE + pagination: reconciling new items</h3>
      <p>
        When SSE pushes a new <code>inbox.created</code> event while the user
        has scrolled down (and possibly loaded multiple pages), prepend it to
        the list — don&apos;t refetch everything:
      </p>
      <Code
        filename="lib/sse-reconcile.ts"
        code={`events.addEventListener("inbox.created", (e) => {
  const newItem = JSON.parse(e.data)
  setItems(prev => [newItem, ...prev])
})

// When SSE delivers an update, patch in-place
events.addEventListener("inbox.updated", (e) => {
  const patch = JSON.parse(e.data)
  setItems(prev => prev.map(i => i.id === patch.id ? { ...i, ...patch } : i))
})

// When SSE delivers a delete, remove from wherever it is in the list
events.addEventListener("inbox.deleted", (e) => {
  const { id } = JSON.parse(e.data)
  setItems(prev => prev.filter(i => i.id !== id))
})`}
      />
      <div className="callout callout-tip">
        <strong>New items prepend, old items paginate.</strong> SSE handles the
        &quot;top&quot; of the list (real-time arrivals), pagination handles the
        &quot;bottom&quot; (historical items). They don&apos;t interfere — cursor
        pagination is stable even when new items are inserted above.
      </div>

      <h2>Troubleshooting</h2>
      <p>
        Handler issues usually surface as network errors in the browser or
        unexpected responses during development. Work through the table below
        — most problems resolve within the first three rows.
      </p>
      <table>
        <thead>
          <tr><th>Symptom</th><th>Likely cause</th><th>Fix</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>CORS error in browser console</td>
            <td><code>cors</code> not configured, or origin doesn&apos;t match</td>
            <td>Set <code>cors: &quot;http://localhost:3000&quot;</code> (exact origin — no trailing slash, no wildcard in prod)</td>
          </tr>
          <tr>
            <td>All requests return 401</td>
            <td><code>identify()</code> returning <code>null</code> — session not resolving</td>
            <td>Log inside <code>identify()</code>. Common causes: cookie not sent (<code>credentials: &quot;include&quot;</code> missing), auth middleware not running on this route.</td>
          </tr>
          <tr>
            <td>404 on all handler routes</td>
            <td>Catch-all route not matching, or wrong path prefix</td>
            <td>Verify file is at <code>app/api/notifykit/[...notifykit]/route.ts</code>. The segment name must match the SDK&apos;s base path.</td>
          </tr>
          <tr>
            <td>Inbox returns empty but sends succeed</td>
            <td>Handler <code>identify()</code> returns a different <code>recipientId</code> than what was passed to <code>send()</code></td>
            <td>Ensure the ID from your auth session matches the ID you pass to <code>send()</code> exactly (case-sensitive).</td>
          </tr>
          <tr>
            <td>Preferences save but don&apos;t affect delivery</td>
            <td>Preference written without <code>tenantId</code>, but sends include one (or vice versa)</td>
            <td>The scopes must match. If your sends pass <code>tenantId</code>, your handler must return it from <code>identify()</code> too.</td>
          </tr>
          <tr>
            <td>SSE connects then drops instantly</td>
            <td>Response buffering by proxy, CDN, or middleware</td>
            <td>Disable buffering for the <code>/events</code> route. On Vercel: use <code>export const dynamic = &quot;force-dynamic&quot;</code>. On nginx: <code>proxy_buffering off</code>.</td>
          </tr>
          <tr>
            <td>SSE works locally but not in production</td>
            <td>Load balancer idle timeout shorter than heartbeat interval</td>
            <td>Set <code>heartbeatMs</code> below your LB timeout (e.g. <code>25000</code> for a 30s ALB timeout). See <Link href="/docs/realtime">Realtime</Link> tuning.</td>
          </tr>
          <tr>
            <td>Unsubscribe link returns 401</td>
            <td><code>unsubscribeSecret</code> not set on the handler, or env var is empty/missing in this environment</td>
            <td>Verify <code>process.env.NOTIFYKIT_SECRET</code> is set. The unsubscribe route uses HMAC verification, not session auth — it needs the secret.</td>
          </tr>
          <tr>
            <td>Mark-read returns 403</td>
            <td>Inbox item belongs to a different (recipient, tenant) pair than what <code>identify()</code> resolved</td>
            <td>The handler enforces ownership. Check that the user&apos;s session matches the tenant context they&apos;re operating in.</td>
          </tr>
          <tr>
            <td>Request works in Postman but not the browser</td>
            <td>Cookies not sent (missing <code>credentials: &quot;include&quot;</code>) or CORS blocking preflight</td>
            <td>Add <code>credentials: &quot;include&quot;</code> to fetch calls. Ensure the handler&apos;s <code>cors</code> allows the browser&apos;s origin.</td>
          </tr>
        </tbody>
      </table>

      <div className="callout callout-tip">
        <strong>Debug with curl first.</strong> If curl works but the browser
        doesn&apos;t, the issue is CORS or cookies. If curl also fails, the
        issue is server-side (auth, routing, handler config). This narrows the
        search space immediately.
      </div>

      <h3>Diagnostic checklist</h3>
      <p>
        Run through these checks in order when the handler isn&apos;t
        working. Each step eliminates one failure category:
      </p>
      <div className="overview-flow">
        <div className="overview-flow-step">
          <span className="overview-flow-number">1</span>
          <div>
            <strong>Route exists</strong>
            <p>Hit <code>GET /api/notifykit/notifications</code> with curl. If 404: the catch-all route file isn&apos;t in the right location.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">2</span>
          <div>
            <strong>Auth resolves</strong>
            <p>Hit <code>GET /api/notifykit/inbox</code> with a valid session cookie. If 401: <code>identify()</code> isn&apos;t resolving your session.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">3</span>
          <div>
            <strong>Data exists</strong>
            <p>If 200 but empty: send a test notification via <code>notify.send()</code> and try again. Ensure <code>recipientId</code> matches.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">4</span>
          <div>
            <strong>Browser works</strong>
            <p>If curl succeeds but browser fails: add <code>cors</code> to the handler and <code>credentials: &quot;include&quot;</code> to the client.</p>
          </div>
        </div>
      </div>
      <Code
        lang="bash"
        code={`# Step 1: Route exists?
curl -s http://localhost:3000/api/notifykit/notifications | jq .
# Expected: array of notification definitions (or 200 with [])

# Step 2: Auth resolves?
curl -s -H "Cookie: session=YOUR_SESSION_COOKIE" \\
  http://localhost:3000/api/notifykit/inbox | jq .
# Expected: 200 with inbox items (or empty array)
# If 401: identify() returned null

# Step 3: SSE connects?
curl -N -H "Cookie: session=YOUR_SESSION_COOKIE" \\
  http://localhost:3000/api/notifykit/events
# Expected: "event: heartbeat" within 30s`}
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

      <div className="button-row">
        <Link href="/docs/security" className="primary">Security model</Link>
        <Link href="/docs/realtime">Realtime & SSE</Link>
        <Link href="/docs/react">React SDK</Link>
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

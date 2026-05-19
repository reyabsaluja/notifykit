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

      <h3>GET /inbox</h3>
      <p>List inbox items for the authenticated user.</p>
      <table>
        <thead>
          <tr><th>Param</th><th>Type</th><th>Description</th></tr>
        </thead>
        <tbody>
          <tr><td><code>?archived</code></td><td>boolean</td><td>Filter by archive state</td></tr>
          <tr><td><code>?limit</code></td><td>number</td><td>Max items to return</td></tr>
        </tbody>
      </table>

      <h3>POST /inbox/:id/read</h3>
      <p>Mark an inbox item as read. Returns the updated item or 403 if it belongs to another user.</p>

      <h3>POST /inbox/read-all</h3>
      <p>Mark all inbox items as read. Returns <code>{`{ count }`}</code>.</p>

      <h3>POST /inbox/:id/archive</h3>
      <p>Archive an inbox item.</p>

      <h3>POST /inbox/:id/unarchive</h3>
      <p>Unarchive an inbox item.</p>

      <h3>DELETE /inbox/:id</h3>
      <p>Delete an inbox item permanently.</p>

      <h2>Preference routes</h2>

      <h3>GET /preferences</h3>
      <p>List all preferences for the authenticated user.</p>

      <h3>POST /preferences</h3>
      <p>Update a preference.</p>
      <Code
        code={`// Request body:
{
  "notificationId": "comment_mentioned",
  "channels": { "email": false }
}`}
      />

      <h2>Notification metadata</h2>

      <h3>GET /notifications</h3>
      <p>
        List registered notification definitions (id, channels, payload schema,
        category, description). Public by default. Set{" "}
        <code>protectNotifications: true</code> to require auth.
      </p>

      <h2>Delivery routes</h2>

      <h3>GET /deliveries</h3>
      <p>
        List delivery records. Requires <code>deliveries.list</code>{" "}
        permission or admin role. Non-admin users can only see their own
        records. Sensitive fields (body, subject, to) are redacted.
      </p>

      <h2>Unsubscribe routes</h2>

      <h3>GET /unsubscribe?token=...</h3>
      <p>
        Human click from email footer. Verifies HMAC token and renders an
        HTML confirmation page. Flips{" "}
        <code>preferences.channels.email = false</code> for the bound
        (recipientId, notificationId) pair.
      </p>

      <h3>POST /unsubscribe</h3>
      <p>
        RFC 8058 one-click unsubscribe. Accepts token via query param, form
        body, or JSON body. Returns a 200 HTML confirmation.
      </p>

      <h2>Realtime (SSE)</h2>

      <h3>GET /events</h3>
      <p>
        Server-Sent Events stream for the authenticated user. Streams inbox
        mutations in real time. The React client connects here automatically.
      </p>

      <h2>Webhook routes</h2>

      <h3>POST /webhooks/:provider</h3>
      <p>
        Inbound webhook from email providers (delivery status updates,
        bounces, opens, clicks). Each provider is verified by the configured
        verifier function. Returns 401 for invalid signatures, 404 for
        unknown providers.
      </p>

      <h2>CORS</h2>
      <p>
        All routes respond to <code>OPTIONS</code> with the configured CORS
        headers when the <code>cors</code> option is set.
      </p>

      <h2>Rate limiting</h2>
      <p>
        When <code>requestRateLimit</code> is configured, authenticated
        routes enforce a per-identity sliding window. Exceeding the limit
        returns <code>429 Too Many Requests</code>.
      </p>

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

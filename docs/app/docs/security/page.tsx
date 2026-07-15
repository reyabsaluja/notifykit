import type { Metadata } from "next";
import Link from "next/link";
import { Code } from "../../_components/code";

export const metadata: Metadata = { title: "Security model" };

export default function SecurityPage() {
  return (
    <article>
      <h1>Security model</h1>
      <p>
        NotifyKit separates <strong>server-only</strong> APIs (called from
        trusted application code) from <strong>client-safe</strong> handler
        routes (exposed to browsers). This page documents the full security
        contract.
      </p>

      <div className="features">
        <div className="feature-card">
          <h3>Server (trusted)</h3>
          <p><code>notify.send()</code>, <code>notify.explain()</code>, <code>notify.deliveries.list()</code> — full access. Caller provides <code>recipientId</code> directly.</p>
        </div>
        <div className="feature-card">
          <h3>Client (untrusted)</h3>
          <p>React SDK and REST routes — identity resolved via <code>identify()</code>. Cannot specify <code>recipientId</code>. Scoped to the authenticated user.</p>
        </div>
      </div>

      <div className="features">
        <div className="feature-card">
          <h3>Tenant isolation</h3>
          <p>Every query is scoped by identity. Cross-tenant reads return empty, writes return 403.</p>
        </div>
        <div className="feature-card">
          <h3>Webhook signatures</h3>
          <p>HMAC-SHA256 on outgoing webhooks, timing-safe verification on incoming ones.</p>
        </div>
        <div className="feature-card">
          <h3>Payload redaction</h3>
          <p>PII fields are masked in logs, hooks, and timeline — never leaked to external surfaces.</p>
        </div>
        <div className="feature-card">
          <h3>Unsubscribe HMAC</h3>
          <p>Signed links that work without auth sessions. Bound to recipient, unforgeable, no expiry.</p>
        </div>
        <div className="feature-card">
          <h3>Rate limiting &amp; CORS</h3>
          <p>Per-identity request caps and origin restrictions prevent abuse from untrusted clients.</p>
        </div>
        <div className="feature-card">
          <h3>Secret rotation</h3>
          <p>Dual-secret pattern for zero-downtime key rotation without breaking outstanding links.</p>
        </div>
      </div>

      <h2>Client-safe routes</h2>
      <p>
        Browser clients <strong>never</strong> pass{" "}
        <code>recipientId</code>. Every client-facing route resolves the
        current user through your <code>identify()</code> callback. Any{" "}
        <code>recipientId</code>, <code>tenantId</code>, or{" "}
        <code>workspaceId</code> in the request body is <strong>ignored</strong>.
      </p>
      <Code
        filename="app/api/notifykit/[...notifykit]/route.ts"
        code={`createHandler(notify, {
  identify: async (request) => {
    const session = await auth(request)
    if (!session) return null // → 401

    return {
      recipientId: session.user.id,
      tenantId: session.orgId,
      workspaceId: session.workspaceId,
    }
  },
})`}
      />

      <h2>Tenant &amp; workspace isolation</h2>
      <p>
        When <code>identify()</code> returns a scope, NotifyKit applies it to
        every database query in the request. Cross-tenant reads and writes
        return <code>403 Forbidden</code> or filter to an empty set.
      </p>
      <table>
        <thead>
          <tr><th>Surface</th><th>Isolation</th><th>Cross-tenant attempt</th></tr>
        </thead>
        <tbody>
          <tr><td>Inbox reads &amp; mutations</td><td>Scoped by tenantId</td><td>403 or empty set</td></tr>
          <tr><td>Preference reads &amp; writes</td><td>Scoped by tenantId</td><td>403 or empty set</td></tr>
          <tr><td>Delivery logs</td><td>Scoped by tenantId</td><td>Filtered to empty</td></tr>
          <tr><td>Realtime SSE events</td><td>Scoped by tenantId</td><td>Never receives foreign events</td></tr>
          <tr><td>Unsubscribe links</td><td>Bound to (recipient, tenant)</td><td>HMAC fails → 401</td></tr>
        </tbody>
      </table>

      <h3>How isolation is enforced</h3>
      <div className="overview-flow">
        <div className="overview-flow-step">
          <span className="overview-flow-number">1</span>
          <div>
            <strong>identify() returns scope</strong>
            <p>Your function extracts <code>recipientId</code> + <code>tenantId</code> from the request&apos;s session.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">2</span>
          <div>
            <strong>Handler injects WHERE clauses</strong>
            <p>Every DB query appends <code>WHERE tenant_id = :tenantId AND recipient_id = :recipientId</code>. Not optional — you can&apos;t skip this.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">3</span>
          <div>
            <strong>Mutations verify ownership</strong>
            <p>Mark-read, archive, delete check the item belongs to this (recipient, tenant) pair. Mismatches → 403.</p>
          </div>
        </div>
      </div>
      <div className="callout callout-tip">
        <strong>Isolation is structural, not advisory.</strong> There is no
        API parameter or configuration that disables tenant scoping once{" "}
        <code>identify()</code> returns a <code>tenantId</code>. Even if client
        code sends a forged <code>tenantId</code> in the request body, it is
        ignored — the server-resolved value always wins.
      </div>

      <h2>Authorization</h2>
      <p>
        Some routes require explicit permission. Configure with{" "}
        <code>authorize</code> or return a <code>permissions</code> array
        from <code>identify()</code>:
      </p>
      <Code
        code={`createHandler(notify, {
  identify: async (request) => {
    const session = await auth(request)
    if (!session) return null
    return {
      recipientId: session.user.id,
      tenantId: session.orgId,
      permissions: session.role === "admin" ? ["admin"] : [],
    }
  },
  // Or use the authorize hook for dynamic checks:
  authorize: async (ctx, permission) => {
    if (permission === "deliveries.list") {
      return ctx.identity.permissions?.includes("admin") ?? false
    }
    return false
  },
})`}
      />

      <h3>Permission checks by route</h3>
      <p>
        Not all routes check <code>authorize</code>. Most are scoped by
        identity alone (only your own data). These routes pass a permission
        string to <code>authorize()</code>:
      </p>
      <table>
        <thead>
          <tr><th>Route</th><th>Permission</th><th>Default if no <code>authorize</code></th></tr>
        </thead>
        <tbody>
          <tr><td><code>GET /deliveries</code></td><td><code>&quot;deliveries.list&quot;</code></td><td>Denied unless identity permissions include <code>deliveries.list</code> or <code>admin</code></td></tr>
        </tbody>
      </table>
      <div className="callout callout-tip">
        <strong>Most routes don&apos;t need authorize.</strong> Inbox, preferences,
        and realtime routes are automatically scoped to the authenticated user
        by <code>identify()</code>. You only need <code>authorize</code> for
        access to delivery records. To hide notification metadata from
        unauthenticated users, set <code>protectNotifications: true</code>;
        that route then requires a valid identity but does not call{" "}
        <code>authorize()</code>.
      </div>

      <h2>Delivery record redaction</h2>
      <p>
        The <code>GET /deliveries</code> handler strips sensitive fields
        (body, subject, to) before returning records. Server-side{" "}
        <code>notify.deliveries.list()</code> returns full records because
        it runs in trusted code.
      </p>

      <h2>Payload field redaction</h2>
      <p>
        Notification definitions can declare sensitive fields that get masked
        in logs and external surfaces:
      </p>
      <Code
        code={`notification({
  id: "password_changed",
  payload: { email: "string", ip: "string" },
  channels: [inbox({ title: "Password changed from {{ip}}" })],
  redact: ["email", "ip"],
})

// In hooks, timeline, and delivery logs:
// { email: "[REDACTED]", ip: "[REDACTED]" }`}
      />

      <h2>Unsubscribe link security</h2>
      <p>
        Unsubscribe links live in emails that get forwarded, cached, and
        indexed. They must be unforgeable but work without a login session.
      </p>
      <table>
        <thead>
          <tr><th>Property</th><th>Why</th></tr>
        </thead>
        <tbody>
          <tr><td>HMAC-SHA256, timing-safe compare</td><td>Prevents brute-force token forgery and timing side-channels</td></tr>
          <tr><td>Bound to (recipientId, notificationId, tenantId)</td><td>Can&apos;t reuse one user&apos;s link to unsubscribe another</td></tr>
          <tr><td>Bypasses <code>identify()</code></td><td>Works from email clients without a session — the signature is the auth</td></tr>
          <tr><td>No expiry</td><td>RFC 8058 requires links to remain valid indefinitely</td></tr>
          <tr><td>Rotate <code>unsubscribe.secret</code> to revoke</td><td>Invalidates all outstanding links if the key is compromised</td></tr>
        </tbody>
      </table>

      <h2>Webhook signatures</h2>
      <p>
        NotifyKit signs outgoing webhooks and verifies incoming provider
        webhooks. Both prevent forged requests from being processed.
      </p>

      <h3>Outgoing: signing your webhook deliveries</h3>
      <p>
        When you configure a webhook channel with a signing secret, every
        outgoing request includes an <code>x-notifykit-signature</code> header:
      </p>
      <Code
        code={`// In your notification definition:
channel.webhook({
  url: "https://your-service.com/hooks/notify",
  secret: process.env.WEBHOOK_SECRET, // enables signing
})

// The outgoing request includes:
// x-notifykit-signature: sha256=<hex-encoded HMAC-SHA256 of the body>`}
      />

      <h3>Verifying on the receiving end</h3>
      <p>
        Your webhook receiver must verify the signature before processing
        the payload. Reject any request with an invalid or missing signature:
      </p>
      <Code
        filename="lib/verify-webhook.ts"
        code={`import { createHmac, timingSafeEqual } from "crypto"

function verifyWebhookSignature(
  body: string,
  signatureHeader: string | null,
  secret: string
): boolean {
  if (!signatureHeader) return false

  const expected = "sha256=" + createHmac("sha256", secret)
    .update(body)
    .digest("hex")

  // Timing-safe compare prevents timing side-channel attacks
  if (expected.length !== signatureHeader.length) return false
  return timingSafeEqual(
    Buffer.from(expected),
    Buffer.from(signatureHeader)
  )
}

// Example: Express/Hono/Next.js API route
export async function POST(request: Request) {
  const body = await request.text()
  const signature = request.headers.get("x-notifykit-signature")

  if (!verifyWebhookSignature(body, signature, process.env.WEBHOOK_SECRET!)) {
    return new Response("Invalid signature", { status: 401 })
  }

  const payload = JSON.parse(body)
  // Safe to process — signature verified
  await handleNotification(payload)
  return new Response("OK", { status: 200 })
}`}
      />
      <table>
        <thead>
          <tr><th>Verification step</th><th>Why</th><th>Without it</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Check header exists</strong></td>
            <td>Missing header means unsigned — could be a forged request</td>
            <td>Attacker can POST any payload to your endpoint</td>
          </tr>
          <tr>
            <td><strong>Compute expected HMAC</strong></td>
            <td>Hash the raw body with your shared secret</td>
            <td>Can&apos;t distinguish real from forged requests</td>
          </tr>
          <tr>
            <td><strong>Timing-safe compare</strong></td>
            <td>Constant-time comparison prevents leaking valid characters</td>
            <td>Attacker brute-forces signature byte-by-byte via timing</td>
          </tr>
          <tr>
            <td><strong>Use raw body (not parsed)</strong></td>
            <td>JSON.parse/stringify can reorder keys, breaking the hash</td>
            <td>Signature fails on valid requests (false negative)</td>
          </tr>
        </tbody>
      </table>
      <div className="callout callout-warn">
        <strong>Always verify against the raw body string.</strong> Don&apos;t
        call <code>JSON.parse(body)</code> then <code>JSON.stringify()</code> to
        recreate it — JSON serialization doesn&apos;t guarantee key order. Read
        the body as text first, verify the signature, then parse.
      </div>

      <h3>Incoming: verifying provider webhooks</h3>
      <p>
        Provider webhooks (delivery status updates, bounces) are verified by
        a function you pass to the handler. NotifyKit rejects requests where
        verification fails with a <code>401</code>:
      </p>
      <Code
        code={`createRouteHandler({
  notifykit: notify,
  identify: getIdentity,
  webhooks: {
    resend: (headers, body) => {
      // Verify using provider's signing mechanism
      const signature = headers.get("svix-signature")
      return verifyResendWebhook(body, signature, process.env.RESEND_WEBHOOK_SECRET!)
    },
  },
  onWebhookEvent: async (provider, payload) => {
    // Process verified webhook (delivery status, bounces, opens)
    if (payload.type === "email.bounced") {
      await deactivateRecipientEmail(payload.data.to)
    }
  },
})`}
      />

      <h2>Client SDK</h2>
      <div className="callout callout-warn">
        <strong>Key invariant.</strong> The React client SDK does <strong>not</strong>{" "}
        accept <code>recipientId</code> on any method. All operations rely on the
        server handler to resolve the user. It is impossible for client code to
        read or modify another user&apos;s data — even if the browser&apos;s
        network requests are tampered with.
      </div>

      <h2>Rate limiting &amp; CORS</h2>
      <Code
        code={`createHandler(notify, {
  identify: getIdentity,
  requestRateLimit: {
    max: 60,          // per identity
    windowMs: 60_000, // sliding window
  },
  cors: "https://app.example.com", // or string[]
})`}
      />
      <table>
        <thead>
          <tr><th>Option</th><th>Protects against</th><th>Note</th></tr>
        </thead>
        <tbody>
          <tr><td><code>requestRateLimit</code></td><td>Abusive clients hammering endpoints</td><td>Per-identity. Returns 429. Doesn&apos;t cover unauthenticated routes.</td></tr>
          <tr><td><code>cors</code></td><td>Cross-origin request forgery</td><td>Set to your app&apos;s origin. Accepts string or string[].</td></tr>
        </tbody>
      </table>

      <h2>Security checklist</h2>
      <p>
        Prioritized by impact. Complete the &quot;before launch&quot; items
        before deploying to real users. The &quot;harden later&quot; items
        reduce attack surface but aren&apos;t blockers for launch.
      </p>

      <div className="callout callout-warn">
        <strong>Before launch — blocking:</strong>
      </div>
      <table>
        <thead>
          <tr><th>Item</th><th>Action</th><th>Risk if skipped</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><code>NOTIFYKIT_SECRET</code></td>
            <td>32+ byte random hex, stored in secrets manager. Never in git.</td>
            <td>Attackers forge unsubscribe links → mass opt-out of real users</td>
          </tr>
          <tr>
            <td><code>identify() → null</code></td>
            <td>Return <code>null</code> (not a default user) for unauthenticated requests</td>
            <td>Anyone can read any inbox and change any preferences without auth</td>
          </tr>
          <tr>
            <td>Tenant scoping</td>
            <td>Always return <code>tenantId</code> from <code>identify()</code> if multi-tenant</td>
            <td>Cross-org data leaks — Org A sees Org B&apos;s notifications</td>
          </tr>
          <tr>
            <td>CORS origin</td>
            <td>Set to your app&apos;s domain. Never <code>&quot;*&quot;</code> in production</td>
            <td>Malicious sites make authenticated requests using your users&apos; cookies</td>
          </tr>
        </tbody>
      </table>

      <div className="callout callout-tip">
        <strong>Harden after launch — defense in depth:</strong>
      </div>
      <table>
        <thead>
          <tr><th>Item</th><th>Action</th><th>What it prevents</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>Request rate limiting</td>
            <td>Set <code>requestRateLimit</code> on the handler (e.g. 60/min)</td>
            <td>Abusive scripts hammering your DB with rapid inbox polls</td>
          </tr>
          <tr>
            <td>IP-based rate limiting</td>
            <td>Add at your reverse proxy for <code>/unsubscribe</code></td>
            <td>Brute-force token enumeration on the unauthenticated route</td>
          </tr>
          <tr>
            <td><code>redact</code> PII fields</td>
            <td>Mark emails, IPs, names in notification definitions</td>
            <td>PII exposure in logs, timeline, and hook payloads</td>
          </tr>
          <tr>
            <td>Webhook signing</td>
            <td>Set a secret on webhook channels; verify on the receiving end</td>
            <td>Forged webhook deliveries triggering actions in downstream services</td>
          </tr>
          <tr>
            <td><code>protectNotifications</code></td>
            <td>Set to <code>true</code> to require auth for <code>GET /notifications</code></td>
            <td>Unauthenticated enumeration of your notification IDs and structure</td>
          </tr>
        </tbody>
      </table>

      <h2>Production-hardened handler</h2>
      <p>
        A complete handler config that applies every security recommendation
        from this page. Copy and adapt to your auth layer:
      </p>
      <Code
        filename="app/api/notifykit/[...notifykit]/route.ts"
        code={`import { createRouteHandler } from "@notifykitjs/next"
import { notify } from "@/lib/notifykit"
import { auth } from "@/lib/auth"

export const { GET, POST, DELETE, OPTIONS, dynamic } = createRouteHandler({
  notifykit: notify,

  // Auth: resolve identity or reject
  identify: async (request) => {
    const session = await auth(request)
    if (!session) return null // → 401

    return {
      recipientId: session.user.id,
      tenantId: session.organizationId,
      workspaceId: session.workspaceId,
      permissions: session.user.role === "admin" ? ["admin"] : [],
    }
  },

  // Admin routes: only admins can list all deliveries
  authorize: async (ctx, permission) => {
    return ctx.identity.permissions?.includes("admin") ?? false
  },

  // Unsubscribe: HMAC-signed links in emails
  unsubscribeSecret: process.env.NOTIFYKIT_SECRET,

  // Rate limiting: 60 requests per minute per identity
  requestRateLimit: {
    max: 60,
    windowMs: 60_000,
  },

  // CORS: only your frontend origin
  cors: process.env.NEXT_PUBLIC_APP_URL!,

  // Notification metadata: require auth to list
  protectNotifications: true,
})`}
      />
      <table>
        <thead>
          <tr><th>Line</th><th>Protects against</th><th>Without it</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><code>identify → null</code></td>
            <td>Unauthenticated access to all user data</td>
            <td>Anyone can read inboxes and change preferences</td>
          </tr>
          <tr>
            <td><code>tenantId</code> in return</td>
            <td>Cross-tenant data leaks</td>
            <td>Org A users see Org B notifications</td>
          </tr>
          <tr>
            <td><code>authorize</code></td>
            <td>Privilege escalation to admin routes</td>
            <td>Regular users can list all delivery records</td>
          </tr>
          <tr>
            <td><code>requestRateLimit</code></td>
            <td>Denial-of-service via rapid polling</td>
            <td>A script can hammer your DB with unlimited inbox reads</td>
          </tr>
          <tr>
            <td><code>cors</code></td>
            <td>Cross-site request forgery</td>
            <td>Malicious sites can make requests using your users&apos; cookies</td>
          </tr>
          <tr>
            <td><code>protectNotifications</code></td>
            <td>Information disclosure of notification IDs</td>
            <td>Unauthenticated users can enumerate your notification types</td>
          </tr>
        </tbody>
      </table>
      <div className="callout callout-warn">
        <strong>This handler alone isn&apos;t enough.</strong> Add IP-based
        rate limiting at your reverse proxy (Vercel, Cloudflare, nginx) for
        the unauthenticated <code>/unsubscribe</code> route.{" "}
        <code>requestRateLimit</code> only protects authenticated endpoints.
      </div>

      <h2>Secret rotation</h2>
      <p>
        Every unsubscribe link ever sent is signed with your{" "}
        <code>NOTIFYKIT_SECRET</code>. If you rotate the secret in one step,
        every outstanding link in every email your users have ever received
        breaks instantly. Use the dual-secret pattern to rotate gracefully:
      </p>

      <div className="overview-flow">
        <div className="overview-flow-step">
          <span className="overview-flow-number">1</span>
          <div>
            <strong>Add new secret alongside old</strong>
            <p>Deploy with both secrets. New links are signed with the new secret. Old links still verify against the old one.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">2</span>
          <div>
            <strong>Wait for old links to expire from inboxes</strong>
            <p>Most email clients surface messages for 30–90 days. Wait at least that long before removing the old secret.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">3</span>
          <div>
            <strong>Remove old secret</strong>
            <p>Once the overlap window passes, remove the old secret. Only the new secret remains.</p>
          </div>
        </div>
      </div>

      <Code
        filename="lib/notifykit.ts"
        code={`import { createNotifyKit } from "@notifykitjs/core"

export const notify = createNotifyKit({
  // ...notifications, database, providers

  unsubscribe: {
    // Primary secret — used for signing NEW links
    secret: process.env.NOTIFYKIT_SECRET!,

    // Previous secret(s) — verified on incoming unsubscribes
    // but never used for signing new links
    previousSecrets: process.env.NOTIFYKIT_SECRET_OLD
      ? [process.env.NOTIFYKIT_SECRET_OLD]
      : [],

    baseUrl: process.env.NEXT_PUBLIC_APP_URL + "/api/notifykit",
  },
})`}
      />

      <table>
        <thead>
          <tr><th>When to rotate</th><th>Urgency</th><th>Overlap window</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Secret leaked in logs or git</strong></td>
            <td>Immediate — rotate today</td>
            <td>Keep old secret for 90 days (links are already in the wild)</td>
          </tr>
          <tr>
            <td><strong>Employee with access left</strong></td>
            <td>Within a week</td>
            <td>Keep old secret for 90 days</td>
          </tr>
          <tr>
            <td><strong>Compliance policy (quarterly rotation)</strong></td>
            <td>Scheduled</td>
            <td>Keep old secret for 90 days, then remove on next rotation</td>
          </tr>
          <tr>
            <td><strong>Suspected active compromise</strong></td>
            <td>Immediate — rotate and remove old</td>
            <td>Zero — accept that old links break. Attacker can&apos;t forge new ones.</td>
          </tr>
        </tbody>
      </table>

      <div className="callout callout-warn">
        <strong>Compromised secret = attacker can forge unsubscribe links.</strong>{" "}
        They can&apos;t read inbox data or send notifications (those require
        server access), but they <em>can</em> unsubscribe any user from any
        notification by crafting a valid token. In an active compromise, remove
        the old secret immediately — broken unsubscribe links are less harmful
        than an attacker silently disabling notifications for your users.
      </div>

      <div className="callout callout-tip">
        <strong>Webhook secrets rotate the same way.</strong> If your webhook
        channel uses a <code>secret</code> for signing, the receiving service
        must accept both old and new signatures during the transition. Coordinate
        the rotation with the team that owns the webhook receiver.
      </div>

      <h2>Testing your security configuration</h2>
      <p>
        Security configuration that isn&apos;t tested in CI will eventually
        regress — someone changes the auth middleware, refactors the handler,
        or updates a dependency. These tests verify the security contract holds
        across deploys.
      </p>
      <table>
        <thead>
          <tr><th>What to test</th><th>Why it matters</th><th>Regression risk</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>Unauthenticated requests get 401</td>
            <td>Ensures <code>identify()</code> rejects missing sessions</td>
            <td>Auth middleware change, cookie format change, missing null check</td>
          </tr>
          <tr>
            <td>Cross-tenant access gets 403 or empty</td>
            <td>Proves data isolation is enforced at the query layer</td>
            <td>Scoping WHERE clause removed during refactor</td>
          </tr>
          <tr>
            <td>Invalid unsubscribe token gets 401</td>
            <td>Confirms HMAC verification rejects forged links</td>
            <td>Secret env var missing in new environment</td>
          </tr>
          <tr>
            <td>Rate limiting returns 429</td>
            <td>Verifies abusive clients are throttled</td>
            <td>Rate limit config removed or misconfigured after handler refactor</td>
          </tr>
        </tbody>
      </table>

      <h3>Pattern: security boundary tests</h3>
      <Code
        filename="tests/security-boundaries.test.ts"
        code={`import { describe, it, expect } from "vitest"
import { createNotifyKit, memoryAdapter, fakeEmailProvider, createHandler } from "@notifykitjs/core"
import { commentMentioned } from "./notifications"

function setup() {
  const notify = createNotifyKit({
    notifications: [commentMentioned] as const,
    database: memoryAdapter(),
    providers: { email: fakeEmailProvider() },
  })
  return notify
}

describe("security boundaries", () => {
  it("rejects unauthenticated requests with 401", async () => {
    const notify = setup()
    const handler = createHandler(notify, {
      identify: async () => null, // no session
    })

    const res = await handler(new Request("http://localhost/api/notifykit/inbox"))
    expect(res.status).toBe(401)

    const body = await res.json()
    expect(body.code).toBe("UNAUTHENTICATED")
  })

  it("rejects cross-tenant inbox access", async () => {
    const notify = setup()
    await notify.upsertRecipient({ id: "alice", tenantId: "org_a", email: "a@test.com" })
    await notify.send({
      recipientId: "alice",
      tenantId: "org_a",
      notificationId: "comment_mentioned",
      payload: { actorName: "Rey", postUrl: "/p/1" },
    })

    // Handler scoped to org_b — should NOT see org_a's items
    const handler = createHandler(notify, {
      identify: async () => ({ recipientId: "alice", tenantId: "org_b" }),
    })

    const res = await handler(new Request("http://localhost/api/notifykit/inbox"))
    const { data: items } = await res.json()
    expect(items).toHaveLength(0) // ✓ isolated
  })

  it("prevents preference writes to another tenant", async () => {
    const notify = setup()
    await notify.upsertRecipient({ id: "alice", tenantId: "org_a", email: "a@test.com" })

    // Handler scoped to org_b tries to write preferences for org_a
    const handler = createHandler(notify, {
      identify: async () => ({ recipientId: "alice", tenantId: "org_b" }),
    })

    const res = await handler(new Request("http://localhost/api/notifykit/preferences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        notificationId: "comment_mentioned",
        channels: { email: false },
      }),
    }))

    // Preference is written to org_b scope (the handler's scope), NOT org_a
    // Verify org_a's preferences are untouched
    const prefs = await notify.preferences.list("alice", { tenantId: "org_a" })
    expect(prefs).toHaveLength(0)
  })

  it("rejects forged unsubscribe tokens", async () => {
    const notify = setup()
    const handler = createHandler(notify, {
      identify: async () => ({ recipientId: "alice" }),
      unsubscribeSecret: "real-secret-32-bytes-long-here!!",
    })

    // Forged token
    const res = await handler(new Request(
      "http://localhost/api/notifykit/unsubscribe?token=forged_token_value"
    ))
    expect(res.status).toBe(400)
  })

  it("enforces rate limiting with 429", async () => {
    const notify = setup()
    await notify.upsertRecipient({ id: "alice", email: "a@test.com" })

    const handler = createHandler(notify, {
      identify: async () => ({ recipientId: "alice" }),
      requestRateLimit: { max: 3, windowMs: 60_000 },
    })

    // Fire requests up to the limit
    for (let i = 0; i < 3; i++) {
      const res = await handler(new Request("http://localhost/api/notifykit/inbox"))
      expect(res.status).toBe(200)
    }

    // Next request should be rate-limited
    const blocked = await handler(new Request("http://localhost/api/notifykit/inbox"))
    expect(blocked.status).toBe(429)
    expect(blocked.headers.get("Retry-After")).toBeDefined()
  })
})`}
      />

      <h3>Testing authorization levels</h3>
      <p>
        If you use <code>authorize()</code> for admin routes, verify that
        non-admin users get <code>403</code> while admins pass through:
      </p>
      <Code
        filename="tests/authorization.test.ts"
        code={`describe("authorization", () => {
  function handlerWithRole(role: "user" | "admin") {
    return createHandler(notify, {
      identify: async () => ({
        recipientId: "alice",
        permissions: role === "admin" ? ["admin"] : [],
      }),
      authorize: async (ctx, permission) => {
        if (permission === "deliveries.list") {
          return ctx.identity.permissions?.includes("admin") ?? false
        }
        return true
      },
    })
  }

  it("admin can list deliveries", async () => {
    const handler = handlerWithRole("admin")
    const res = await handler(new Request("http://localhost/api/notifykit/deliveries"))
    expect(res.status).toBe(200)
  })

  it("regular user cannot list deliveries", async () => {
    const handler = handlerWithRole("user")
    const res = await handler(new Request("http://localhost/api/notifykit/deliveries"))
    expect(res.status).toBe(403)
  })

  it("regular user can still access their own inbox", async () => {
    const handler = handlerWithRole("user")
    const res = await handler(new Request("http://localhost/api/notifykit/inbox"))
    expect(res.status).toBe(200)
  })
})`}
      />
      <table>
        <thead>
          <tr><th>Test category</th><th>Catches</th><th>Run frequency</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Auth boundary (401)</strong></td>
            <td>identify() returning a user when it shouldn&apos;t</td>
            <td>Every CI run — fast, no external deps</td>
          </tr>
          <tr>
            <td><strong>Tenant isolation (403/empty)</strong></td>
            <td>Missing WHERE clauses, unscoped queries</td>
            <td>Every CI run — most critical for multi-tenant apps</td>
          </tr>
          <tr>
            <td><strong>Token verification</strong></td>
            <td>Broken HMAC, missing secret in env, timing vulnerabilities</td>
            <td>Every CI run — tests the crypto path</td>
          </tr>
          <tr>
            <td><strong>Rate limiting</strong></td>
            <td>Rate limit config removed or max set too high</td>
            <td>Every CI run — verifies the sliding window logic</td>
          </tr>
          <tr>
            <td><strong>Authorization (admin routes)</strong></td>
            <td>Permission checks bypassed, authorize() not wired up</td>
            <td>Every CI run — prevents privilege escalation</td>
          </tr>
        </tbody>
      </table>
      <div className="callout callout-tip">
        <strong>Run these on every PR.</strong> Security tests are fast
        (in-memory adapter, no network) and catch regressions that functional
        tests miss — a refactored handler that works correctly but forgot to
        check <code>identify()</code> passes all feature tests while being
        wide open.
      </div>

      <div className="callout callout-warn">
        <strong>Test the negative case, not just the positive.</strong> A test
        that verifies &quot;admin can list deliveries&quot; passes even if
        everyone can list deliveries. Always pair it with &quot;non-admin
        <em>cannot</em> list deliveries&quot; — the denial test is what proves
        the guard exists.
      </div>

      <div className="button-row">
        <Link href="/docs/handler-routes" className="primary">Handler routes setup</Link>
        <Link href="/docs/multi-tenancy">Multi-tenancy</Link>
        <Link href="/docs/preferences">Unsubscribe links</Link>
      </div>

      <div className="page-nav">
        <Link href="/docs/multi-tenancy">
          <span className="page-nav-label">Previous</span>
          <span className="page-nav-title">Multi-tenancy</span>
        </Link>
        <Link href="/docs/explain">
          <span className="page-nav-label">Next</span>
          <span className="page-nav-title">Explain & dry run</span>
        </Link>
      </div>
    </article>
  );
}

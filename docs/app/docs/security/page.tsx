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

      <h2>Client-safe routes</h2>
      <p>
        Browser clients <strong>never</strong> pass{" "}
        <code>recipientId</code>. Every client-facing route resolves the
        current user through your <code>identify()</code> callback. Any{" "}
        <code>recipientId</code>, <code>tenantId</code>, or{" "}
        <code>workspaceId</code> in the request body is <strong>ignored</strong>.
      </p>
      <Code
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
      <ul>
        <li>Inbox reads and mutations — scoped</li>
        <li>Preference reads and writes — scoped</li>
        <li>Delivery logs — scoped</li>
        <li>Realtime events — scoped (only receive events for your scope)</li>
      </ul>

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
      return ctx.permissions?.includes("admin") ?? false
    }
    return false
  },
})`}
      />

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
      <ul>
        <li>HMAC-SHA256 signed, timing-safe compare</li>
        <li>Bound to (recipientId, notificationId, tenantId) — can&apos;t reuse across users</li>
        <li>Bypasses <code>identify()</code> — the signature is the auth</li>
        <li>No expiry (RFC 8058 requirement)</li>
        <li>Rotate <code>unsubscribe.secret</code> to invalidate all links if compromised</li>
      </ul>

      <h2>Webhook signatures</h2>
      <p>
        Outgoing: <code>x-notifykit-signature: sha256=&lt;hex&gt;</code> header
        on every webhook delivery (when a secret is configured).
      </p>
      <p>
        Incoming: provider webhooks are verified by the configured verifier
        function before processing.
      </p>

      <h2>Client SDK</h2>
      <p>
        The React client SDK does <strong>not</strong> accept{" "}
        <code>recipientId</code> on any method. All operations rely on the
        server handler to resolve the user. This makes it impossible for
        client code to read or modify another user&apos;s data.
      </p>

      <h2>Request rate limiting</h2>
      <Code
        code={`createHandler(notify, {
  identify: getIdentity,
  requestRateLimit: {
    max: 60,          // per identity
    windowMs: 60_000, // sliding window
  },
})`}
      />
      <p>
        Returns <code>429 Too Many Requests</code> when exceeded.
        Unauthenticated routes (notifications, unsubscribe) are not throttled
        — apply IP-based rate limiting at your reverse proxy.
      </p>

      <h2>CORS</h2>
      <Code
        code={`createHandler(notify, {
  identify: getIdentity,
  cors: "https://app.example.com", // or string[]
})`}
      />

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

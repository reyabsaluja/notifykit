import type { Metadata } from "next";
import Link from "next/link";

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

      <h2 id="client-safe-routes">Client-safe routes</h2>
      <p>
        Browser clients <strong>never</strong> pass{" "}
        <code>recipientId</code>. Every client-facing route resolves the
        current user through your <code>identify()</code> callback. Any{" "}
        <code>recipientId</code>, <code>tenantId</code>, or{" "}
        <code>workspaceId</code> included in the request body is{" "}
        <strong>ignored</strong>.
      </p>
      <pre>
        <code>{`createHandler(notify, {
  identify: async (request) => {
    const session = await auth(request)
    if (!session) return null          // → 401

    return {
      recipientId: session.user.id,    // bound to every route
      tenantId: session.orgId,         // scopes reads & writes
      workspaceId: session.workspaceId,
    }
  },
})`}</code>
      </pre>

      <h3>Route summary</h3>
      <table>
        <thead>
          <tr>
            <th>Route</th>
            <th>Auth</th>
            <th>Scoped by</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <code>GET /inbox</code>
            </td>
            <td>
              <code>identify()</code>
            </td>
            <td>recipientId + tenant/workspace</td>
          </tr>
          <tr>
            <td>
              <code>POST /inbox/:id/read</code>
            </td>
            <td>
              <code>identify()</code>
            </td>
            <td>
              recipientId + tenant/workspace (returns <code>403</code> for
              another user&rsquo;s or tenant&rsquo;s item)
            </td>
          </tr>
          <tr>
            <td>
              <code>GET /preferences</code>
            </td>
            <td>
              <code>identify()</code>
            </td>
            <td>recipientId + tenant/workspace</td>
          </tr>
          <tr>
            <td>
              <code>POST /preferences</code>
            </td>
            <td>
              <code>identify()</code>
            </td>
            <td>recipientId + tenant/workspace (ignores body ids)</td>
          </tr>
          <tr>
            <td>
              <code>GET /deliveries</code>
            </td>
            <td>
              <code>identify()</code> + permission
            </td>
            <td>
              recipientId (own only) + tenant/workspace; admin can query others;
              sensitive fields redacted
            </td>
          </tr>
          <tr>
            <td>
              <code>GET /notifications</code>
            </td>
            <td>None (public metadata)</td>
            <td>&mdash;</td>
          </tr>
          <tr>
            <td>
              <code>GET|POST /unsubscribe</code>
            </td>
            <td>HMAC token</td>
            <td>Embedded in signed token</td>
          </tr>
          <tr>
            <td>
              <code>POST /webhooks/:provider</code>
            </td>
            <td>Provider signature verifier</td>
            <td>&mdash; (provider-scoped)</td>
          </tr>
        </tbody>
      </table>

      <h2 id="tenant-workspace-isolation">Tenant &amp; workspace isolation</h2>
      <p>
        When <code>identify()</code> returns a <code>tenantId</code> or{" "}
        <code>workspaceId</code>, NotifyKit applies that scope to every
        database query in the request. Inbox reads, inbox mutations,
        preference reads/writes, and delivery logs are all filtered by the
        authenticated scope. Cross-tenant reads and writes return{" "}
        <code>403 Forbidden</code> or filter to an empty set.
      </p>

      <h2 id="server-admin-routes">Server and admin routes</h2>
      <p>
        Server-side calls such as <code>notify.send()</code>,{" "}
        <code>notify.deliveries.list()</code>, and{" "}
        <code>notify.inbox.markRead()</code> may pass explicit recipient and
        scope ids because they run in trusted code.
      </p>
      <p>
        Handler routes that expose operational data (currently{" "}
        <code>deliveries.list</code>) require explicit permission:
      </p>
      <pre>
        <code>{`createHandler(notify, {
  identify: getIdentity,
  authorize: async (ctx, permission) => {
    if (permission === "deliveries.list") {
      return await canViewNotificationLogs(ctx.recipientId, ctx.tenantId)
    }
    return false
  },
})`}</code>
      </pre>
      <p>
        Without <code>authorize</code>, an identity can still opt in by
        returning <code>permissions: [&quot;deliveries.list&quot;]</code> or{" "}
        <code>permissions: [&quot;admin&quot;]</code> from{" "}
        <code>identify()</code>. When the <code>authorize</code> hook is set,
        it takes precedence over the <code>permissions</code> array.
      </p>

      <h2 id="delivery-redaction">Delivery record redaction</h2>
      <p>
        The <code>GET /deliveries</code> handler redacts sensitive fields from
        delivery records before returning them. The <code>body</code> (email
        content, which may contain unsubscribe tokens), <code>subject</code>,
        and <code>to</code> (email addresses or webhook URLs) fields are
        stripped. Server-side <code>notify.deliveries.list()</code> returns
        full records because it runs in trusted code.
      </p>

      <h2 id="payload-redaction">Payload field redaction</h2>
      <p>
        Notification definitions can declare a <code>redact</code> array listing
        payload field names that contain sensitive data (PII, secrets, tokens).
        Use <code>notify.redactPayload(notificationId, payload)</code> to
        produce a copy with those fields replaced by{" "}
        <code>&quot;[REDACTED]&quot;</code>. This is intended for delivery logs,
        timeline views, studio surfaces, and analytics — the full payload is
        still stored on the notification record for server-side rendering.
      </p>
      <pre>
        <code>{`notification({
  id: "password_changed",
  payload: { email: "string", ip: "string" },
  channels: [inbox({ title: "Password changed from {{ip}}" })],
  redact: ["email", "ip"],  // ← fields to mask in logs
})`}</code>
      </pre>

      <h2 id="unsubscribe-links">Unsubscribe links</h2>
      <p>
        Unsubscribe links are HMAC-SHA256 signed tokens that bind a recipient,
        notification, and tenant/workspace scope. The route bypasses{" "}
        <code>identify()</code> because the cryptographic signature serves as
        authorization. Tokens use timing-safe comparison and cannot be forged
        without the secret.
      </p>
      <p>
        <strong>No expiry by design.</strong> Per RFC 8058, email unsubscribe
        links must continue to work indefinitely. This means a leaked token
        permanently grants the ability to toggle email preferences for the
        bound recipient + notification pair. Rotate the{" "}
        <code>unsubscribe.secret</code> if you believe tokens have been
        compromised — this invalidates all existing links.
      </p>
      <ul>
        <li>
          <strong>GET</strong>: Renders an HTML confirmation page.
        </li>
        <li>
          <strong>POST</strong>: RFC 8058 one-click unsubscribe. Accepts query
          param, form body, or JSON body.
        </li>
      </ul>

      <h2 id="webhook-verification">Webhook provider signatures</h2>
      <p>
        When a <code>secret</code> is configured on the webhook provider, every
        outgoing webhook request includes an{" "}
        <code>x-notifykit-signature: sha256=&lt;hex&gt;</code> header computed
        over the JSON body. Recipients can verify this signature to confirm the
        request originated from NotifyKit.
      </p>

      <h2 id="client-sdk">Client SDK</h2>
      <p>
        The React client SDK (<code>createNotifyKitClient</code>) does{" "}
        <strong>not</strong> accept <code>recipientId</code> on any method.
        Inbox and preference operations rely entirely on the server handler to
        resolve the user via <code>identify()</code>. This makes it impossible
        for client code to read or modify another user&rsquo;s data.
      </p>

      <h2 id="notifications-visibility">Notification metadata visibility</h2>
      <p>
        By default, <code>GET /notifications</code> is public — it returns
        notification IDs, channels, and payload schemas without authentication.
        If your notification IDs or categories are sensitive, set{" "}
        <code>protectNotifications: true</code> to require{" "}
        <code>identify()</code> for this route:
      </p>
      <pre>
        <code>{`createHandler(notify, {
  identify: getIdentity,
  protectNotifications: true,  // now requires auth
})`}</code>
      </pre>

      <h2 id="cors">CORS</h2>
      <p>
        When the handler is served from a different origin than the client app,
        set the <code>cors</code> option to include the appropriate{" "}
        <code>Access-Control-Allow-Origin</code> headers on every response:
      </p>
      <pre>
        <code>{`createHandler(notify, {
  identify: getIdentity,
  cors: "https://app.example.com",
})`}</code>
      </pre>

      <h2 id="rate-limiting">Rate limiting</h2>
      <p>
        NotifyKit&rsquo;s built-in <code>rateLimit</code> controls the rate at
        which <em>notifications are sent</em>. For request-level throttling on
        handler routes, use the <code>requestRateLimit</code> option:
      </p>
      <pre>
        <code>{`createHandler(notify, {
  identify: getIdentity,
  requestRateLimit: {
    max: 60,        // max requests per window per identity
    windowMs: 60_000, // sliding window in ms
  },
})`}</code>
      </pre>
      <p>
        Each authenticated <code>recipientId</code> gets an independent
        sliding-window counter. When the limit is exceeded, the handler returns{" "}
        <code>429 Too Many Requests</code>. Unauthenticated routes (
        <code>/notifications</code>, <code>/unsubscribe</code>) are not
        throttled by this mechanism &mdash; apply IP-based rate limiting at your
        reverse proxy or API gateway for those.
      </p>

      <h2 id="deliveries-admin-scoping">Delivery log scoping</h2>
      <p>
        Non-admin users with the <code>deliveries.list</code> permission can
        only see their own delivery records. The{" "}
        <code>?recipientId=</code> query parameter is ignored for non-admin
        callers. Only identities with <code>permissions: [&quot;admin&quot;]</code>{" "}
        can query other recipients&rsquo; deliveries within the same
        tenant/workspace scope.
      </p>

      <h2 id="inbound-webhooks">Inbound provider webhooks</h2>
      <p>
        To receive delivery status callbacks from email providers (e.g. Resend,
        SendGrid), configure the <code>webhooks</code> option with a verifier
        per provider:
      </p>
      <pre>
        <code>{`createHandler(notify, {
  identify: getIdentity,
  webhooks: {
    resend: (headers, rawBody) =>
      verifyResendSignature(headers, rawBody, RESEND_SIGNING_SECRET),
  },
  onWebhookEvent: async (provider, payload) => {
    // Update delivery status, trigger follow-up workflows, etc.
  },
})`}</code>
      </pre>
      <p>
        Each provider gets a <code>POST /webhooks/:provider</code> route. The
        verifier receives the request <code>Headers</code> and raw body string;
        it must return <code>true</code> for authentic requests. Unverified
        requests receive <code>401</code>. Unknown provider names return{" "}
        <code>404</code>. Webhook routes bypass <code>identify()</code> — the
        cryptographic signature serves as authorization.
      </p>

      <p>
        Next: <Link href="/docs/providers">Production providers &rarr;</Link>
      </p>
    </article>
  );
}

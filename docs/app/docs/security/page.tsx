import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Security model" };

export default function SecurityPage() {
  return (
    <article>
      <h1>Security model</h1>
      <p>
        NotifyKit has two API surfaces: server APIs that you call from trusted
        application code, and client-safe handler routes that are always bound
        to the current user returned by <code>identify()</code>.
      </p>

      <h2>Client-safe routes</h2>
      <p>
        Browser clients never pass <code>recipientId</code>. Inbox and
        preference routes resolve the recipient from your session, and any
        <code>recipientId</code>, <code>tenantId</code>, or{" "}
        <code>workspaceId</code> included in the request body is ignored.
      </p>
      <pre>
        <code>{`createHandler(notify, {
  identify: async (request) => {
    const session = await auth(request)
    if (!session) return null

    return {
      recipientId: session.user.id,
      tenantId: session.orgId,
      workspaceId: session.workspaceId,
    }
  },
})`}</code>
      </pre>
      <p>
        When a tenant or workspace id is returned, NotifyKit applies that
        scope to inbox reads, inbox mutations, preferences, delivery logs, and
        unsubscribe preference writes.
      </p>

      <h2>Server and admin routes</h2>
      <p>
        Server-side calls such as <code>notify.send()</code> and{" "}
        <code>notify.deliveries.list()</code> may pass explicit recipient and
        scope ids because they run in trusted code. Handler routes that expose
        operational data require permission.
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
        <code>permissions: [&quot;admin&quot;]</code>.
      </p>

      <h2>Unsubscribe links</h2>
      <p>
        Unsubscribe links are HMAC-signed and include the recipient,
        notification, and tenant/workspace scope. The route bypasses{" "}
        <code>identify()</code> because the signature is the authorization.
      </p>

      <p>
        Next: <Link href="/docs/providers">Production providers →</Link>
      </p>
    </article>
  );
}

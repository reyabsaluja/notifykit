import type { Metadata } from "next";
import Link from "next/link";
import { Code } from "../../_components/code";

export const metadata: Metadata = { title: "Multi-tenancy" };

export default function MultiTenancyPage() {
  return (
    <article>
      <h1>Multi-tenancy</h1>
      <p>
        NotifyKit has first-class support for multi-tenant applications.
        Every operation can be scoped by <code>tenantId</code> (or its alias{" "}
        <code>organizationId</code>) and <code>workspaceId</code>. Data
        isolation is enforced at the framework level — not just by convention.
      </p>

      <h2>Scoping sends</h2>
      <p>
        Pass the tenant/workspace scope with every send:
      </p>
      <Code
        code={`await notify.send({
  recipientId: user.id,
  tenantId: org.id,          // or organizationId: org.id
  workspaceId: workspace.id, // optional
  notificationId: "comment_mentioned",
  payload: { actorName: "Rey", postUrl: "/posts/42" },
})`}
      />
      <p>
        The scope is stored on the notification record, inbox items, and
        delivery rows. All subsequent reads are filtered by it.
      </p>

      <h2>Scoping the handler</h2>
      <p>
        In the client-facing handler, return the scope from{" "}
        <code>identify()</code>:
      </p>
      <Code
        code={`createRouteHandler({
  notifykit: notify,
  identify: async (request) => {
    const session = await auth(request)
    if (!session) return null

    return {
      recipientId: session.user.id,
      tenantId: session.organizationId,
      workspaceId: session.workspaceId,
    }
  },
})`}
      />
      <p>
        The handler enforces these scopes on every operation. A user in
        org A cannot see inbox items or preferences belonging to org B.
        Cross-tenant requests return <code>403</code> or filter to an empty
        set.
      </p>

      <h2>Tenant-level preference defaults</h2>
      <p>
        Different tenants may want different default channel states. Use{" "}
        <code>tenantDefaults</code> to override app-level defaults per tenant:
      </p>
      <Code
        code={`const notify = createNotifyKit({
  // ...
  defaults: {
    channels: { inbox: true, email: true },
  },
  tenantDefaults: async (tenantId) => {
    const org = await db.query.organizations.findFirst({
      where: eq(organizations.id, tenantId),
    })
    if (org?.plan === "free") {
      return { email: false } // free plans don't get email by default
    }
    return null // use app defaults
  },
})`}
      />

      <h2>Preference resolution order</h2>
      <p>
        The preference engine resolves channel state through layers. Each
        layer can override the one above it:
      </p>
      <ol>
        <li><strong>App default</strong> — <code>defaults.channels</code></li>
        <li><strong>Category default</strong> — <code>defaults.categories[cat]</code></li>
        <li><strong>Notification default</strong> — <code>notification.defaultChannels</code></li>
        <li><strong>Tenant setting</strong> — <code>tenantDefaults(tenantId)</code></li>
        <li><strong>User global</strong> — user&apos;s global preference for all notifications</li>
        <li><strong>User category</strong> — user&apos;s preference for a category</li>
        <li><strong>User notification</strong> — user&apos;s preference for this specific notification</li>
        <li><strong>Required override</strong> — <code>required: true</code> forces delivery</li>
        <li><strong>Destination unavailable</strong> — no email/phone → skip</li>
      </ol>

      <h2>Scoping recipients</h2>
      <p>
        Recipients can belong to a tenant:
      </p>
      <Code
        code={`await notify.upsertRecipient({
  id: user.id,
  tenantId: org.id,
  email: user.email,
  name: user.name,
})`}
      />
      <p>
        When a recipient has a <code>tenantId</code>, inbox items and
        preferences are stored with that scope. This supports the common
        pattern where one user belongs to multiple organizations with
        separate notification state per org.
      </p>

      <div className="page-nav">
        <Link href="/docs/providers">
          <span className="page-nav-label">Previous</span>
          <span className="page-nav-title">Email & webhook providers</span>
        </Link>
        <Link href="/docs/security">
          <span className="page-nav-label">Next</span>
          <span className="page-nav-title">Security model</span>
        </Link>
      </div>
    </article>
  );
}

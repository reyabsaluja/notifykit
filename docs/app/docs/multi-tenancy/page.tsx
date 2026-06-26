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

      <div className="callout callout-tip">
        <strong>When do you need this?</strong> If your app has organizations,
        teams, or workspaces where one user can belong to multiple — and each
        should have separate notification state (different inbox, different
        preferences). If you have a single-tenant app, you can skip this page.
      </div>

      <div className="overview-flow">
        <div className="overview-flow-step">
          <span className="overview-flow-number">1</span>
          <div>
            <strong>Scope on send</strong>
            <p>Pass <code>tenantId</code> / <code>workspaceId</code> with every <code>send()</code> call.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">2</span>
          <div>
            <strong>Scope on read</strong>
            <p>Return the scope from <code>identify()</code> in your handler — all queries filter automatically.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">3</span>
          <div>
            <strong>Isolation enforced</strong>
            <p>Cross-tenant access returns 403 or filters to empty. No shared state between orgs.</p>
          </div>
        </div>
      </div>

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
        The tenant layer sits between notification defaults and user preferences.
        Tenant admins can override app defaults, but users can still override
        their tenant&apos;s choice:
      </p>
      <table>
        <thead>
          <tr><th>Layer</th><th>Set by</th><th>Example</th></tr>
        </thead>
        <tbody>
          <tr><td>1. App default</td><td>Developer</td><td>Email on for all notifications</td></tr>
          <tr><td>2. Category/Notification</td><td>Developer</td><td>Marketing emails off by default</td></tr>
          <tr><td><strong>3. Tenant</strong></td><td><strong>Tenant admin</strong></td><td><strong>Free plans: email off</strong></td></tr>
          <tr><td>4. User preference</td><td>End user</td><td>User enables email anyway</td></tr>
          <tr><td>5. Required override</td><td>Developer</td><td>Password resets always deliver</td></tr>
        </tbody>
      </table>
      <div className="callout callout-tip">
        <strong>Most specific wins.</strong> Each layer overrides the one above.
        See <Link href="/docs/preferences">Preferences &amp; unsubscribe</Link>{" "}
        for the full breakdown with resolution trails.
      </div>

      <h2>Mapping your app to tenancy</h2>
      <p>
        Use these questions to decide how many scope levels you need:
      </p>
      <div className="overview-flow">
        <div className="overview-flow-step">
          <span className="overview-flow-number">?</span>
          <div>
            <strong>Can a user be in multiple organizations?</strong>
            <p>Yes → you need <code>tenantId</code> so each org gets its own inbox and preferences. No → you can skip tenancy entirely.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">?</span>
          <div>
            <strong>Within an org, are there sub-contexts with separate notification rules?</strong>
            <p>Yes (e.g. projects, channels, repos) → add <code>workspaceId</code>. No → <code>tenantId</code> alone is enough.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">?</span>
          <div>
            <strong>Should users manage preferences per sub-context?</strong>
            <p>Yes (e.g. mute one project but not another) → <code>workspaceId</code> is essential. No → keep it simple with just <code>tenantId</code>.</p>
          </div>
        </div>
      </div>
      <table>
        <thead>
          <tr><th>Your app has</th><th>Map to</th><th>Example</th></tr>
        </thead>
        <tbody>
          <tr><td>Organizations/companies</td><td><code>tenantId</code></td><td>Slack workspaces, Linear teams</td></tr>
          <tr><td>Projects within an org</td><td><code>workspaceId</code></td><td>Vercel projects, GitHub repos</td></tr>
          <tr><td>Single-tenant (no orgs)</td><td>Omit both</td><td>Personal apps, single-team tools</td></tr>
          <tr><td>Both orgs and projects</td><td><code>tenantId</code> + <code>workspaceId</code></td><td>Notion (team → workspace), Figma (org → project)</td></tr>
        </tbody>
      </table>

      <h2>Scoping recipients</h2>
      <p>
        Recipients can belong to a tenant. This enables the common pattern
        where one user belongs to multiple organizations with separate
        notification state per org:
      </p>
      <Code
        code={`// Same user, two orgs — separate inboxes and preferences
await notify.upsertRecipient({ id: user.id, tenantId: "org_acme", email: user.email })
await notify.upsertRecipient({ id: user.id, tenantId: "org_globex", email: user.email })`}
      />
      <div className="callout callout-tip">
        <strong>One user, multiple orgs.</strong> When Alice switches from
        Acme to Globex in your app, she sees a different inbox, different
        preferences, and different unsubscribe state. The{" "}
        <code>tenantId</code> from <code>identify()</code> controls which
        org&apos;s data she sees.
      </div>

      <h2>Common pitfalls</h2>
      <table>
        <thead>
          <tr><th>Symptom</th><th>Root cause</th><th>Fix</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>User sees notifications from another org</td>
            <td><code>identify()</code> doesn&apos;t return <code>tenantId</code></td>
            <td>Always return the active org from the session — don&apos;t omit it even if nullable</td>
          </tr>
          <tr>
            <td>Preferences reset when user switches org</td>
            <td>Preferences were written without <code>tenantId</code> scope</td>
            <td>Ensure <code>tenantId</code> is included in both <code>send()</code> and the handler&apos;s <code>identify()</code></td>
          </tr>
          <tr>
            <td>Unsubscribe link works for wrong org</td>
            <td>Token signed without tenant scope</td>
            <td>The token is bound to the scope at send time — verify your <code>send()</code> includes <code>tenantId</code></td>
          </tr>
          <tr>
            <td>User gets notifications for orgs they left</td>
            <td>Recipient record still exists for that tenant</td>
            <td>Delete or deactivate the scoped recipient when revoking org membership</td>
          </tr>
          <tr>
            <td>SSE stream shows cross-org events</td>
            <td>Realtime subscription not scoped</td>
            <td>Confirm <code>identify()</code> returns the scope — the SSE handler uses it to filter events</td>
          </tr>
        </tbody>
      </table>
      <h2>Testing tenant isolation</h2>
      <p>
        Verify isolation in your test suite before shipping. This pattern
        catches the most common multi-tenant bugs — cross-org data leaks,
        missing scope in handlers, and broken preference scoping:
      </p>
      <Code
        code={`import { createNotifyKit, memoryAdapter, fakeEmailProvider } from "@notifykitjs/core"
import { createHandler } from "@notifykitjs/core"

const notify = createNotifyKit({
  notifications: [commentMentioned] as const,
  database: memoryAdapter(),
  providers: { email: fakeEmailProvider() },
})

// Send to same user in two different orgs
await notify.upsertRecipient({ id: "alice", tenantId: "org_acme", email: "a@test.com" })
await notify.upsertRecipient({ id: "alice", tenantId: "org_globex", email: "a@test.com" })

await notify.send({
  recipientId: "alice", tenantId: "org_acme",
  notificationId: "comment_mentioned",
  payload: { actorName: "Bob", postUrl: "/posts/1" },
})

// Handler scoped to org_globex should see nothing
const globexHandler = createHandler(notify, {
  identify: async () => ({ recipientId: "alice", tenantId: "org_globex" }),
})
const res = await globexHandler(new Request("http://localhost/inbox"))
const items = await res.json()
expect(items).toHaveLength(0) // ✓ Acme notification not visible

// Handler scoped to org_acme sees the item
const acmeHandler = createHandler(notify, {
  identify: async () => ({ recipientId: "alice", tenantId: "org_acme" }),
})
const acmeRes = await acmeHandler(new Request("http://localhost/inbox"))
const acmeItems = await acmeRes.json()
expect(acmeItems).toHaveLength(1) // ✓ correct isolation`}
      />
      <table>
        <thead>
          <tr><th>What to assert</th><th>Why it matters</th><th>Catches</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>Inbox returns empty for wrong org</td>
            <td>Proves data isolation at the query layer</td>
            <td>Missing <code>tenantId</code> filter in adapter</td>
          </tr>
          <tr>
            <td>Preferences don&apos;t bleed across orgs</td>
            <td>User can have email off in Acme but on in Globex</td>
            <td>Scope missing from preference writes</td>
          </tr>
          <tr>
            <td>SSE events only fire for the scoped org</td>
            <td>Realtime must filter by tenant before broadcasting</td>
            <td>Unscoped pub/sub subscription</td>
          </tr>
          <tr>
            <td>Unsubscribe token rejects wrong tenant</td>
            <td>HMAC is bound to scope at sign time</td>
            <td>Token forged or replayed across orgs</td>
          </tr>
        </tbody>
      </table>
      <div className="callout callout-tip">
        <strong>Run this early.</strong> Add tenant isolation tests before you have
        real users. Use <Link href="/docs/explain">explain()</Link> to confirm the
        tenant layer appears in preference resolution trails.
      </div>

      <h2>Migrating from single-tenant to multi-tenant</h2>
      <p>
        If your app already has NotifyKit running without tenancy and
        you&apos;re adding organizations, you need to backfill existing
        records. Here&apos;s the safe migration path:
      </p>
      <div className="overview-flow">
        <div className="overview-flow-step">
          <span className="overview-flow-number">1</span>
          <div>
            <strong>Add tenantId to identify()</strong>
            <p>Start returning the org scope from your handler. New data is scoped from this point forward.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">2</span>
          <div>
            <strong>Add tenantId to all send() calls</strong>
            <p>Every send must include the scope. Missing it creates unscoped records that leak across orgs.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">3</span>
          <div>
            <strong>Backfill existing records</strong>
            <p>Assign a tenantId to existing recipients, inbox items, and preferences. Run a migration script.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">4</span>
          <div>
            <strong>Verify isolation</strong>
            <p>Log in as two different orgs and confirm inbox, preferences, and SSE are fully separated.</p>
          </div>
        </div>
      </div>
      <Code
        code={`// Migration script: backfill tenantId on existing records
import { notifyKitSchema } from "@notifykitjs/drizzle"
import { isNull, eq } from "drizzle-orm"

const { recipients, inboxItems, preferences } = notifyKitSchema

// Map each user to their org (your app's logic)
const userOrgs = await db.select({ userId: users.id, orgId: users.organizationId }).from(users)

for (const { userId, orgId } of userOrgs) {
  // Backfill recipients
  await db.update(recipients)
    .set({ tenantId: orgId })
    .where(and(eq(recipients.id, userId), isNull(recipients.tenantId)))

  // Backfill inbox items
  await db.update(inboxItems)
    .set({ tenantId: orgId })
    .where(and(eq(inboxItems.recipientId, userId), isNull(inboxItems.tenantId)))

  // Backfill preferences
  await db.update(preferences)
    .set({ tenantId: orgId })
    .where(and(eq(preferences.recipientId, userId), isNull(preferences.tenantId)))
}`}
      />
      <table>
        <thead>
          <tr><th>Risk</th><th>What goes wrong</th><th>Prevention</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>Unscoped records remain</td>
            <td>Old inbox items visible to all orgs (or invisible to all)</td>
            <td>Query for <code>tenantId IS NULL</code> after migration — count should be zero</td>
          </tr>
          <tr>
            <td>Users in multiple orgs</td>
            <td>Backfill assigns only one org, orphaning the rest</td>
            <td>Create scoped recipient records per org membership, not per user</td>
          </tr>
          <tr>
            <td>Preferences lost</td>
            <td>Scoped query finds no match for existing unscoped pref</td>
            <td>Backfill preferences before switching identify() to return scope</td>
          </tr>
          <tr>
            <td>In-flight sends unscoped</td>
            <td>Sends queued before migration land without tenantId</td>
            <td>Drain the queue (<code>notify.drain()</code>) before deploying the scoped handler</td>
          </tr>
        </tbody>
      </table>
      <div className="callout callout-warn">
        <strong>Order matters.</strong> Backfill records (step 3) before
        deploying the scoped handler (step 1). If you deploy scoping first,
        users will see empty inboxes until the migration runs — because the
        handler queries with <code>tenantId</code> but existing records
        have <code>NULL</code>.
      </div>

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

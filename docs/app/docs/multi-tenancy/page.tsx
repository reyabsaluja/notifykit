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

      <div className="features">
        <div className="feature-card">
          <h3>Data isolation</h3>
          <p>Every inbox, preference, and delivery is scoped by tenant. No shared state between organizations.</p>
        </div>
        <div className="feature-card">
          <h3>Workspace hierarchies</h3>
          <p>Two-level scoping (org + project) for apps with nested contexts like repos, channels, or boards.</p>
        </div>
        <div className="feature-card">
          <h3>Tenant-level defaults</h3>
          <p>Org admins control default channel states for their members. Users can still override individually.</p>
        </div>
        <div className="feature-card">
          <h3>Safe migration path</h3>
          <p>Move from single-tenant to multi-tenant without losing existing data or disrupting active users.</p>
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
        filename="app/api/notifykit/[...notifykit]/route.ts"
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

      <h2>Integration checklist</h2>
      <p>
        Every place <code>tenantId</code> must appear. Miss one and you get
        silent cross-tenant leaks:
      </p>
      <table>
        <thead>
          <tr><th>Where</th><th>How</th><th>If you miss it</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><code>send()</code></td>
            <td>Pass <code>tenantId</code> on every call</td>
            <td>Records are unscoped — visible to all orgs or invisible to the correct one</td>
          </tr>
          <tr>
            <td><code>identify()</code></td>
            <td>Return <code>tenantId</code> from session</td>
            <td>Handler queries are unscoped — users see cross-org data</td>
          </tr>
          <tr>
            <td><code>upsertRecipient()</code></td>
            <td>Include <code>tenantId</code> per-org</td>
            <td>Preferences and inbox are shared across orgs for the same user</td>
          </tr>
          <tr>
            <td><code>preferences.update()</code></td>
            <td>Include <code>tenantId</code> in scope</td>
            <td>Preference changes in one org bleed into another</td>
          </tr>
          <tr>
            <td>Unsubscribe config</td>
            <td>Scope is encoded in the HMAC token automatically</td>
            <td>N/A — handled by the engine if <code>send()</code> has the scope</td>
          </tr>
          <tr>
            <td>Realtime (SSE)</td>
            <td>Scoped via <code>identify()</code> return</td>
            <td>Users receive events from other orgs in their stream</td>
          </tr>
        </tbody>
      </table>
      <div className="callout callout-warn">
        <strong>The most common bug: forgetting <code>tenantId</code> on{" "}
        <code>send()</code>.</strong> The handler scopes reads via{" "}
        <code>identify()</code>, so the inbox <em>appears</em> to work in
        testing. But without scope on writes, production data lands in an
        unscoped bucket — invisible to the correctly-scoped handler.
      </div>

      <h2>Tenant-level preference defaults</h2>
      <p>
        Different tenants may want different default channel states. Use{" "}
        <code>tenantDefaults</code> to override app-level defaults per tenant:
      </p>
      <Code
        filename="lib/notifykit.ts"
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
      <div className="features">
        <div className="feature-card">
          <h3>Can a user be in multiple organizations?</h3>
          <p>Yes → you need <code>tenantId</code> so each org gets its own inbox and preferences. No → you can skip tenancy entirely.</p>
        </div>
        <div className="feature-card">
          <h3>Are there sub-contexts with separate notification rules?</h3>
          <p>Yes (e.g. projects, channels, repos) → add <code>workspaceId</code>. No → <code>tenantId</code> alone is enough.</p>
        </div>
        <div className="feature-card">
          <h3>Should users manage preferences per sub-context?</h3>
          <p>Yes (e.g. mute one project but not another) → <code>workspaceId</code> is essential. No → keep it simple with just <code>tenantId</code>.</p>
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

      <h2>Workspace scoping in practice</h2>
      <p>
        When your app has two levels of hierarchy (org → project, team → channel,
        company → repository), use <code>workspaceId</code> for the inner scope.
        This lets users mute one project without affecting their notifications
        elsewhere in the org.
      </p>
      <Code
        code={`// Project management app: user gets task notifications per-project
await notify.send({
  recipientId: user.id,
  tenantId: org.id,              // "Acme Inc"
  workspaceId: project.id,       // "Backend Refactor"
  notificationId: "task_assigned",
  payload: { taskTitle: "Fix auth bug", assignerName: "Rey" },
})

// Same user, same org, different project:
await notify.send({
  recipientId: user.id,
  tenantId: org.id,              // "Acme Inc"
  workspaceId: anotherProject.id, // "Mobile App"
  notificationId: "task_assigned",
  payload: { taskTitle: "Add dark mode", assignerName: "Sam" },
})`}
      />

      <h3>Per-workspace preferences</h3>
      <p>
        Users can mute notifications for a specific workspace without
        affecting their preferences in other workspaces within the same org:
      </p>
      <Code
        code={`// User mutes email for "Backend Refactor" but keeps it on elsewhere
await notify.preferences.update({
  recipientId: user.id,
  tenantId: org.id,
  workspaceId: "proj_backend_refactor",
  notificationId: "task_assigned",
  channels: { email: false },
})

// "Mobile App" still sends email — workspace preferences are independent
const explanation = await notify.explain({
  recipientId: user.id,
  tenantId: org.id,
  workspaceId: "proj_mobile_app",
  notificationId: "task_assigned",
  payload: { taskTitle: "Test", assignerName: "Test" },
})
// explanation.channels.email.outcome → "deliver"`}
      />
      <table>
        <thead>
          <tr><th>Scope combination</th><th>Inbox shows</th><th>Preferences apply from</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><code>tenantId</code> only</td>
            <td>All items in that org (all workspaces)</td>
            <td>Org-level preferences</td>
          </tr>
          <tr>
            <td><code>tenantId</code> + <code>workspaceId</code></td>
            <td>Only items in that specific workspace</td>
            <td>Workspace-level preferences (falls through to org-level if unset)</td>
          </tr>
        </tbody>
      </table>

      <h3>Building a &quot;mute this project&quot; UI</h3>
      <p>
        The most common workspace feature is a per-project mute toggle.
        Here&apos;s the pattern — a single button that suppresses all
        notifications from one workspace:
      </p>
      <Code
        filename="components/mute-project-button.tsx"
        code={`import { usePreferences } from "@notifykitjs/react"

function MuteProjectButton({ workspaceId, workspaceName }: {
  workspaceId: string
  workspaceName: string
}) {
  const { isEnabled, update } = usePreferences()
  const isMuted = !isEnabled("*", "inbox", { workspaceId })

  return (
    <button onClick={() => update({
      notificationId: "*",
      workspaceId,
      channels: { inbox: !isMuted, email: !isMuted },
    })}>
      {isMuted ? \`Unmute \${workspaceName}\` : \`Mute \${workspaceName}\`}
    </button>
  )
}`}
      />
      <div className="callout callout-tip">
        <strong>Workspace mute uses the wildcard.</strong> Setting{" "}
        <code>notificationId: &quot;*&quot;</code> with a <code>workspaceId</code>{" "}
        disables all notifications for that workspace. The user can still
        override specific notifications back to &quot;on&quot; if they want —
        most-specific-wins resolution applies at the workspace level too.
      </div>

      <h2>Dynamic tenant settings</h2>
      <p>
        The <code>tenantDefaults</code> example above uses a static plan check.
        Real B2B apps need org admins to control notification settings at runtime
        — without a code deploy. Back the function with a database lookup:
      </p>
      <table>
        <thead>
          <tr><th>Approach</th><th>When to use</th><th>Trade-off</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Static function</strong></td>
            <td>Defaults differ by plan tier only</td>
            <td>Simple but requires a deploy to change</td>
          </tr>
          <tr>
            <td><strong>Database-backed</strong></td>
            <td>Org admins toggle channels from a settings panel</td>
            <td>Flexible but adds a DB query per send</td>
          </tr>
          <tr>
            <td><strong>Cached database</strong></td>
            <td>High-volume sends where the extra query matters</td>
            <td>Best of both — stale for up to cache TTL</td>
          </tr>
        </tbody>
      </table>
      <Code
        filename="lib/notifykit.ts"
        code={`const notify = createNotifyKit({
  // ...
  tenantDefaults: async (tenantId) => {
    // Look up this org's admin-configured defaults
    const settings = await db.query.tenantNotificationSettings.findMany({
      where: eq(tenantNotificationSettings.tenantId, tenantId),
    })

    if (settings.length === 0) return null // fall through to app defaults

    // Merge global ("*") and notification-specific settings
    const global = settings.find(s => s.notificationId === "*")
    return global?.channels ?? null
  },
})`}
      />
      <h3>Admin endpoint for org settings</h3>
      <p>
        Expose an API route where org admins toggle channels for their
        organization. Individual users can still override via their own
        preferences — most-specific-wins applies.
      </p>
      <Code
        filename="app/api/admin/notification-settings/route.ts"
        code={`import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { tenantNotificationSettings } from "@/lib/schema"
import { eq, and } from "drizzle-orm"

export async function POST(request: Request) {
  const session = await auth(request)
  if (!session?.isOrgAdmin) return Response.json({ error: "Forbidden" }, { status: 403 })

  const { notificationId, channels } = await request.json()

  await db
    .insert(tenantNotificationSettings)
    .values({
      tenantId: session.organizationId,
      notificationId, // "*" for org-wide, or specific ID
      channels,
    })
    .onConflictDoUpdate({
      target: [tenantNotificationSettings.tenantId, tenantNotificationSettings.notificationId],
      set: { channels },
    })

  return Response.json({ ok: true })
}`}
      />
      <Code
        filename="components/org-notification-settings.tsx"
        code={`function OrgNotificationSettings({ notifications }) {
  const orgId = useCurrentOrg().id

  async function toggleChannel(notificationId: string, channel: string, enabled: boolean) {
    await fetch("/api/admin/notification-settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        notificationId,
        channels: { [channel]: enabled },
      }),
    })
  }

  return (
    <div>
      <h2>Organization notification defaults</h2>
      <p>These apply to all members unless they override in their own settings.</p>
      <table>
        <thead>
          <tr><th>Notification</th><th>Inbox</th><th>Email</th></tr>
        </thead>
        <tbody>
          {notifications.map(n => (
            <tr key={n.id}>
              <td>{n.description}</td>
              <td><input type="checkbox" onChange={e => toggleChannel(n.id, "inbox", e.target.checked)} /></td>
              <td><input type="checkbox" onChange={e => toggleChannel(n.id, "email", e.target.checked)} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}`}
      />
      <div className="callout callout-tip">
        <strong>Cache for high-volume sends.</strong> The{" "}
        <code>tenantDefaults</code> function runs on every <code>send()</code>.
        For apps sending 100+ notifications/second, cache the result per tenant
        with a short TTL (30–60 seconds). Admin changes take effect after the
        cache expires — acceptable for default-level settings that change rarely.
      </div>
      <table>
        <thead>
          <tr><th>What the admin controls</th><th>What users still control</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>Org-wide default: email on or off for each notification</td>
            <td>Individual override: a user can still enable email even if the org turned it off</td>
          </tr>
          <tr>
            <td>Which channels are available to org members</td>
            <td>Per-notification and per-workspace toggles within the available set</td>
          </tr>
          <tr>
            <td>Global org mute (all channels off during an incident)</td>
            <td>Nothing — global off at the tenant layer suppresses everything except <code>required</code></td>
          </tr>
        </tbody>
      </table>
      <div className="callout callout-warn">
        <strong>Tenant OFF + no user preference = no delivery.</strong> An
        absent user preference doesn&apos;t override a tenant setting — it means
        &quot;I haven&apos;t chosen.&quot; For the user to get email after the
        org admin disables it, they must explicitly set{" "}
        <code>email: true</code> in their own preferences. Communicate this
        in your admin UI: &quot;Members can still enable this individually.&quot;
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
        filename="tests/tenant-isolation.test.ts"
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
        records. The order below is critical — backfill data <em>before</em>{" "}
        deploying scoped handlers, or users will see empty inboxes until
        the migration catches up.
      </p>
      <div className="overview-flow">
        <div className="overview-flow-step">
          <span className="overview-flow-number">1</span>
          <div>
            <strong>Drain in-flight sends</strong>
            <p>Call <code>notify.drain()</code> so queued sends land before you start migrating. Anything in-flight won&apos;t have a tenantId.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">2</span>
          <div>
            <strong>Backfill existing records</strong>
            <p>Assign a tenantId to all existing recipients, inbox items, and preferences. Query for <code>tenantId IS NULL</code> after — count must be zero.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">3</span>
          <div>
            <strong>Add tenantId to all send() calls</strong>
            <p>Every send must include the scope. Deploy this first — new data goes out scoped while reads still work unscoped.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">4</span>
          <div>
            <strong>Add tenantId to identify()</strong>
            <p>Deploy the scoped handler. Now reads filter by tenant — safe because all data already has a tenantId from steps 2–3.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">5</span>
          <div>
            <strong>Verify isolation</strong>
            <p>Log in as two different orgs and confirm inbox, preferences, and SSE are fully separated.</p>
          </div>
        </div>
      </div>
      <Code
        filename="scripts/backfill-tenancy.ts"
        code={`import { notifyKitSchema } from "@notifykitjs/drizzle"
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
            <td>Deploy scoped reads before backfill</td>
            <td>Users see empty inboxes — handler filters by tenantId but records have <code>NULL</code></td>
            <td>Complete step 2 (backfill) before step 4 (scoped handler). Follow the order exactly.</td>
          </tr>
          <tr>
            <td>Unscoped records remain</td>
            <td>Old inbox items visible to all orgs (or invisible to all)</td>
            <td>Query for <code>tenantId IS NULL</code> after step 2 — count must be zero before proceeding</td>
          </tr>
          <tr>
            <td>Users in multiple orgs</td>
            <td>Backfill assigns only one org, orphaning the rest</td>
            <td>Create scoped recipient records per org membership, not per user</td>
          </tr>
          <tr>
            <td>In-flight sends unscoped</td>
            <td>Sends queued before migration land without tenantId</td>
            <td>Step 1: drain the queue before starting the backfill</td>
          </tr>
        </tbody>
      </table>
      <div className="callout callout-warn">
        <strong>Don&apos;t skip the drain.</strong> Sends queued before step 2
        land without a tenantId. If you backfill and then an old job writes
        an unscoped record, it becomes invisible to the scoped handler.{" "}
        <code>notify.drain()</code> ensures the queue is empty before you start.
      </div>

      <div className="button-row">
        <Link href="/docs/preferences" className="primary">Preference resolution</Link>
        <Link href="/docs/security">Security model</Link>
        <Link href="/docs/explain">Debug with explain()</Link>
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

import Link from "next/link";
import { createDocsMetadata } from "../../lib/site";
import { Code } from "../_components/code";

export const metadata = createDocsMetadata("overview");

export default function OverviewPage() {
  return (
    <article>
      <h1>Overview</h1>
      <p>
        NotifyKit is a TypeScript framework for building notifications directly
        inside your app. Define notifications as code, store state in your own
        database, and deliver across inbox, email, SMS, and webhook channels.
      </p>

      <Code
        code={`import { notify } from "@/lib/notifykit"

await notify.send({
  recipientId: user.id,
  notificationId: "comment_mentioned",
  payload: { actorName: "Rey", postUrl: "/posts/42" },
})
// → inbox item created, email queued, preferences respected`}
      />

      <div className="callout callout-tip">
        <strong>No platform required.</strong> No hosted dashboard, no external
        workflow editor, no third-party queue. NotifyKit runs in-process inside
        your app. You own the infrastructure and the data.
      </div>

      <div className="button-row">
        <Link href="/docs/quickstart" className="primary">Quickstart (5 min)</Link>
        <Link href="/docs/why-notifykit">Why NotifyKit?</Link>
        <Link href="/docs/installation">Add to existing app</Link>
        <Link href="/docs/api">API reference</Link>
      </div>

      <h2>How it works</h2>

      <div className="overview-flow">
        <div className="overview-flow-step">
          <span className="overview-flow-number">1</span>
          <div>
            <strong>Define</strong>
            <p>Declare notifications with typed payloads and channel configs. They live in your codebase, version-controlled and type-checked.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">2</span>
          <div>
            <strong>Send</strong>
            <p>Call <code>notify.send()</code> from anywhere on the server. The engine resolves preferences, applies rate limits and quiet hours, then renders templates.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">3</span>
          <div>
            <strong>Deliver</strong>
            <p>Each channel fires independently — inbox writes to your DB, email goes through your provider, webhooks POST to your endpoints. All with retry and fallback built in.</p>
          </div>
        </div>
      </div>

      <h2>Key ideas</h2>
      <div className="features">
        <div className="feature-card">
          <h3>Notifications as code</h3>
          <p>Typed definitions live in your codebase. Refactor, review, and deploy like any other code.</p>
        </div>
        <div className="feature-card">
          <h3>Your database</h3>
          <p>Inbox, preferences, and delivery logs write to your existing DB via adapters. No external state.</p>
        </div>
        <div className="feature-card">
          <h3>Multi-channel</h3>
          <p>One send resolves to inbox, email, SMS, or webhook — based on config and user preferences.</p>
        </div>
        <div className="feature-card">
          <h3>Full pipeline</h3>
          <p>Rate limits, quiet hours, digests, dedup, retries, and fallbacks — all built in.</p>
        </div>
      </div>

      <h2>Architecture</h2>
      <p>
        NotifyKit runs inside your application — not as a separate service. Here&apos;s
        where each piece lives in a typical deployment:
      </p>

      <div className="features">
        <div className="feature-card">
          <h3>Your server code</h3>
          <p>Server actions, API routes, background jobs. Calls <code>notify.send()</code> and <code>upsertRecipient()</code>.</p>
        </div>
        <div className="feature-card">
          <h3>NotifyKit engine</h3>
          <p>Runs in-process. Resolves preferences, applies rate limits, renders templates, queues deliveries.</p>
        </div>
        <div className="feature-card">
          <h3>Your database</h3>
          <p>Inbox items, preferences, delivery records, and timeline — all in tables you own.</p>
        </div>
        <div className="feature-card">
          <h3>Providers</h3>
          <p>Resend and SMTP integrations are included. Email, SMS, and webhook provider contracts let you add your own.</p>
        </div>
      </div>

      <table>
        <thead>
          <tr><th>Boundary</th><th>What crosses it</th><th>Who controls it</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Server → Engine</strong></td>
            <td><code>send()</code> calls with typed payloads</td>
            <td>Your application code</td>
          </tr>
          <tr>
            <td><strong>Engine → Database</strong></td>
            <td>Inbox items, preferences, delivery records</td>
            <td>Database adapter (Drizzle, custom)</td>
          </tr>
          <tr>
            <td><strong>Engine → Providers</strong></td>
            <td>Rendered email/SMS/webhook payloads</td>
            <td>Provider adapter (Resend, Postmark, custom)</td>
          </tr>
          <tr>
            <td><strong>Handler → Browser</strong></td>
            <td>REST API (inbox, preferences) + SSE events</td>
            <td>Route handler + <code>identify()</code></td>
          </tr>
          <tr>
            <td><strong>Browser → React</strong></td>
            <td>Hooks consume the REST API automatically</td>
            <td><code>&lt;NotifyKitProvider&gt;</code> + hooks</td>
          </tr>
        </tbody>
      </table>

      <div className="callout callout-tip">
        <strong>The default path stays in your process.</strong> The engine is a
        function call, and <code>inlineQueue()</code> runs the pipeline before
        returning. For crash-safe asynchronous delivery, persist jobs through
        a durable queue and process them with <code>processDeliveryJob()</code>.
      </div>

      <h2>The send pipeline</h2>
      <p>
        Every call to <code>send()</code> passes through these stages. Each is
        optional — skip what you don&apos;t need — but they&apos;re always
        evaluated in this order:
      </p>
      <table>
        <thead>
          <tr><th>Stage</th><th>What it does</th><th>Docs</th></tr>
        </thead>
        <tbody>
          <tr><td>1. Validate</td><td>Check payload against schema</td><td><Link href="/docs/defining">Defining</Link></td></tr>
          <tr><td>2. Idempotency</td><td>Replay if key already seen</td><td><Link href="/docs/deduplication">Dedup &amp; idempotency</Link></td></tr>
          <tr><td>3. Dedup</td><td>Skip if same event within window</td><td><Link href="/docs/deduplication">Dedup &amp; idempotency</Link></td></tr>
          <tr><td>4. Rate limit</td><td>Drop if over threshold</td><td><Link href="/docs/digests">Digests &amp; rate limits</Link></td></tr>
          <tr><td>5. Digest</td><td>Buffer into a batch window</td><td><Link href="/docs/digests">Digests &amp; rate limits</Link></td></tr>
          <tr><td>6. Preferences</td><td>Skip channels user opted out of</td><td><Link href="/docs/preferences">Preferences</Link></td></tr>
          <tr><td>7. Quiet hours</td><td>Defer push channels until window ends</td><td><Link href="/docs/quiet-hours">Quiet hours</Link></td></tr>
          <tr><td>8. Deliver</td><td>Queue to provider (email, SMS, webhook) + write inbox</td><td><Link href="/docs/channels">Channels</Link></td></tr>
          <tr><td>9. Retry</td><td>Retry failed deliveries with backoff</td><td><Link href="/docs/providers">Providers</Link></td></tr>
          <tr><td>10. Fallback</td><td>Fire alternate channel if primary fails</td><td><Link href="/docs/fallbacks">Fallbacks</Link></td></tr>
        </tbody>
      </table>
      <div className="callout callout-tip">
        <strong>Order matters for debugging.</strong> If a send returns{" "}
        <code>rateLimited: true</code>, it never reached preferences or
        delivery. Use <Link href="/docs/explain">explain()</Link> to see
        exactly where the pipeline stopped.
      </div>

      <h2>How NotifyKit compares</h2>
      <p>
        NotifyKit is an embedded framework, not a managed notification
        platform. The categories solve overlapping problems but make different
        operational trade-offs:
      </p>
      <table>
        <thead>
          <tr><th></th><th>NotifyKit</th><th>Managed platforms</th><th>Self-hosted platform</th></tr>
        </thead>
        <tbody>
          <tr><td><strong>Runs where</strong></td><td>Your app or worker</td><td>Vendor infrastructure</td><td>A separate stack you operate</td></tr>
          <tr><td><strong>State</strong></td><td>Your application database</td><td>Vendor-managed</td><td>Platform database you operate</td></tr>
          <tr><td><strong>Source of truth</strong></td><td>Imported TypeScript definitions</td><td>Dashboard, API, or synced files</td><td>Dashboard or code-first workflows</td></tr>
          <tr><td><strong>Visual editing</strong></td><td>No</td><td>Usually included</td><td>Usually included</td></tr>
          <tr><td><strong>Delivery operations</strong></td><td>You provide durable queueing and monitoring</td><td>Managed for you</td><td>You operate the platform workers</td></tr>
          <tr><td><strong>Best fit</strong></td><td>TypeScript teams wanting app-owned state</td><td>Teams wanting managed workflows and channels</td><td>Teams wanting a full platform on their infrastructure</td></tr>
        </tbody>
      </table>
      <div className="callout callout-tip">
        <strong>Best fit:</strong> teams that already manage their own database
        and want notifications as a library rather than a service dependency.
        If you prefer managed reliability, many turnkey channels, or a visual
        editor for non-engineers, a platform is the better choice.
      </div>

      <h2>Package architecture</h2>
      <p>
        NotifyKit is split into focused packages. Only install what you use —
        here&apos;s how they relate:
      </p>
      <table>
        <thead>
          <tr><th>Layer</th><th>Package</th><th>Depends on</th><th>Install when</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Engine</strong></td>
            <td><code>@notifykitjs/core</code></td>
            <td>—</td>
            <td>Always (the only required package)</td>
          </tr>
          <tr>
            <td><strong>Persistence</strong></td>
            <td><code>@notifykitjs/drizzle</code></td>
            <td>core</td>
            <td>You need data to survive restarts</td>
          </tr>
          <tr>
            <td><strong>Framework</strong></td>
            <td><code>@notifykitjs/next</code></td>
            <td>core</td>
            <td>Exposing REST/SSE routes in Next.js</td>
          </tr>
          <tr>
            <td><strong>UI</strong></td>
            <td><code>@notifykitjs/react</code></td>
            <td>—</td>
            <td>Building inbox/preferences UI in React</td>
          </tr>
          <tr>
            <td><strong>Provider</strong></td>
            <td><code>@notifykitjs/resend</code></td>
            <td>core</td>
            <td>Sending real emails via Resend</td>
          </tr>
          <tr>
            <td><strong>Realtime</strong></td>
            <td><code>@notifykitjs/realtime-pg</code></td>
            <td>core</td>
            <td>Multi-instance deploys with Postgres pub/sub</td>
          </tr>
          <tr>
            <td><strong>Testing</strong></td>
            <td><code>@notifykitjs/testing</code></td>
            <td>core</td>
            <td>Asserting on sends in test suites</td>
          </tr>
        </tbody>
      </table>
      <div className="callout callout-tip">
        <strong>Typical installs by stage:</strong><br />
        <strong>Prototype:</strong> <code>core</code> (memory adapter, fake provider — zero deps)<br />
        <strong>Dev with UI:</strong> <code>core</code> + <code>next</code> + <code>react</code><br />
        <strong>Production:</strong> <code>core</code> + <code>next</code> + <code>react</code> + <code>drizzle</code> + <code>resend</code>
      </div>

      <h2>Common setups</h2>
      <p>
        NotifyKit adapts to different app types. Answer these questions to find
        your starting point:
      </p>
      <div className="features">
        <div className="feature-card">
          <h3>Do users need to see notifications in the app?</h3>
          <p>Yes → you need an inbox channel. No → transactional-only (email/SMS).</p>
        </div>
        <div className="feature-card">
          <h3>Will you send more than 10 notifications/user/hour?</h3>
          <p>Yes → enable digests and rate limits. No → direct delivery is fine.</p>
        </div>
        <div className="feature-card">
          <h3>Do you have multiple organizations/tenants?</h3>
          <p>Yes → add <code>tenantId</code> scoping. No → single-tenant is simpler.</p>
        </div>
      </div>
      <p>
        Match your answers to the table below:
      </p>
      <table>
        <thead>
          <tr><th>App type</th><th>Channels</th><th>Database</th><th>Key features</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>SaaS with inbox</strong></td>
            <td>Inbox + Email</td>
            <td>Postgres (Drizzle)</td>
            <td>Preferences, realtime SSE, unsubscribe links, multi-tenancy</td>
          </tr>
          <tr>
            <td><strong>Internal tool</strong></td>
            <td>Inbox + Webhook (Slack)</td>
            <td>SQLite</td>
            <td>Simple setup, no email provider, webhook to Slack channel</td>
          </tr>
          <tr>
            <td><strong>Transactional only</strong></td>
            <td>Email + SMS</td>
            <td>Postgres</td>
            <td><code>required: true</code>, no inbox UI, delivery tracking + timeline</td>
          </tr>
          <tr>
            <td><strong>High-volume social</strong></td>
            <td>Inbox + Email (digested)</td>
            <td>Postgres</td>
            <td>Digests, rate limits, dedup, BullMQ queue for background delivery</td>
          </tr>
          <tr>
            <td><strong>Prototype / MVP</strong></td>
            <td>Inbox only</td>
            <td>Memory</td>
            <td>Zero deps, no email provider, upgrades later with no code changes</td>
          </tr>
        </tbody>
      </table>
      <div className="callout callout-tip">
        <strong>Start with the MVP row and move down.</strong> Every row adds
        complexity on top of the one above it. You can always add email,
        swap the database, or enable digests later — notification definitions
        and client code stay the same.
      </div>

      <h2>Feature interaction walkthrough</h2>
      <p>
        Pipeline stages don&apos;t operate in isolation — they compose. Here&apos;s
        what happens when multiple features are active on a single send:
      </p>

      <div className="callout">
        <strong>Scenario:</strong> User &quot;Rey&quot; comments on a post at 11:02 PM.
        The recipient has quiet hours (10 PM – 8 AM), email digests (5 min window),
        and has opted out of SMS.
      </div>

      <table>
        <thead>
          <tr><th>Stage</th><th>What happens</th><th>Result field</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Stage 1 — Validate</strong></td>
            <td>Payload passes — <code>actorName</code> and <code>postUrl</code> are present</td>
            <td>—</td>
          </tr>
          <tr>
            <td><strong>Stage 3 — Dedup</strong></td>
            <td>Key <code>mention:post_42:rey</code> not seen → passes</td>
            <td>—</td>
          </tr>
          <tr>
            <td><strong>Stage 4 — Rate limit</strong></td>
            <td>Under threshold (3 of 20/hour used) → passes</td>
            <td>—</td>
          </tr>
          <tr>
            <td><strong>Stage 5 — Digest</strong></td>
            <td>Email has a 5-min digest window → buffered, no email yet</td>
            <td><code>digested: true</code></td>
          </tr>
          <tr>
            <td><strong>Stage 6 — Preferences</strong></td>
            <td>SMS disabled by user → skipped. Inbox + email allowed.</td>
            <td><code>skipped: [{`{channel: "sms", reason: "preferences_disabled"}`}]</code></td>
          </tr>
          <tr>
            <td><strong>Stage 7 — Quiet hours</strong></td>
            <td>11:02 PM is inside the window → email deferred to 8 AM</td>
            <td><code>deferredChannels: [&quot;email&quot;]</code></td>
          </tr>
          <tr>
            <td><strong>Stage 8 — Deliver</strong></td>
            <td>Inbox is a pull channel — writes immediately regardless of quiet hours</td>
            <td><code>inboxItems: [...]</code></td>
          </tr>
        </tbody>
      </table>

      <p>
        At 11:07 PM, the digest window expires. But quiet hours are still active,
        so the flushed digest is deferred until 8 AM. At 8:00 AM, the scheduled
        send fires and the user receives one email: &quot;3 new comments on Launch
        Plan&quot; — the digest collapsed 3 mentions into one delivery.
      </p>

      <div className="overview-flow">
        <div className="overview-flow-step">
          <span className="overview-flow-number">1</span>
          <div>
            <strong>11:02 PM — Send enters pipeline</strong>
            <p>Inbox item written. Email buffered into digest. SMS skipped (preference).</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">2</span>
          <div>
            <strong>11:04, 11:06 PM — More sends arrive</strong>
            <p>Same dedup key? Dropped. Different actors? Append to digest buffer.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">3</span>
          <div>
            <strong>11:07 PM — Digest window expires</strong>
            <p><code>render()</code> combines 3 payloads into one. Still in quiet hours → deferred.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">4</span>
          <div>
            <strong>8:00 AM — Quiet hours end</strong>
            <p><code>flushScheduledSends()</code> fires. One combined email delivered via provider.</p>
          </div>
        </div>
      </div>

      <table>
        <thead>
          <tr><th>Feature interaction</th><th>Behavior</th><th>Docs</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>Digest + quiet hours</td>
            <td>Digest flushes, then quiet hours defers the flushed send</td>
            <td><Link href="/docs/digests">Digests</Link>, <Link href="/docs/quiet-hours">Quiet hours</Link></td>
          </tr>
          <tr>
            <td>Dedup + digest</td>
            <td>Dedup runs first — a duplicate never enters the digest buffer</td>
            <td><Link href="/docs/deduplication">Dedup</Link></td>
          </tr>
          <tr>
            <td>Preferences + fallback</td>
            <td>If user disables email but has a fallback to inbox, fallback fires</td>
            <td><Link href="/docs/preferences">Preferences</Link>, <Link href="/docs/fallbacks">Fallbacks</Link></td>
          </tr>
          <tr>
            <td>Rate limit + digest</td>
            <td>Rate limit runs before digest — a rate-limited send never enters the buffer</td>
            <td><Link href="/docs/digests">Digests</Link></td>
          </tr>
          <tr>
            <td>Quiet hours + inbox</td>
            <td>Inbox always writes immediately — only push channels defer</td>
            <td><Link href="/docs/quiet-hours">Quiet hours</Link></td>
          </tr>
        </tbody>
      </table>
      <div className="callout callout-tip">
        <strong>Use <Link href="/docs/explain">explain()</Link> to trace interactions.</strong>{" "}
        When features compose in unexpected ways, <code>explain()</code> shows exactly
        which stage intercepted the send and why. The{" "}
        <Link href="/docs/timeline">timeline</Link> shows the same information
        after the fact for production debugging.
      </div>

      <h2>Quick debugging reference</h2>
      <p>
        When a notification doesn&apos;t arrive, pick the tool that matches what
        you know. Each answers a different question:
      </p>
      <div className="features">
        <div className="feature-card">
          <h3>Can you reproduce the scenario?</h3>
          <p>Yes → use <Link href="/docs/explain">explain()</Link> to dry-run the send with zero side effects. See which stage blocked it.</p>
        </div>
        <div className="feature-card">
          <h3>Do you have the notification record ID?</h3>
          <p>Yes → use <Link href="/docs/timeline">timeline()</Link> to see every event that happened during that send.</p>
        </div>
        <div className="feature-card">
          <h3>Did your code just call send()?</h3>
          <p>Yes → inspect the <code>SendResult</code> fields: <code>skipped</code>, <code>deferredChannels</code>, <code>rateLimited</code>, <code>digested</code>.</p>
        </div>
      </div>
      <table>
        <thead>
          <tr><th>User reports</th><th>Most likely cause</th><th>Check</th><th>Docs</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>&quot;I never got the email&quot;</td>
            <td>Opted out via preferences, or quiet hours deferred it</td>
            <td><code>explain().channels.email.outcome</code></td>
            <td><Link href="/docs/explain">Explain</Link></td>
          </tr>
          <tr>
            <td>&quot;Email arrived hours late&quot;</td>
            <td>Quiet hours held the delivery until the window ended</td>
            <td><code>result.deferredChannels</code> or timeline <code>quiet_hours.deferred</code></td>
            <td><Link href="/docs/quiet-hours">Quiet hours</Link></td>
          </tr>
          <tr>
            <td>&quot;I got the same notification twice&quot;</td>
            <td>Missing <code>idempotencyKey</code> on a retryable trigger</td>
            <td>Add a unique key per logical event</td>
            <td><Link href="/docs/deduplication">Dedup</Link></td>
          </tr>
          <tr>
            <td>&quot;Nothing shows in my inbox&quot;</td>
            <td><code>upsertRecipient()</code> not called, or wrong <code>recipientId</code></td>
            <td><code>timeline()</code> — look for <code>recipient.resolved</code></td>
            <td><Link href="/docs/timeline">Timeline</Link></td>
          </tr>
          <tr>
            <td>&quot;Notifications stopped entirely&quot;</td>
            <td>Rate limit reached, or provider key expired</td>
            <td><code>result.rateLimited</code> or <code>delivery.failed</code> hook</td>
            <td><Link href="/docs/hooks">Hooks</Link></td>
          </tr>
          <tr>
            <td>&quot;Inbox updates but no email&quot;</td>
            <td>Recipient has no <code>email</code> field, or email channel disabled</td>
            <td><code>result.skipped</code> — look for <code>missing_destination</code></td>
            <td><Link href="/docs/channels">Channels</Link></td>
          </tr>
        </tbody>
      </table>
      <div className="callout callout-tip">
        <strong>Rule of thumb:</strong> run <code>explain()</code> first. It costs
        nothing (no records written, no emails sent) and shows the full pipeline
        resolution in one call. If the issue is intermittent and you can&apos;t
        reproduce, pull the <Link href="/docs/timeline">timeline</Link> for the
        specific notification record.
      </div>

      <h2>Learning paths</h2>
      <p>
        Pick the path that matches where you are. Each is a sequence — read
        them in order for a guided walkthrough of that area:
      </p>
      <div className="features">
        <div className="feature-card">
          <h3>First time here</h3>
          <p>Get a working setup, send your first notification, see it in the UI.</p>
          <p style={{ fontSize: "0.85em", marginTop: "0.5rem" }}>
            <Link href="/docs/quickstart">Quickstart</Link> →{" "}
            <Link href="/docs/defining">Defining</Link> →{" "}
            <Link href="/docs/sending">Sending</Link> →{" "}
            <Link href="/docs/react">React hooks</Link>
          </p>
        </div>
        <div className="feature-card">
          <h3>Adding to an existing app</h3>
          <p>Install, wire auth, connect your database and email provider.</p>
          <p style={{ fontSize: "0.85em", marginTop: "0.5rem" }}>
            <Link href="/docs/installation">Installation</Link> →{" "}
            <Link href="/docs/nextjs">Next.js</Link> →{" "}
            <Link href="/docs/database">Database</Link> →{" "}
            <Link href="/docs/providers">Providers</Link>
          </p>
        </div>
        <div className="feature-card">
          <h3>Reducing noise</h3>
          <p>Stop flooding users — add digests, rate limits, dedup, and quiet hours.</p>
          <p style={{ fontSize: "0.85em", marginTop: "0.5rem" }}>
            <Link href="/docs/digests">Digests &amp; rate limits</Link> →{" "}
            <Link href="/docs/deduplication">Dedup</Link> →{" "}
            <Link href="/docs/quiet-hours">Quiet hours</Link> →{" "}
            <Link href="/docs/preferences">Preferences</Link>
          </p>
        </div>
        <div className="feature-card">
          <h3>Going to production</h3>
          <p>Start with the reliability boundary, then add observability, security, and tenant isolation.</p>
          <p style={{ fontSize: "0.85em", marginTop: "0.5rem" }}>
            <Link href="/docs/production-readiness">Production readiness</Link> →{" "}
            <Link href="/docs/hooks">Hooks</Link> →{" "}
            <Link href="/docs/security">Security</Link> →{" "}
            <Link href="/docs/multi-tenancy">Multi-tenancy</Link> →{" "}
            <Link href="/docs/realtime">Realtime</Link>
          </p>
        </div>
      </div>
      <table>
        <thead>
          <tr><th>I want to&hellip;</th><th>Go directly to</th></tr>
        </thead>
        <tbody>
          <tr><td>Debug why a notification didn&apos;t arrive</td><td><Link href="/docs/explain">Explain &amp; dry run</Link></td></tr>
          <tr><td>See what happened to a past send</td><td><Link href="/docs/timeline">Timeline</Link></td></tr>
          <tr><td>Look up the API for a specific method</td><td><Link href="/docs/api">API reference</Link></td></tr>
          <tr><td>Understand the TypeScript types</td><td><Link href="/docs/types">Types</Link></td></tr>
          <tr><td>See all handler routes and their shapes</td><td><Link href="/docs/handler-routes">Handler routes</Link></td></tr>
        </tbody>
      </table>

      <div className="page-nav">
        <span />
        <Link href="/docs/why-notifykit">
          <span className="page-nav-label">Next</span>
          <span className="page-nav-title">Why NotifyKit?</span>
        </Link>
      </div>
    </article>
  );
}

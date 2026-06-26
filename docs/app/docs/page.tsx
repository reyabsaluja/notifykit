import type { Metadata } from "next";
import Link from "next/link";
import { Code } from "../_components/code";

export const metadata: Metadata = { title: "Overview" };

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

      <div className="overview-flow">
        <div className="overview-flow-step">
          <span className="overview-flow-number">S</span>
          <div>
            <strong>Your server code</strong>
            <p>Server actions, API routes, background jobs. Calls <code>notify.send()</code> and <code>upsertRecipient()</code>.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">E</span>
          <div>
            <strong>NotifyKit engine</strong>
            <p>Runs in-process. Resolves preferences, applies rate limits, renders templates, queues deliveries.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">D</span>
          <div>
            <strong>Your database</strong>
            <p>Inbox items, preferences, delivery records, and timeline — all in tables you own.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">P</span>
          <div>
            <strong>Providers</strong>
            <p>Resend, Postmark, Twilio, or your own. NotifyKit calls them — they deliver to the user.</p>
          </div>
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
        <strong>Everything stays in your process.</strong> There&apos;s no external
        queue, no webhook from NotifyKit back to your app, no polling between
        services. The engine is a function call — <code>send()</code> runs your
        pipeline and returns a result, all within the same request or job.
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
      <div className="callout">
        <strong>Order matters for debugging.</strong> If a send returns{" "}
        <code>rateLimited: true</code>, it never reached preferences or
        delivery. Use <Link href="/docs/explain">explain()</Link> to see
        exactly where the pipeline stopped.
      </div>

      <h2>How NotifyKit compares</h2>
      <p>
        NotifyKit is a framework, not a platform. Here&apos;s how that choice
        affects your stack:
      </p>
      <table>
        <thead>
          <tr><th></th><th>NotifyKit</th><th>Hosted platforms (Novu, Knock, etc.)</th></tr>
        </thead>
        <tbody>
          <tr><td><strong>Runs where</strong></td><td>In your app process</td><td>External service you call via API</td></tr>
          <tr><td><strong>Data lives in</strong></td><td>Your database</td><td>Their cloud</td></tr>
          <tr><td><strong>Notification logic</strong></td><td>TypeScript code, version-controlled</td><td>Dashboard UI or config files</td></tr>
          <tr><td><strong>Type safety</strong></td><td>Full — payloads, IDs, results all typed</td><td>Partial — runtime validation at best</td></tr>
          <tr><td><strong>Vendor lock-in</strong></td><td>None — swap any provider, adapter, or queue</td><td>Migration requires rewriting integrations</td></tr>
          <tr><td><strong>Pricing</strong></td><td>Free, open source</td><td>Per-notification or per-seat fees</td></tr>
          <tr><td><strong>Trade-off</strong></td><td>You manage infrastructure</td><td>They manage infrastructure</td></tr>
        </tbody>
      </table>
      <div className="callout callout-tip">
        <strong>Best fit:</strong> teams that already manage their own database
        and want notifications as a library rather than a service dependency.
        If you prefer a managed service with a visual editor, a hosted platform
        may be a better choice.
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
      <div className="overview-flow">
        <div className="overview-flow-step">
          <span className="overview-flow-number">?</span>
          <div>
            <strong>Do users need to see notifications in the app?</strong>
            <p>Yes → you need an inbox channel. No → transactional-only (email/SMS).</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">?</span>
          <div>
            <strong>Will you send more than 10 notifications/user/hour?</strong>
            <p>Yes → enable digests and rate limits. No → direct delivery is fine.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">?</span>
          <div>
            <strong>Do you have multiple organizations/tenants?</strong>
            <p>Yes → add <code>tenantId</code> scoping. No → single-tenant is simpler.</p>
          </div>
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
            <td><strong>1. Validate</strong></td>
            <td>Payload passes — <code>actorName</code> and <code>postUrl</code> are present</td>
            <td>—</td>
          </tr>
          <tr>
            <td><strong>2. Dedup</strong></td>
            <td>Key <code>mention:post_42:rey</code> not seen → passes</td>
            <td>—</td>
          </tr>
          <tr>
            <td><strong>3. Rate limit</strong></td>
            <td>Under threshold (3 of 20/hour used) → passes</td>
            <td>—</td>
          </tr>
          <tr>
            <td><strong>4. Digest</strong></td>
            <td>Email has a 5-min digest window → buffered, no email yet</td>
            <td><code>digested: true</code></td>
          </tr>
          <tr>
            <td><strong>5. Preferences</strong></td>
            <td>SMS disabled by user → skipped. Inbox + email allowed.</td>
            <td><code>skipped: [{`{channel: "sms", reason: "preferences_disabled"}`}]</code></td>
          </tr>
          <tr>
            <td><strong>6. Quiet hours</strong></td>
            <td>11:02 PM is inside the window → email deferred to 8 AM</td>
            <td><code>deferredChannels: [&quot;email&quot;]</code></td>
          </tr>
          <tr>
            <td><strong>7. Inbox</strong></td>
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

      <h2>Where to start</h2>
      <table>
        <thead>
          <tr><th>Goal</th><th>Start here</th></tr>
        </thead>
        <tbody>
          <tr><td>Try it out in 5 minutes</td><td><Link href="/docs/quickstart">Quickstart</Link></td></tr>
          <tr><td>Add to an existing app</td><td><Link href="/docs/installation">Installation</Link></td></tr>
          <tr><td>Understand the notification model</td><td><Link href="/docs/defining">Defining notifications</Link></td></tr>
          <tr><td>Build a notification UI</td><td><Link href="/docs/react">React hooks &amp; components</Link></td></tr>
          <tr><td>Debug delivery issues</td><td><Link href="/docs/explain">Explain &amp; dry run</Link></td></tr>
        </tbody>
      </table>

      <div className="page-nav">
        <span />
        <Link href="/docs/installation">
          <span className="page-nav-label">Next</span>
          <span className="page-nav-title">Installation</span>
        </Link>
      </div>
    </article>
  );
}

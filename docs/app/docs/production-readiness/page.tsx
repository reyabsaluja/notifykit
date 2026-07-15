import type { Metadata } from "next";
import Link from "next/link";
import { Code } from "../../_components/code";

export const metadata: Metadata = {
  title: "Production readiness",
  description: "Understand NotifyKit's current reliability boundary and what to add before critical production delivery.",
};

export default function ProductionReadinessPage() {
  return (
    <article>
      <h1>Production readiness</h1>
      <p>
        NotifyKit <code>0.0.x</code> is a preview. The notification model,
        persistence adapters, preferences, and delivery pipeline are tested,
        but production reliability depends on infrastructure that the preview
        does not yet bundle for you.
      </p>

      <div className="callout callout-warn">
        <strong>Do not confuse persistent state with durable dispatch.</strong>{" "}
        PostgreSQL preserves NotifyKit records. It does not preserve an
        in-memory queue job if the process exits before delivery finishes.
      </div>

      <h2>Current deployment levels</h2>
      <table>
        <thead>
          <tr><th>Use case</th><th>Recommended setup</th><th>Current verdict</th></tr>
        </thead>
        <tbody>
          <tr><td>Demo, local development, tests</td><td>Memory adapter + fake provider</td><td>Supported</td></tr>
          <tr><td>Prototype with persistent inbox</td><td>SQLite/Postgres + inline queue</td><td>Supported; sends add request latency</td></tr>
          <tr><td>Non-critical application notifications</td><td>Postgres + durable external queue + monitoring</td><td>Possible with integration work</td></tr>
          <tr><td>Security, billing, compliance, or guaranteed delivery</td><td>Outbox, durable worker, provider webhooks, suppression, recovery tooling</td><td>Wait for production-stable or own these pieces explicitly</td></tr>
          <tr><td>Bulk marketing campaigns</td><td>Audience management, legal compliance, campaign analytics</td><td>Use a purpose-built platform</td></tr>
        </tbody>
      </table>

      <h2>Queue behavior</h2>
      <table>
        <thead>
          <tr><th>Queue</th><th>Behavior</th><th>Failure boundary</th></tr>
        </thead>
        <tbody>
          <tr><td><code>inlineQueue()</code></td><td><code>send()</code> waits for delivery</td><td>Caller sees failure, but response latency includes provider work</td></tr>
          <tr><td><code>setTimeoutQueue()</code></td><td>Runs later in the same process</td><td>Work can disappear on crash, deploy, or serverless freeze</td></tr>
          <tr><td>External durable queue</td><td>Serializes <code>DeliveryJob</code> for a worker</td><td>Reliability depends on your queue and worker configuration</td></tr>
        </tbody>
      </table>
      <Code
        filename="worker.ts"
        code={`import { notify } from "./lib/notifykit"

// Your queue worker passes back the persisted DeliveryJob.
await notify.processDeliveryJob(job.data)`}
      />
      <div className="callout callout-warn">
        <strong>Queue redelivery is guarded, but provider delivery is not an
        exactly-once transaction.</strong> NotifyKit skips a job whose delivery
        record is already terminal. A process can still crash after a provider
        accepts a message but before the database records success. Use provider
        idempotency where available and design critical messages for
        at-least-once delivery.
      </div>

      <h2>Checklist before critical delivery</h2>
      <ul>
        <li>Use PostgreSQL and version-controlled migrations reviewed with your app migrations.</li>
        <li>Write notification intent in the same transaction as the business event, or accept the gap explicitly.</li>
        <li>Use a durable queue with idempotent job IDs and a separately monitored worker.</li>
        <li>Ingest provider delivery, bounce, and complaint webhooks.</li>
        <li>Suppress addresses after hard bounces or complaints.</li>
        <li>Alert on terminal delivery failures and test the recovery procedure.</li>
        <li>Load test your actual database, provider, and queue topology.</li>
        <li>Back up NotifyKit tables and test tenant isolation with your authentication layer.</li>
      </ul>

      <h2>What the preview does guarantee</h2>
      <p>
        The repository continuously tests payload validation, preference
        resolution, tenant isolation, idempotency, deduplication, retries,
        fallback behavior, inbox mutations, realtime events, and both SQLite
        and PostgreSQL adapters. Those guarantees apply to the library code;
        they cannot replace operational testing of your deployment.
      </p>

      <div className="button-row">
        <Link href="/docs/database" className="primary">Choose a database</Link>
        <Link href="/docs/providers">Configure providers and queues</Link>
        <a href="https://github.com/reyabsaluja/notifykit/blob/main/ROADMAP.md" target="_blank" rel="noreferrer">Reliability roadmap</a>
      </div>

      <div className="page-nav">
        <Link href="/docs/realtime">
          <span className="page-nav-label">Previous</span>
          <span className="page-nav-title">Realtime</span>
        </Link>
        <Link href="/docs/database">
          <span className="page-nav-label">Next</span>
          <span className="page-nav-title">Database adapters</span>
        </Link>
      </div>
    </article>
  );
}

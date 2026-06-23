import type { Metadata } from "next";
import Link from "next/link";

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

      <h2>How it works</h2>
      <p>
        You declare notification definitions with typed payloads and channel
        configs. At runtime, NotifyKit resolves recipient preferences, applies
        rate limits and quiet hours, renders templates, and dispatches to your
        configured providers. Everything runs in-process — no external service
        or queue required.
      </p>

      <h2>Key ideas</h2>
      <ul>
        <li>
          <strong>Notifications as code</strong> — definitions live alongside
          your app logic, version-controlled and type-checked.
        </li>
        <li>
          <strong>Your database</strong> — notification state (inbox items,
          preferences, delivery logs) writes to your existing database via
          adapters.
        </li>
        <li>
          <strong>Multi-channel</strong> — a single send resolves to inbox,
          email, SMS, or webhook based on the notification config and user
          preferences.
        </li>
        <li>
          <strong>Framework bindings</strong> — first-class Next.js route
          handlers, React hooks, and realtime subscriptions.
        </li>
        <li>
          <strong>No platform</strong> — no hosted dashboard, no external
          workflow editor. You own the infrastructure.
        </li>
      </ul>

      <h2>Packages</h2>
      <ul>
        <li><code>@notifykitjs/core</code> — engine, channels, providers, types</li>
        <li><code>@notifykitjs/next</code> — Next.js route handler and server actions</li>
        <li><code>@notifykitjs/react</code> — hooks, components, client SDK</li>
        <li><code>@notifykitjs/drizzle</code> — SQLite + Postgres database adapters</li>
        <li><code>@notifykitjs/resend</code> — Resend email provider</li>
        <li><code>@notifykitjs/testing</code> — test harness and assertions</li>
        <li><code>@notifykitjs/realtime-ws</code> — WebSocket realtime adapter</li>
        <li><code>@notifykitjs/cli</code> — validate definitions at build time</li>
      </ul>

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

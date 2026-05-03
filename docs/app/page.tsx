import Link from "next/link";

export default function HomePage() {
  return (
    <article>
      <h1>App-native notifications for TypeScript</h1>
      <p style={{ fontSize: "1.1rem", color: "var(--fg-muted)" }}>
        Define notifications in code. Store state in your own database. Ship
        inbox, email, preferences, and signed unsubscribes — without running
        a notification platform.
      </p>

      <div className="button-row">
        <Link className="primary" href="/docs/installation">
          Get started →
        </Link>
        <Link href="/demo">Live demo</Link>
        <a
          href="https://github.com/reyabsaluja/notifykit"
          target="_blank"
          rel="noreferrer"
        >
          GitHub
        </a>
      </div>

      <h2>Two commands</h2>
      <pre>
        <code>{`npx create-notifykit-app my-app
cd my-app && npm install && npm run dev`}</code>
      </pre>

      <h2>What you get</h2>
      <ul>
        <li>
          <strong>Type-safe <code>notify.send()</code></strong> — wrong
          notification id? Wrong payload shape? TypeScript error, not 3am
          pager.
        </li>
        <li>
          <strong>Your database, your tables</strong> — memory adapter for
          local dev, Drizzle adapter for production. SQLite and Postgres
          supported today — more coming soon.
        </li>
        <li>
          <strong>Inbox + email + webhook</strong> out of the box. Retries,
          fallback channels, and per-recipient quiet hours reuse the same
          pipeline.
        </li>
        <li>
          <strong>Preferences + signed unsubscribe</strong> — HMAC-signed
          links in every email, per-notification granularity, no session
          required to opt out.
        </li>
        <li>
          <strong>Digests + rate limits</strong> — two lines of config. Never
          spam your users.
        </li>
        <li>
          <strong>React hooks</strong> — <code>useInbox()</code>,
          {" "}<code>usePreferences()</code>, <code>&lt;NotificationBell /&gt;</code>.
        </li>
      </ul>

      <h2>Philosophy</h2>
      <p>
        NotifyKit is a framework, not a SaaS. It runs inside your app, writes
        to your database, and calls your providers. There is no hosted
        service, no dashboard, no external workflow editor. The framework&apos;s
        job is to give you a clean, typed runtime and get out of the way.
      </p>
      <p>
        Think PayKit for notifications. Better Auth style DX.
      </p>

      <hr />
      <p style={{ color: "var(--fg-muted)" }}>
        Browse the{" "}
        <Link href="/docs/installation">docs</Link> or try the{" "}
        <Link href="/demo">live demo</Link>.
      </p>
    </article>
  );
}

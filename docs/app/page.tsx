import Link from "next/link";
import { Code } from "./_components/code";

export default function HomePage() {
  return (
    <article>
      <div className="hero">
        <div className="hero-badge">v0.1 &middot; Open Source</div>
        <h1>App-native notifications for TypeScript</h1>
        <p className="hero-subtitle">
          Define notifications in code. Store state in your database.
          Ship inbox, email, preferences, and unsubscribes — no platform required.
        </p>
        <div className="button-row">
          <Link className="primary" href="/docs/installation">
            Get started
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
      </div>

      <Code
        code={`npx create-notifykit-app my-app`}
        lang="bash"
      />

      <div className="features">
        <div className="feature-card">
          <h3>Type-safe sends</h3>
          <p>
            Wrong notification ID or payload shape? TypeScript error at
            compile time.
          </p>
        </div>
        <div className="feature-card">
          <h3>Your database</h3>
          <p>
            Memory for dev, Drizzle for production. SQLite and Postgres
            supported.
          </p>
        </div>
        <div className="feature-card">
          <h3>Multi-channel</h3>
          <p>
            Inbox, email, SMS, webhook. Retries, fallback channels, and
            quiet hours built in.
          </p>
        </div>
        <div className="feature-card">
          <h3>Preferences</h3>
          <p>
            Per-notification granularity. HMAC-signed unsubscribe links.
            RFC 8058 one-click.
          </p>
        </div>
        <div className="feature-card">
          <h3>Digests &amp; rate limits</h3>
          <p>
            Coalesce noisy sends. Hard-cap per window. Two lines of config.
          </p>
        </div>
        <div className="feature-card">
          <h3>React hooks</h3>
          <p>
            useInbox(), usePreferences(), components. Realtime via SSE
            or WebSocket.
          </p>
        </div>
      </div>

      <h2>Define</h2>
      <Code
        filename="lib/notifykit.ts"
        code={`import { channel, createNotifyKit, notification, memoryAdapter, fakeEmailProvider } from "@notifykitjs/core"

const inbox = channel.inbox()
const email = channel.email()

export const commentMentioned = notification({
  id: "comment_mentioned",
  payload: { actorName: "string", postTitle: "string", postUrl: "string" },
  channels: [
    inbox({
      title: "{{actorName}} mentioned you",
      body: "In {{postTitle}}",
      actionUrl: "{{postUrl}}",
    }),
    email({
      subject: "{{actorName}} mentioned you in {{postTitle}}",
      body: "Open {{postUrl}} to reply.\\n\\nUnsubscribe: {{_unsubscribeUrl}}",
    }),
  ],
})

export const notify = createNotifyKit({
  notifications: [commentMentioned] as const,
  database: memoryAdapter(),
  providers: { email: fakeEmailProvider() },
})`}
      />

      <h2>Expose</h2>
      <Code
        filename="app/api/notifykit/[...route]/route.ts"
        code={`import { createRouteHandler } from "@notifykitjs/next"
import { notify } from "@/lib/notifykit"
import { getSessionUserId } from "@/lib/session"

export const { GET, POST, DELETE, OPTIONS, dynamic } = createRouteHandler({
  notifykit: notify,
  identify: () => getSessionUserId(),
})`}
      />

      <h2>Send</h2>
      <Code
        code={`await notify.send({
  recipientId: user.id,
  notificationId: "comment_mentioned",
  payload: {
    actorName: actor.name,
    postTitle: post.title,
    postUrl: \`/posts/\${post.id}\`,
  },
})`}
      />

      <h2>Philosophy</h2>
      <p>
        NotifyKit is a framework, not a SaaS. It runs inside your app, writes
        to your database, and calls your providers directly. No hosted
        service, no dashboard, no external workflow editor.
      </p>
      <p>
        Think Better Auth for notifications. Define in code. Own your data.
      </p>

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

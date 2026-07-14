import Link from "next/link";
import Image from "next/image";
import { Code } from "./_components/code";
import { InstallCommand } from "./_components/install-command";
import { HeroShader } from "./_components/hero-shader";
import { SideShaders } from "./_components/side-shaders";
import { ShaderProvider } from "./_components/shader-source";
import { LandingNav } from "./_components/landing-nav";

export default function HomePage() {
  return (
    <ShaderProvider>
    <div className="landing" data-theme="dark">
      <LandingNav />

      <section className="landing-hero">
        <HeroShader />
        <div className="landing-hero-content">
          <h1>App-native notifications<br />for TypeScript</h1>
          <p className="landing-hero-sub">
            Define notifications in code. Store state in your database.
            Ship inbox, email, preferences, and unsubscribes. No platform required.
          </p>
          <div className="landing-hero-actions">
            <Link className="landing-btn landing-btn-primary" href="/docs/installation">
              Get Started
            </Link>
            <a
              className="landing-btn"
              href="https://github.com/reyabsaluja/notifykit"
              target="_blank"
              rel="noreferrer"
              aria-label="GitHub"
            >
              <svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
              </svg>
            </a>
          </div>
        </div>
        <div className="landing-hero-code">
          <InstallCommand command="npx create-notifykit-app my-app" />
        </div>
      </section>

      <SideShaders />

      <section className="landing-bento">
        <div className="landing-bento-grid">
          <div className="landing-bento-cell landing-bento-title">
            <h2>Everything you need<br />to ship notifications</h2>
          </div>
          <div className="landing-bento-cell">
            <h3>Type-safe sends</h3>
            <p>Wrong notification ID or payload shape? TypeScript error at compile time.</p>
          </div>
          <div className="landing-bento-cell">
            <h3>Your database</h3>
            <p>Memory for dev, Drizzle for production. SQLite and Postgres supported.</p>
          </div>
          <div className="landing-bento-cell">
            <h3>Multi-channel</h3>
            <p>Inbox, email, SMS, webhook. Retries, fallback channels, and quiet hours built in.</p>
          </div>
          <div className="landing-bento-cell">
            <h3>Preferences</h3>
            <p>Per-notification granularity. HMAC-signed unsubscribe links. RFC 8058 one-click.</p>
          </div>
          <div className="landing-bento-cell">
            <h3>Digests &amp; rate limits</h3>
            <p>Coalesce noisy sends. Hard-cap per window. Two lines of config.</p>
          </div>
          <div className="landing-bento-cell">
            <h3>React &amp; Next.js</h3>
            <p>useInbox(), usePreferences(), route handlers, server actions. Realtime via WebSocket.</p>
          </div>
          <div className="landing-bento-cell">
            <h3>Testing &amp; dev mode</h3>
            <p>Block real sends in development. Assert on deliveries in tests. Zero config.</p>
          </div>
        </div>
      </section>

      <section className="landing-showcase">
        <div className="landing-showcase-grid">
          <div className="landing-showcase-info">
            <h3>Define</h3>
            <p>Declare notifications as code. Type-safe payloads, multi-channel delivery, template interpolation.</p>
            <h3>Expose</h3>
            <p>One-line API route. Inbox, preferences, and unsubscribe endpoints handled automatically.</p>
            <h3>Send</h3>
            <p>Trigger from anywhere in your backend. Channels, retries, and preferences resolve at runtime.</p>
          </div>
          <div className="landing-showcase-code">
            <Code
              filename="lib/notifykit.ts"
              code={`import { channel, notification, createNotifyKit } from "@notifykitjs/core"

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
      body: "Open {{postUrl}} to reply.",
    }),
  ],
})

export const notify = createNotifyKit({
  notifications: [commentMentioned] as const,
  database: drizzleSqliteAdapter(db),
  providers: { email: resendProvider({ apiKey, from }) },
})`}
            />
          </div>
        </div>
      </section>

      <section className="landing-result">
        <div className="landing-result-inner">
          <h2>What your users see</h2>
          <p className="landing-result-sub">
            One <code>send()</code> call, multiple delivery surfaces — each respecting the recipient&apos;s preferences.
          </p>
          <div className="landing-result-stage" aria-label="Notification delivery surfaces">
            <span className="landing-result-gridlines" aria-hidden="true" />
            <span className="landing-result-beam landing-result-beam-inbox" aria-hidden="true" />
            <span className="landing-result-beam landing-result-beam-email" aria-hidden="true" />
            <span className="landing-result-beam landing-result-beam-pref" aria-hidden="true" />
            <span className="landing-result-beam landing-result-beam-badge" aria-hidden="true" />
            <span className="landing-result-beam landing-result-beam-digest" aria-hidden="true" />

            <div className="landing-result-core">
              <span className="landing-result-core-kicker">notify.send</span>
              <strong>comment.mentioned</strong>
              <span>payload resolved once</span>
            </div>

            <article className="landing-result-object landing-result-object-inbox">
              <div className="landing-result-object-inner">
                <span className="landing-result-tag">In-app inbox</span>
                <strong>Rey mentioned you</strong>
                <span>In Launch Plan</span>
                <div className="landing-result-status">
                  <span className="landing-result-status-dot" />
                  Realtime unread +1
                </div>
              </div>
            </article>

            <article className="landing-result-object landing-result-object-email">
              <div className="landing-result-object-inner">
                <span className="landing-result-tag">Email</span>
                <strong>Rey mentioned you in Launch Plan</strong>
                <span>Open /posts/42 to reply.</span>
                <small>Signed unsubscribe included</small>
              </div>
            </article>

            <article className="landing-result-object landing-result-object-pref">
              <div className="landing-result-object-inner">
                <span className="landing-result-tag">Preferences</span>
                <div className="landing-result-pref-row">
                  <span>Comment mentions</span>
                  <span className="landing-result-switch landing-result-switch-on" />
                </div>
                <div className="landing-result-pref-row">
                  <span>Marketing updates</span>
                  <span className="landing-result-switch" />
                </div>
              </div>
            </article>

            <aside className="landing-result-object landing-result-object-badge" aria-label="Unread count badge">
              <div className="landing-result-object-inner">
                <span>Unread badge</span>
                <strong>3</strong>
              </div>
            </aside>

            <aside className="landing-result-object landing-result-object-digest" aria-label="Digest delivery">
              <div className="landing-result-object-inner">
                <span>Digest</span>
                <strong>5 comments batched</strong>
                <small>delivers at 9:00</small>
              </div>
            </aside>
          </div>
        </div>
      </section>

      <section className="landing-flow">
        <div className="landing-flow-grid">
          <div className="landing-flow-step">
            <div className="landing-flow-header">
              <span className="landing-flow-number">1</span>
              <h3>Define</h3>
            </div>
            <Code
              filename="lib/notifications.ts"
              code={`export const invite = notification({
  id: "invite",
  payload: { name: "string" },
  channels: [inbox({ title: "{{name}} invited you" }),
             email({ subject: "You're invited", body: "Open the app to respond." })],
})`}
            />
          </div>
          <div className="landing-flow-step">
            <div className="landing-flow-header">
              <span className="landing-flow-number">2</span>
              <h3>Send</h3>
            </div>
            <Code
              filename="app/api/invite/route.ts"
              code={`await notify.send({
  recipientId: "user_123",
  notificationId: "invite",
  payload: { name: "Rey" },
})`}
            />
          </div>
          <div className="landing-flow-step">
            <div className="landing-flow-header">
              <span className="landing-flow-number">3</span>
              <h3>Deliver</h3>
            </div>
            <Code
              filename="channels resolved at runtime"
              code={`✓ Inbox    → stored in your database
✓ Email   → sent via Resend
✗ SMS     → user opted out (preferences)`}
            />
          </div>
        </div>
      </section>

      <footer className="landing-footer">
        <div className="landing-footer-inner">
          <span className="landing-footer-brand">
            <Image src="/logo.png" alt="" width={18} height={18} />
            NotifyKit
          </span>
          <div className="landing-footer-links">
            <a
              href="https://x.com/reyabsaluja"
              target="_blank"
              rel="noreferrer"
            >
              Author
            </a>
            <Link href="/docs/installation">Docs</Link>
            <a
              href="https://github.com/reyabsaluja/notifykit"
              target="_blank"
              rel="noreferrer"
            >
              GitHub
            </a>
            <a
              href="https://www.npmjs.com/org/notifykitjs"
              target="_blank"
              rel="noreferrer"
            >
              npm
            </a>
          </div>
        </div>
      </footer>
    </div>
    </ShaderProvider>
  );
}

import Link from "next/link";
import Image from "next/image";
import { Code } from "./_components/code";
import { InstallCommand } from "./_components/install-command";
import { HeroShader } from "./_components/hero-shader";
import { SideShaders } from "./_components/side-shaders";

export default function HomePage() {
  return (
    <div className="landing" data-theme="dark">
      <nav className="landing-nav">
        <Link href="/" className="landing-nav-logo">
          <Image src="/logo.png" alt="NotifyKit" width={24} height={24} />
          NotifyKit
        </Link>
        <div className="landing-nav-links">
          <Link href="/docs/installation">Docs</Link>
          <Link href="/demo">Demo</Link>
          <a
            href="https://github.com/reyabsaluja/notifykit"
            target="_blank"
            rel="noreferrer"
            aria-label="GitHub"
          >
            <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
            </svg>
          </a>
        </div>
      </nav>

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

      <section className="landing-philosophy">
        <div className="landing-philosophy-inner">
          <h2>Not a platform. A framework.</h2>
          <p>
            NotifyKit runs inside your app, writes to your database, and calls your providers directly.
            No hosted service, no dashboard, no external workflow editor.
          </p>
          <p className="landing-philosophy-tagline">
            Think Better Auth for notifications. Define in code. Own your data.
          </p>
        </div>
      </section>

      <section className="landing-packages">
        <h2>Packages</h2>
        <div className="landing-packages-grid">
          <div className="landing-package">
            <code>@notifykitjs/core</code>
            <span>Engine — notifications, channels, delivery</span>
          </div>
          <div className="landing-package">
            <code>@notifykitjs/react</code>
            <span>React hooks and components</span>
          </div>
          <div className="landing-package">
            <code>@notifykitjs/next</code>
            <span>Next.js route handler &amp; middleware</span>
          </div>
          <div className="landing-package">
            <code>@notifykitjs/drizzle</code>
            <span>SQLite + Postgres adapters</span>
          </div>
          <div className="landing-package">
            <code>@notifykitjs/resend</code>
            <span>Resend email provider</span>
          </div>
          <div className="landing-package">
            <code>@notifykitjs/testing</code>
            <span>Test harness &amp; assertions</span>
          </div>
          <div className="landing-package">
            <code>@notifykitjs/realtime-ws</code>
            <span>WebSocket real-time</span>
          </div>
          <div className="landing-package">
            <code>@notifykitjs/cli</code>
            <span>Validate definitions at build time</span>
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
  );
}

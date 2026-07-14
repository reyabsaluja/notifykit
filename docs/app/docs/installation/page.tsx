import type { Metadata } from "next";
import Link from "next/link";
import { Code } from "../../_components/code";

export const metadata: Metadata = { title: "Installation" };

export default function InstallationPage() {
  return (
    <article>
      <h1>Installation</h1>
      <p>
        Two paths to get started — pick based on where you are:
      </p>

      <div className="features">
        <div className="feature-card">
          <h3>New project</h3>
          <p>Use the starter scaffold. A full Next.js app with notifications wired end-to-end. Best for exploring or starting fresh.</p>
        </div>
        <div className="feature-card">
          <h3>Existing app</h3>
          <p>Install the packages and add three files. Best when you&apos;re adding notifications to something already running.</p>
        </div>
      </div>

      <h2>Starter scaffold</h2>
      <Code
        lang="bash"
        code={`npx create-notifykit-app my-app
cd my-app
cp .env.example .env.local
# generate a 32-byte hex secret:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# paste as NOTIFYKIT_SECRET in .env.local

npm install
npm run dev`}
      />
      <p>
        Open <code>http://localhost:3000</code>. Sign in as the demo user,
        send yourself a test notification, manage preferences at{" "}
        <code>/settings/notifications</code>. The scaffold uses the in-memory
        adapter and a fake email provider so it works offline.
      </p>

      <h3>Scaffold file map</h3>
      <p>
        Here&apos;s what the generated project looks like and where to
        find each piece:
      </p>
      <table>
        <thead>
          <tr><th>File</th><th>What it does</th><th>Edit when</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><code>lib/notifykit.ts</code></td>
            <td>NotifyKit instance + notification definitions</td>
            <td>Adding notifications, swapping database/provider</td>
          </tr>
          <tr>
            <td><code>lib/notifications/*.ts</code></td>
            <td>Individual notification definitions (one per file)</td>
            <td>Modifying payload, channels, or adding new notifications</td>
          </tr>
          <tr>
            <td><code>app/api/notifykit/[...route]/route.ts</code></td>
            <td>REST handler — inbox, preferences, SSE, unsubscribe</td>
            <td>Changing auth, adding CORS, protecting routes</td>
          </tr>
          <tr>
            <td><code>app/layout.tsx</code></td>
            <td><code>&lt;NotifyKitProvider&gt;</code> wrapper</td>
            <td>Changing <code>baseUrl</code> or conditional rendering</td>
          </tr>
          <tr>
            <td><code>app/settings/notifications/page.tsx</code></td>
            <td>Preferences UI with per-channel toggles</td>
            <td>Customizing the settings layout or adding categories</td>
          </tr>
          <tr>
            <td><code>components/notification-bell.tsx</code></td>
            <td>Bell icon + dropdown inbox</td>
            <td>Styling, adding animations, changing dropdown behavior</td>
          </tr>
          <tr>
            <td><code>.env.example</code></td>
            <td>Required env vars with comments</td>
            <td>Adding provider API keys for production</td>
          </tr>
        </tbody>
      </table>
      <div className="callout callout-tip">
        <strong>Start in <code>lib/notifykit.ts</code>.</strong> That&apos;s
        the one file that controls everything — your notification definitions,
        database adapter, and provider config. Edit it, save, and the dev
        server hot-reloads. The rest of the scaffold just wires things up.
      </div>

      <h2>Or install into an existing Next.js app</h2>
      <Code
        lang="bash"
        code={`npm install @notifykitjs/core @notifykitjs/next @notifykitjs/react`}
      />
      <p>A minimal setup needs three files:</p>

      <Code
        filename="lib/notifykit.ts"
        code={`import {
  channel,
  createNotifyKit,
  fakeEmailProvider,
  memoryAdapter,
  notification,
} from "@notifykitjs/core"

const inbox = channel.inbox()
const email = channel.email()

export const commentMentioned = notification({
  id: "comment_mentioned",
  payload: { actorName: "string", postUrl: "string" },
  channels: [
    inbox({ title: "{{actorName}} mentioned you" }),
    email({
      subject: "{{actorName}} mentioned you",
      body: "Open {{postUrl}} to reply.\\n\\n---\\nUnsubscribe: {{_unsubscribeUrl}}",
    }),
  ],
})

export const notify = createNotifyKit({
  notifications: [commentMentioned] as const,
  database: memoryAdapter(),
  providers: { email: fakeEmailProvider() },
  unsubscribe: {
    secret: process.env.NOTIFYKIT_SECRET!,
    baseUrl: "http://localhost:3000/api/notifykit",
  },
})`}
      />
      <Code
        filename="app/api/notifykit/[...route]/route.ts"
        code={`import { createRouteHandler } from "@notifykitjs/next"
import { notify } from "@/lib/notifykit"
import { getCurrentUserId } from "@/lib/session"

export const { GET, POST, DELETE, OPTIONS, dynamic } = createRouteHandler({
  notifykit: notify,
  identify: () => getCurrentUserId(),
  unsubscribeSecret: process.env.NOTIFYKIT_SECRET,
})`}
      />
      <Code
        filename="app/layout.tsx"
        code={`import { NotifyKitProvider } from "@notifykitjs/react"

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        <NotifyKitProvider options={{ baseUrl: "/api/notifykit" }}>
          {children}
        </NotifyKitProvider>
      </body>
    </html>
  )
}`}
      />

      <h2>Verify it works</h2>
      <p>
        After adding those three files, start the dev server and hit the
        health endpoint:
      </p>
      <Code
        lang="bash"
        code={`npm run dev
curl http://localhost:3000/api/notifykit/notifications`}
      />
      <p>
        You should see a JSON array of your registered notifications:
      </p>
      <Code
        code={`[{ "id": "comment_mentioned", "channels": ["inbox", "email"], ... }]`}
      />
      <table>
        <thead>
          <tr><th>What you see</th><th>What it means</th><th>If it fails</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>JSON array with your notification IDs</td>
            <td>Handler is wired up and NotifyKit instance is loading</td>
            <td>—</td>
          </tr>
          <tr>
            <td><code>404</code></td>
            <td>Route not found</td>
            <td>Check the file is at <code>app/api/notifykit/[...route]/route.ts</code></td>
          </tr>
          <tr>
            <td><code>500</code> / module error</td>
            <td>Import or config issue</td>
            <td>Check the terminal — usually a missing env var or bad import path</td>
          </tr>
        </tbody>
      </table>

      <h2>Send your first notification</h2>
      <p>
        The handler responds — now verify the full pipeline. Run this
        one-off script to create a recipient, send a notification, and
        confirm it landed in the inbox:
      </p>
      <Code
        code={`// scripts/verify-setup.ts — run with: npx tsx scripts/verify-setup.ts
import { notify } from "../lib/notifykit"

async function main() {
  // 1. Create a test recipient
  await notify.upsertRecipient({ id: "test_user", email: "you@example.com" })

  // 2. Send a notification
  const result = await notify.send({
    recipientId: "test_user",
    notificationId: "comment_mentioned",
    payload: { actorName: "Setup Script", postUrl: "/test" },
  })

  // 3. Verify it worked
  const inbox = await notify.inbox.list("test_user")

  console.log("Deliveries:", result.deliveries.length)
  console.log("Inbox items:", inbox.length)
  console.log("First item:", inbox[0]?.title)
}

main()`}
      />
      <div className="features">
        <div className="feature-card">
          <h3>Deliveries: 1+</h3>
          <p>
            At least one delivery record means the channel pipeline
            ran. If 0, check that your notification has channels defined.
          </p>
        </div>
        <div className="feature-card">
          <h3>Inbox items: 1</h3>
          <p>
            The inbox item was written. If 0, ensure your notification
            includes an <code>inbox()</code> channel.
          </p>
        </div>
        <div className="feature-card">
          <h3>Title matches template</h3>
          <p>
            &quot;Setup Script mentioned you&quot; confirms payload
            interpolation works. If raw <code>{`{{actorName}}`}</code> appears,
            check your template syntax.
          </p>
        </div>
      </div>
      <div className="callout callout-tip">
        <strong>This script uses the in-memory adapter</strong> — data
        disappears on restart. That&apos;s expected for dev. Once you see
        all three checks pass, your setup is correct end-to-end.
      </div>

      <h2>What to add next</h2>
      <p>
        You have a working setup — now grow it incrementally. Each step is
        independent; add them in any order as your app needs them:
      </p>
      <div className="overview-flow">
        <div className="overview-flow-step">
          <span className="overview-flow-number">1</span>
          <div>
            <strong>Define your notifications</strong>
            <p>Create typed definitions with payloads and channel templates. You&apos;ll call <code>send()</code> against these.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">2</span>
          <div>
            <strong>Add inbox UI</strong>
            <p>Drop in <code>useInbox()</code> and <code>useUnreadCount()</code> for a notification bell. Works with zero config.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">3</span>
          <div>
            <strong>Swap to a real database</strong>
            <p>Install <code>@notifykitjs/drizzle</code> and switch to SQLite or Postgres. Data now survives restarts.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">4</span>
          <div>
            <strong>Connect an email provider</strong>
            <p>Install <code>@notifykitjs/resend</code> (or build a custom provider). Emails start reaching real inboxes.</p>
          </div>
        </div>
      </div>
      <table>
        <thead>
          <tr><th>When you need</th><th>Add this</th><th>Docs</th></tr>
        </thead>
        <tbody>
          <tr><td>Typed notification definitions</td><td>Notification definitions in <code>lib/notifications/</code></td><td><Link href="/docs/defining">Defining</Link></td></tr>
          <tr><td>In-app notification bell</td><td><code>useInbox()</code> + <code>useUnreadCount()</code></td><td><Link href="/docs/react">React hooks</Link></td></tr>
          <tr><td>Persistent state</td><td><code>@notifykitjs/drizzle</code> adapter</td><td><Link href="/docs/database">Database</Link></td></tr>
          <tr><td>Real email delivery</td><td><code>@notifykitjs/resend</code> provider</td><td><Link href="/docs/providers">Providers</Link></td></tr>
          <tr><td>User opt-outs</td><td>Preferences UI with <code>usePreferences()</code></td><td><Link href="/docs/preferences">Preferences</Link></td></tr>
          <tr><td>Noise control</td><td><code>rateLimit</code> + <code>digest</code> on definitions</td><td><Link href="/docs/digests">Digests</Link></td></tr>
          <tr><td>Multi-instance deploys</td><td><code>@notifykitjs/realtime-pg</code></td><td><Link href="/docs/realtime">Realtime</Link></td></tr>
        </tbody>
      </table>
      <div className="callout callout-tip">
        <strong>Each piece is additive.</strong> Adding a database doesn&apos;t
        change your notification definitions. Adding email doesn&apos;t change
        your inbox code. You can ship each step independently without touching
        what you built before.
      </div>

      <h2>Requirements</h2>
      <table>
        <thead>
          <tr><th>Dependency</th><th>Minimum</th><th>Notes</th></tr>
        </thead>
        <tbody>
          <tr><td>Node.js</td><td>18+</td><td>Or any runtime with <code>fetch</code> + <code>crypto</code> (Bun, Deno, Cloudflare Workers)</td></tr>
          <tr><td>TypeScript</td><td>5.0+</td><td>Required for full type inference on <code>send()</code></td></tr>
          <tr><td>Next.js</td><td>14+ (App Router)</td><td>Only if using the handler and React bindings. Core works anywhere.</td></tr>
        </tbody>
      </table>
      <div className="callout callout-tip">
        <strong>Not on Next.js?</strong> The route handler uses standard{" "}
        Web <code>Request</code>/<code>Response</code> — it works with Hono, Express
        (via adapter), SvelteKit, or any framework that supports the Fetch API.
      </div>

      <h2>Packages</h2>
      <table>
        <thead>
          <tr><th>Package</th><th>Purpose</th><th>When to install</th></tr>
        </thead>
        <tbody>
          <tr><td><code>@notifykitjs/core</code></td><td>Engine, channels, providers, types</td><td><strong>Always</strong></td></tr>
          <tr><td><code>@notifykitjs/next</code></td><td>Route handler, server actions</td><td>Next.js apps with client-facing API</td></tr>
          <tr><td><code>@notifykitjs/react</code></td><td>Hooks, components, client SDK</td><td>Building notification UI in React</td></tr>
          <tr><td><code>@notifykitjs/drizzle</code></td><td>SQLite + Postgres adapters</td><td>Persisting state beyond in-memory</td></tr>
          <tr><td><code>@notifykitjs/resend</code></td><td>Resend email provider</td><td>Sending real emails via Resend</td></tr>
          <tr><td><code>@notifykitjs/realtime-pg</code></td><td>PostgreSQL NOTIFY adapter</td><td>Multi-instance deploys with Postgres</td></tr>
          <tr><td><code>@notifykitjs/realtime-ws</code></td><td>WebSocket adapter</td><td>Custom transports, high connection counts</td></tr>
        </tbody>
      </table>
      <div className="callout callout-tip">
        <strong>Minimum install: 3 packages.</strong> Most Next.js apps start
        with <code>core</code> + <code>next</code> + <code>react</code>. Add{" "}
        <code>drizzle</code> when you need persistence and a provider package
        when you&apos;re ready to send real emails.
      </div>

      <h2>Environment variables</h2>
      <p>
        NotifyKit needs very few environment variables. Here&apos;s a consolidated
        reference — copy into your <code>.env.local</code> and fill in values:
      </p>
      <Code
        filename=".env.local"
        code={`# ─── Required ────────────────────────────────────────────
NOTIFYKIT_SECRET=           # 32-byte hex string (signs unsubscribe links + tokens)

# ─── Database (pick one) ─────────────────────────────────
DATABASE_URL=               # Postgres connection string (if using drizzlePostgresAdapter)
# Or: omit entirely for memoryAdapter() / SQLite file path

# ─── Email provider (pick one) ───────────────────────────
RESEND_API_KEY=             # If using @notifykitjs/resend
RESEND_FROM=                # Sender address: "App Name <noreply@app.com>"
# Or: omit for fakeEmailProvider() in dev

# ─── SMS provider (optional) ─────────────────────────────
TWILIO_ACCOUNT_SID=         # If using a Twilio-based SMS provider
TWILIO_AUTH_TOKEN=
TWILIO_FROM=                # Your Twilio phone number

# ─── Webhooks (optional) ─────────────────────────────────
WEBHOOK_SIGNING_SECRET=     # Shared secret for outbound webhook signatures`}
      />
      <table>
        <thead>
          <tr><th>Variable</th><th>Required</th><th>Used by</th><th>Format</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><code>NOTIFYKIT_SECRET</code></td>
            <td>Yes</td>
            <td>Unsubscribe links, token signing</td>
            <td>64-char hex (32 bytes). Generate with <code>node -e &quot;...&quot;</code></td>
          </tr>
          <tr>
            <td><code>DATABASE_URL</code></td>
            <td>Production only</td>
            <td>Drizzle Postgres adapter</td>
            <td><code>postgresql://user:pass@host:5432/db</code></td>
          </tr>
          <tr>
            <td><code>RESEND_API_KEY</code></td>
            <td>If sending email</td>
            <td><code>@notifykitjs/resend</code></td>
            <td><code>re_...</code> (from Resend dashboard)</td>
          </tr>
          <tr>
            <td><code>RESEND_FROM</code></td>
            <td>If sending email</td>
            <td><code>resendProvider()</code></td>
            <td><code>&quot;Name &lt;email@domain&gt;&quot;</code> (must be verified domain)</td>
          </tr>
          <tr>
            <td><code>WEBHOOK_SIGNING_SECRET</code></td>
            <td>If using webhooks</td>
            <td><code>webhookProvider()</code></td>
            <td>Any strong random string (32+ chars)</td>
          </tr>
        </tbody>
      </table>

      <h3>Per-environment setup</h3>
      <p>
        Match your env vars to your deployment stage. Most teams need three
        configurations:
      </p>
      <table>
        <thead>
          <tr><th>Stage</th><th>Database</th><th>Email</th><th>Secret</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Local dev</strong></td>
            <td>Memory (no <code>DATABASE_URL</code>)</td>
            <td>Fake (no <code>RESEND_API_KEY</code>)</td>
            <td>Any hex string — never leaves your machine</td>
          </tr>
          <tr>
            <td><strong>CI / Tests</strong></td>
            <td>Memory (fastest)</td>
            <td>Fake</td>
            <td>Hardcoded test value in CI config</td>
          </tr>
          <tr>
            <td><strong>Staging</strong></td>
            <td>Postgres (shared staging DB)</td>
            <td>Resend test mode or a sandbox domain</td>
            <td>Unique per environment — rotate on compromise</td>
          </tr>
          <tr>
            <td><strong>Production</strong></td>
            <td>Postgres (production DB)</td>
            <td>Resend with verified domain</td>
            <td>Stored in secrets manager (Vercel, AWS SSM, Vault)</td>
          </tr>
        </tbody>
      </table>

      <div className="callout callout-warn">
        <strong>Never share <code>NOTIFYKIT_SECRET</code> across environments.</strong>{" "}
        Unsubscribe tokens signed with the staging secret are valid in staging
        only. If you reuse the same secret in production, a leaked staging token
        could unsubscribe production users. Generate a unique secret per environment.
      </div>

      <Code
        code={`// Pattern: environment-aware config in lib/notifykit.ts
import { createNotifyKit, memoryAdapter, fakeEmailProvider } from "@notifykitjs/core"
import { drizzlePostgresAdapter } from "@notifykitjs/drizzle"
import { resendProvider } from "@notifykitjs/resend"

const isProd = process.env.NODE_ENV === "production"

export const notify = createNotifyKit({
  notifications: [...] as const,

  database: isProd
    ? drizzlePostgresAdapter(db)
    : memoryAdapter(),

  providers: {
    email: process.env.RESEND_API_KEY
      ? resendProvider({ apiKey: process.env.RESEND_API_KEY, from: process.env.RESEND_FROM! })
      : fakeEmailProvider(),
  },

  unsubscribe: {
    secret: process.env.NOTIFYKIT_SECRET!,
    baseUrl: isProd
      ? "https://yourapp.com/api/notifykit"
      : "http://localhost:3000/api/notifykit",
  },
})`}
      />
      <div className="callout callout-tip">
        <strong>Feature-flag by env var presence, not by <code>NODE_ENV</code>.</strong>{" "}
        Checking <code>process.env.RESEND_API_KEY</code> means you can test with
        real email locally by adding the key to <code>.env.local</code> — without
        changing any code. Same adapter, different credentials.
      </div>

      <h2>Monorepo setup</h2>
      <p>
        In a monorepo (Turborepo, Nx, pnpm workspaces), your NotifyKit instance,
        route handler, and React UI typically live in separate packages. The key
        is putting notification definitions in a shared package so both server
        and client apps can import them without duplication.
      </p>
      <table>
        <thead>
          <tr><th>Package</th><th>Contains</th><th>Depends on</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><code>packages/notifications</code></td>
            <td>NotifyKit instance, notification definitions, recipient helpers</td>
            <td><code>@notifykitjs/core</code>, <code>@notifykitjs/drizzle</code></td>
          </tr>
          <tr>
            <td><code>apps/api</code> (or <code>apps/web</code>)</td>
            <td>Route handler, server actions, <code>identify()</code></td>
            <td><code>@notifykitjs/next</code>, <code>packages/notifications</code></td>
          </tr>
          <tr>
            <td><code>apps/web</code> (frontend)</td>
            <td><code>&lt;NotifyKitProvider&gt;</code>, hooks, inbox UI</td>
            <td><code>@notifykitjs/react</code></td>
          </tr>
          <tr>
            <td><code>apps/worker</code> (optional)</td>
            <td>Background jobs that call <code>notify.send()</code></td>
            <td><code>packages/notifications</code></td>
          </tr>
        </tbody>
      </table>
      <Code
        code={`// packages/notifications/src/index.ts
import { createNotifyKit, channel, notification } from "@notifykitjs/core"
import { drizzlePostgresAdapter } from "@notifykitjs/drizzle"
import { db } from "./db"

const inbox = channel.inbox()
const email = channel.email()

export const commentMentioned = notification({
  id: "comment_mentioned",
  payload: { actorName: "string", postUrl: "string" },
  channels: [
    inbox({ title: "{{actorName}} mentioned you" }),
    email({ subject: "{{actorName}} mentioned you", body: "Open {{postUrl}}" }),
  ],
})

export const notify = createNotifyKit({
  notifications: [commentMentioned] as const,
  database: drizzlePostgresAdapter(db),
  providers: { email: process.env.RESEND_API_KEY ? resendProvider({...}) : fakeEmailProvider() },
  unsubscribe: { secret: process.env.NOTIFYKIT_SECRET!, baseUrl: process.env.NOTIFYKIT_BASE_URL! },
})`}
      />
      <Code
        code={`// apps/web/app/api/notifykit/[...route]/route.ts
import { createRouteHandler } from "@notifykitjs/next"
import { notify } from "@acme/notifications"  // ← internal package
import { auth } from "@/lib/auth"

export const { GET, POST, DELETE, OPTIONS, dynamic } = createRouteHandler({
  notifykit: notify,
  identify: async (request) => {
    const session = await auth(request)
    if (!session) return null
    return { recipientId: session.user.id, tenantId: session.orgId }
  },
})`}
      />
      <div className="callout callout-warn">
        <strong>Don&apos;t import <code>@notifykitjs/core</code> from the frontend.</strong>{" "}
        The shared <code>packages/notifications</code> package contains server-only
        code (database connections, secrets). Only the route handler and background
        workers should import it. The frontend only needs <code>@notifykitjs/react</code>{" "}
        and talks to NotifyKit through the REST API.
      </div>
      <table>
        <thead>
          <tr><th>Pitfall</th><th>Symptom</th><th>Fix</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>Importing <code>notify</code> in a client component</td>
            <td>Build error: <code>pg</code> / <code>crypto</code> not available in browser</td>
            <td>Only import from <code>packages/notifications</code> in server code. Frontend uses hooks.</td>
          </tr>
          <tr>
            <td>Missing env vars in the shared package</td>
            <td><code>NOTIFYKIT_SECRET is undefined</code> at runtime</td>
            <td>Env vars resolve in the consuming app, not the package. Add them to each app&apos;s <code>.env</code>.</td>
          </tr>
          <tr>
            <td>TypeScript path aliases don&apos;t resolve</td>
            <td><code>Cannot find module &apos;@acme/notifications&apos;</code></td>
            <td>Configure <code>transpilePackages</code> in <code>next.config.js</code> or set up proper <code>exports</code> in the package&apos;s <code>package.json</code>.</td>
          </tr>
          <tr>
            <td>Multiple NotifyKit instances across workers</td>
            <td>Dedup and rate limits don&apos;t work (each instance has its own memory)</td>
            <td>With in-memory, all callers must share the same process. Use Postgres adapter for multi-process setups.</td>
          </tr>
        </tbody>
      </table>
      <Code
        filename="apps/web/next.config.js"
        code={`/** @type {import('next').NextConfig} */
module.exports = {
  // Tell Next.js to transpile the internal package
  transpilePackages: ["@acme/notifications"],
}`}
      />
      <div className="callout callout-tip">
        <strong>Test from the shared package.</strong> Write your notification
        unit tests (using <code>explain()</code> and <code>memoryAdapter()</code>)
        inside <code>packages/notifications</code>. They run without starting any
        app — fast feedback on routing logic, dedup keys, and preference resolution.
      </div>

      <h2>Troubleshooting setup</h2>
      <p>
        Stuck during installation? These are the most common issues and their
        one-line fixes:
      </p>
      <table>
        <thead>
          <tr><th>Error / symptom</th><th>Cause</th><th>Fix</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><code>Cannot find module &apos;@notifykitjs/core&apos;</code></td>
            <td>Package not installed or wrong workspace</td>
            <td>Run <code>npm install @notifykitjs/core</code> in the correct directory</td>
          </tr>
          <tr>
            <td><code>NOTIFYKIT_SECRET is undefined</code></td>
            <td>Missing <code>.env.local</code> or env not loaded</td>
            <td>Create <code>.env.local</code> with <code>NOTIFYKIT_SECRET=&lt;32-byte hex&gt;</code>. Restart the dev server.</td>
          </tr>
          <tr>
            <td><code>TypeError: notify.send is not a function</code></td>
            <td>Importing the config object instead of the instance</td>
            <td>Make sure you export and import the result of <code>createNotifyKit()</code>, not the options object</td>
          </tr>
          <tr>
            <td>Route returns <code>405 Method Not Allowed</code></td>
            <td>Missing HTTP method export</td>
            <td>Export all methods: <code>{`export const { GET, POST, DELETE, OPTIONS, dynamic } = createRouteHandler(...)`}</code></td>
          </tr>
          <tr>
            <td><code>Error: No notifications registered</code></td>
            <td>Empty or non-<code>const</code> notification array</td>
            <td>Pass at least one notification and use <code>as const</code>: <code>{`notifications: [...] as const`}</code></td>
          </tr>
          <tr>
            <td>TypeScript: <code>Argument not assignable to parameter</code> on <code>send()</code></td>
            <td>Missing <code>as const</code> on the notifications array</td>
            <td>Add <code>as const</code> — without it, TypeScript widens IDs to <code>string</code> and loses type safety</td>
          </tr>
          <tr>
            <td>SSE connection drops immediately</td>
            <td>Next.js static optimization caching the route</td>
            <td>Export <code>dynamic</code> from the route handler — it sets <code>export const dynamic = &apos;force-dynamic&apos;</code></td>
          </tr>
          <tr>
            <td>Hooks return <code>status: &quot;error&quot;</code> with 401</td>
            <td><code>identify()</code> can&apos;t read the session cookie</td>
            <td>Verify cookies are sent — check <code>credentials: &quot;include&quot;</code> and same-origin. Cross-origin needs CORS config.</td>
          </tr>
        </tbody>
      </table>
      <div className="callout callout-tip">
        <strong>Generate a secret in one line:</strong>{" "}
        <code>node -e &quot;console.log(require(&apos;crypto&apos;).randomBytes(32).toString(&apos;hex&apos;))&quot;</code>{" "}
        — paste the output into <code>.env.local</code>. Never commit secrets
        to git.
      </div>

      <h3>Checklist before asking for help</h3>
      <table>
        <thead>
          <tr><th>Check</th><th>Command</th><th>Expected</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>Packages installed</td>
            <td><code>npm ls @notifykitjs/core</code></td>
            <td>Shows version number, no <code>MISSING</code></td>
          </tr>
          <tr>
            <td>Env loaded</td>
            <td><code>echo $NOTIFYKIT_SECRET</code> (or check Next.js log)</td>
            <td>Non-empty 64-char hex string</td>
          </tr>
          <tr>
            <td>Route handler responding</td>
            <td><code>curl http://localhost:3000/api/notifykit/notifications</code></td>
            <td>JSON array (even if empty)</td>
          </tr>
          <tr>
            <td>TypeScript compiles</td>
            <td><code>npx tsc --noEmit</code></td>
            <td>No errors in notifykit files</td>
          </tr>
        </tbody>
      </table>

      <div className="button-row">
        <Link href="/docs/quickstart" className="primary">Quickstart guide</Link>
        <Link href="/docs/nextjs">Next.js integration</Link>
        <Link href="/docs/defining">Define notifications</Link>
      </div>

      <div className="page-nav">
        <Link href="/">
          <span className="page-nav-label">Previous</span>
          <span className="page-nav-title">Overview</span>
        </Link>
        <Link href="/docs/quickstart">
          <span className="page-nav-label">Next</span>
          <span className="page-nav-title">Quickstart</span>
        </Link>
      </div>
    </article>
  );
}

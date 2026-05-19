import type { Metadata } from "next";
import Link from "next/link";
import { Code } from "../../_components/code";

export const metadata: Metadata = { title: "Installation" };

export default function InstallationPage() {
  return (
    <article>
      <h1>Installation</h1>
      <p>
        The fastest path to a working NotifyKit app is the starter scaffold.
        It&apos;s a standard Next.js app with everything wired up.
      </p>

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

      <h2>Requirements</h2>
      <ul>
        <li>
          Node 18+ or another runtime with <code>fetch</code> and
          Node-compatible <code>crypto</code> APIs.
        </li>
        <li>TypeScript 5.0+ for full type inference.</li>
        <li>
          Next.js 14+ (App Router) if you&apos;re using the handler and React
          bindings. Other frameworks work too — the handler is plain Web
          Request/Response.
        </li>
      </ul>

      <h2>Packages</h2>
      <table>
        <thead>
          <tr><th>Package</th><th>Purpose</th></tr>
        </thead>
        <tbody>
          <tr><td><code>@notifykitjs/core</code></td><td>Engine, channels, providers, types</td></tr>
          <tr><td><code>@notifykitjs/next</code></td><td>Route handler, server actions, middleware</td></tr>
          <tr><td><code>@notifykitjs/react</code></td><td>Hooks, components, client SDK</td></tr>
          <tr><td><code>@notifykitjs/drizzle</code></td><td>SQLite + Postgres database adapters</td></tr>
          <tr><td><code>@notifykitjs/resend</code></td><td>Resend email provider</td></tr>
          <tr><td><code>@notifykitjs/realtime-pg</code></td><td>PostgreSQL NOTIFY realtime adapter</td></tr>
          <tr><td><code>@notifykitjs/realtime-ws</code></td><td>WebSocket realtime adapter</td></tr>
        </tbody>
      </table>

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

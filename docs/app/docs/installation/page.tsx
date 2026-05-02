import type { Metadata } from "next";
import Link from "next/link";

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
      <pre>
        <code>{`npx create-notifykit-app my-app
cd my-app
cp .env.example .env.local
# generate a 32-byte hex secret and paste as NOTIFYKIT_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

npm install
npm run dev`}</code>
      </pre>
      <p>
        Open <code>http://localhost:3000</code>. Sign in as the demo user,
        send yourself a test notification, manage preferences at{" "}
        <code>/settings/notifications</code>. The scaffold uses the in-memory
        adapter and a fake email provider so it works offline before any
        secrets are configured.
      </p>

      <h2>Or install into an existing Next.js app</h2>
      <pre>
        <code>{`npm install notifykit @notifykit/next notifykit-react`}</code>
      </pre>
      <p>A minimal setup:</p>
      <pre>
        <code>{`// lib/notifykit.ts
import {
  channel,
  createNotifyKit,
  fakeEmailProvider,
  memoryAdapter,
  notification,
} from "notifykit"

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
  notifications: [commentMentioned],
  database: memoryAdapter(),
  providers: { email: fakeEmailProvider() },
  unsubscribe: {
    secret: process.env.NOTIFYKIT_SECRET!,
    baseUrl: "http://localhost:3000/api/notifykit",
  },
})`}</code>
      </pre>
      <pre>
        <code>{`// app/api/notifykit/[...route]/route.ts
import { createRouteHandler } from "@notifykit/next"
import { notify } from "@/lib/notifykit"
import { getCurrentUserId } from "@/lib/session"

export const { GET, POST, DELETE, OPTIONS } = createRouteHandler({
  notifykit: notify,
  identify: () => getCurrentUserId(),
  unsubscribeSecret: process.env.NOTIFYKIT_SECRET,
})`}</code>
      </pre>
      <pre>
        <code>{`// middleware.ts (optional — adds CORS for cross-origin clients)
import { createNotifyKitMiddleware } from "@notifykit/next/middleware"
import type { NextRequest } from "next/server"

const withNotifyKit = createNotifyKitMiddleware({
  cors: { origin: "https://your-app.com" },
})

export function middleware(request: NextRequest) {
  return withNotifyKit(request)
}

export const config = { matcher: "/api/notifykit/:path*" }`}</code>
      </pre>
      <pre>
        <code>{`// app/layout.tsx
import { NotifyKitProvider } from "notifykit-react"

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
}`}</code>
      </pre>

      <h2>Requirements</h2>
      <ul>
        <li>Node 18+, Bun 1.0+, or Deno — anything with <code>fetch</code>.</li>
        <li>TypeScript 5.0+ for the full type inference.</li>
        <li>
          Next.js 13+ (App Router) if you&apos;re using the handler and React
          bindings. Other frameworks work too — the handler is plain Web
          Request/Response.
        </li>
      </ul>

      <p>
        Next: <Link href="/docs/defining">Defining notifications →</Link>
      </p>
    </article>
  );
}

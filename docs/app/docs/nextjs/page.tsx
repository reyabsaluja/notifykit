import type { Metadata } from "next";
import Link from "next/link";
import { Code } from "../../_components/code";

export const metadata: Metadata = { title: "Next.js" };

export default function NextjsPage() {
  return (
    <article>
      <h1>Next.js integration</h1>
      <p>
        The <code>@notifykitjs/next</code> package provides a route handler,
        server actions, and optional middleware for CORS. It works with
        Next.js 14+ App Router.
      </p>

      <h2>Install</h2>
      <Code
        lang="bash"
        code={`npm install @notifykitjs/core @notifykitjs/next @notifykitjs/react`}
      />

      <h2>Route handler</h2>
      <p>
        Create a catch-all route that exposes the NotifyKit REST API for the
        React client:
      </p>
      <Code
        filename="app/api/notifykit/[...route]/route.ts"
        code={`import { createRouteHandler } from "@notifykitjs/next"
import { notify } from "@/lib/notifykit"
import { auth } from "@/lib/auth"

export const { GET, POST, DELETE, OPTIONS, dynamic } = createRouteHandler({
  notifykit: notify,
  identify: async (request) => {
    const session = await auth(request)
    if (!session) return null // → 401

    return {
      recipientId: session.user.id,
      tenantId: session.organizationId,     // optional
      workspaceId: session.workspaceId,     // optional
    }
  },
  unsubscribeSecret: process.env.NOTIFYKIT_SECRET,
})`}
      />
      <p>
        The <code>identify</code> function resolves the current user from the
        request. Return <code>null</code> to reject unauthenticated requests
        with a 401.
      </p>

      <h2>Server actions</h2>
      <p>
        For tighter integration without REST calls, use server actions directly:
      </p>
      <Code
        filename="lib/notifykit-actions.ts"
        code={`import { createServerActions } from "@notifykitjs/next"
import { notify } from "@/lib/notifykit"
import { getSessionUserId } from "@/lib/session"

export const notifyActions = createServerActions({
  notifykit: notify,
  identify: () => getSessionUserId(),
})`}
      />
      <Code
        filename="app/settings/notifications/page.tsx"
        code={`import { notifyActions } from "@/lib/notifykit-actions"

export default async function NotificationSettings() {
  const preferences = await notifyActions.getPreferences()
  // render preferences UI...
}`}
      />

      <h2>Middleware (CORS)</h2>
      <p>
        When your client is on a different origin (e.g. a mobile web view
        hitting your API):
      </p>
      <Code
        filename="middleware.ts"
        code={`import { createNotifyKitMiddleware } from "@notifykitjs/next/middleware"
import type { NextRequest } from "next/server"

const withNotifyKit = createNotifyKitMiddleware({
  cors: { origin: "https://app.example.com" },
})

export function middleware(request: NextRequest) {
  return withNotifyKit(request)
}

export const config = { matcher: "/api/notifykit/:path*" }`}
      />

      <h2>Provider pattern</h2>
      <p>
        Wrap your app in <code>NotifyKitProvider</code> to make hooks work.
        Point it at the route handler:
      </p>
      <Code
        filename="app/layout.tsx"
        code={`import { NotifyKitProvider } from "@notifykitjs/react"

export default function RootLayout({ children }: { children: React.ReactNode }) {
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

      <h2>Full file tree</h2>
      <Code
        lang="plaintext"
        code={`app/
├── api/notifykit/[...route]/route.ts   ← REST handler
├── layout.tsx                          ← NotifyKitProvider
├── inbox/page.tsx                      ← useInbox() + <Inbox />
├── settings/notifications/page.tsx     ← usePreferences()
lib/
├── notifykit.ts                        ← createNotifyKit + definitions
├── notifykit-actions.ts                ← server actions (optional)
└── session.ts                          ← your auth helper`}
      />

      <div className="page-nav">
        <Link href="/docs/fallbacks">
          <span className="page-nav-label">Previous</span>
          <span className="page-nav-title">Fallback channels</span>
        </Link>
        <Link href="/docs/react">
          <span className="page-nav-label">Next</span>
          <span className="page-nav-title">React hooks & components</span>
        </Link>
      </div>
    </article>
  );
}

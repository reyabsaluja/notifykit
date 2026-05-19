import type { Metadata } from "next";
import Link from "next/link";
import { Code } from "../../_components/code";

export const metadata: Metadata = { title: "Quickstart" };

export default function QuickstartPage() {
  return (
    <article>
      <h1>Quickstart</h1>
      <p>
        Get a working notification system in under 5 minutes. This guide
        uses the starter scaffold — a Next.js app with everything wired up.
      </p>

      <h2>Create the app</h2>
      <Code
        lang="bash"
        code={`npx create-notifykit-app my-app
cd my-app
cp .env.example .env.local
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# paste the output as NOTIFYKIT_SECRET in .env.local
npm install
npm run dev`}
      />
      <p>
        Open <code>http://localhost:3000</code>. The scaffold uses the
        in-memory adapter and a fake email provider — everything works
        offline.
      </p>

      <h2>What you get</h2>
      <ul>
        <li>A <code>lib/notifykit.ts</code> with sample notification definitions</li>
        <li>An API route handler at <code>/api/notifykit/[...route]</code></li>
        <li>A settings page with preferences UI</li>
        <li>An inbox page with real-time updates</li>
        <li>HMAC-signed unsubscribe links in emails</li>
      </ul>

      <h2>Send your first notification</h2>
      <p>
        From a server action, API route, or anywhere on the server:
      </p>
      <Code
        code={`import { notify } from "@/lib/notifykit"

await notify.upsertRecipient({
  id: user.id,
  email: user.email,
  name: user.name,
})

const result = await notify.send({
  recipientId: user.id,
  notificationId: "welcome",
  payload: { name: user.name },
})

console.log(result.inboxItems) // inbox row created
console.log(result.deliveries) // email delivery record`}
      />

      <h2>Go to production</h2>
      <p>
        When you&apos;re ready to ship, swap three things:
      </p>
      <ol>
        <li>
          <strong>Database</strong> — replace <code>memoryAdapter()</code> with{" "}
          <Link href="/docs/database">Drizzle SQLite or Postgres</Link>
        </li>
        <li>
          <strong>Email provider</strong> — replace <code>fakeEmailProvider()</code> with{" "}
          <Link href="/docs/providers">Resend, Postmark, or your own</Link>
        </li>
        <li>
          <strong>Auth</strong> — wire your real session into <code>identify()</code> in the{" "}
          <Link href="/docs/nextjs">route handler</Link>
        </li>
      </ol>

      <div className="page-nav">
        <Link href="/docs/installation">
          <span className="page-nav-label">Previous</span>
          <span className="page-nav-title">Installation</span>
        </Link>
        <Link href="/docs/defining">
          <span className="page-nav-label">Next</span>
          <span className="page-nav-title">Defining notifications</span>
        </Link>
      </div>
    </article>
  );
}

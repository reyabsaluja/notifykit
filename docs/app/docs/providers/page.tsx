import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Production providers" };

export default function ProvidersPage() {
  return (
    <article>
      <h1>Production providers</h1>
      <p>
        The zero-config defaults — memory adapter, fake email — are great
        for getting started. For production, swap in a real database and
        real email provider. Each is a one-line change.
      </p>

      <h2>Database: Drizzle SQLite</h2>
      <pre>
        <code>{`npm install notifykit-drizzle drizzle-orm better-sqlite3`}</code>
      </pre>
      <pre>
        <code>{`import { Database } from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"
import { createSqliteTables, drizzleSqliteAdapter } from "notifykit-drizzle"

const db = drizzle(new Database("app.db"))
await createSqliteTables(db)  // one-off; use drizzle-kit in production

export const notify = createNotifyKit({
  // ...
  database: drizzleSqliteAdapter(db),
})`}</code>
      </pre>
      <p>
        The exported schema (<code>notifyKitSchema</code>) lets you join
        NotifyKit tables against your own app tables — match{" "}
        <code>notifykit_recipients.id</code> to your{" "}
        <code>users.id</code>.
      </p>
      <p>
        Postgres/MySQL: the adapter logic is portable. Swap the schema file
        from <code>sqlite</code> to <code>pg</code>/<code>mysql</code>{" "}
        Drizzle tables and you&apos;re done.
      </p>

      <h2>Email: Resend</h2>
      <pre>
        <code>{`npm install notifykit-resend`}</code>
      </pre>
      <pre>
        <code>{`import { resendProvider } from "notifykit-resend"

export const notify = createNotifyKit({
  // ...
  providers: {
    email: resendProvider({
      apiKey: process.env.RESEND_API_KEY!,
      from:   process.env.RESEND_FROM!,
      replyTo: "support@acme.com",  // optional
    }),
  },
})`}</code>
      </pre>
      <p>
        The Resend provider uses <code>fetch</code> internally with a
        10-second default timeout. Non-2xx responses throw, so the normal
        retry + fallback pipeline handles them.
      </p>

      <h2>Custom providers</h2>
      <p>
        Either interface is tiny. Wrap Postmark, SES, or any outbound HTTP
        service in ~20 lines:
      </p>
      <pre>
        <code>{`import type { EmailProvider } from "notifykit"

export function postmarkProvider(opts: { token: string; from: string }): EmailProvider {
  return {
    id: "postmark",
    async send(input) {
      const res = await fetch("https://api.postmarkapp.com/email", {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          "x-postmark-server-token": opts.token,
        },
        body: JSON.stringify({
          From: opts.from,
          To: input.to,
          Subject: input.subject,
          TextBody: input.body,
        }),
      })
      if (!res.ok) throw new Error(\`Postmark: \${res.status}\`)
      const json = await res.json() as { MessageID: string }
      return { providerMessageId: json.MessageID }
    },
  }
}`}</code>
      </pre>

      <h2>Webhook providers</h2>
      <p>
        The <code>webhook</code> channel ships its own provider —{" "}
        <code>webhookProvider({"{ secret }"})</code> — that POSTs a signed
        JSON envelope. Every channel of type <code>webhook</code> in any
        notification uses it:
      </p>
      <pre>
        <code>{`import { webhookProvider } from "notifykit"

createNotifyKit({
  // ...
  providers: {
    webhook: webhookProvider({
      secret: process.env.WEBHOOK_SIGNING_SECRET,
    }),
  },
})`}</code>
      </pre>
      <p>
        Receivers verify by HMAC-SHA256-ing the raw body with the shared
        secret. Same pattern as Stripe, GitHub, any serious webhook
        producer.
      </p>

      <h2>Queues</h2>
      <p>
        The default <code>inlineQueue()</code> runs deliveries synchronously
        in <code>send()</code>. Switch to <code>setTimeoutQueue()</code> for
        local dev async, or implement the <code>Queue</code> interface
        against BullMQ, SQS, Cloudflare Queues, whatever you already run:
      </p>
      <pre>
        <code>{`import type { Queue } from "notifykit"

const myQueue: Queue = {
  async enqueue(job, run) {
    await bullmq.add("notifykit", job, { attempts: 1 /* engine handles retries */ })
  },
  async drain() {
    await bullmq.drain()
  },
}

// Somewhere in a worker process:
bullmq.process("notifykit", async (job) => {
  // The engine exposes the same worker via whichever path you set up.
  // Simplest: re-run send() handling; more advanced: call the worker
  // function you passed to enqueue().
})`}</code>
      </pre>
      <div className="callout">
        Retries, backoff, and terminal-failure semantics live in the engine,
        not the queue. A queue&apos;s only job is to decide <em>when</em> a
        worker runs. This means every queue implementation gets retries and
        fallback channels for free.
      </div>

      <p>
        Back to <Link href="/docs/installation">Installation</Link>.
      </p>
    </article>
  );
}

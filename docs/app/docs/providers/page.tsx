import type { Metadata } from "next";
import Link from "next/link";
import { Code } from "../../_components/code";

export const metadata: Metadata = { title: "Email & webhook providers" };

export default function ProvidersPage() {
  return (
    <article>
      <h1>Email &amp; webhook providers</h1>
      <p>
        The zero-config defaults — memory adapter, fake email — are great
        for getting started. For production, swap in real providers. Each is
        a one-line change.
      </p>

      <h2>Resend</h2>
      <Code
        lang="bash"
        code={`npm install @notifykitjs/resend`}
      />
      <Code
        code={`import { resendProvider } from "@notifykitjs/resend"

export const notify = createNotifyKit({
  // ...
  providers: {
    email: resendProvider({
      apiKey: process.env.RESEND_API_KEY!,
      from: process.env.RESEND_FROM!,   // "App <noreply@app.com>"
      replyTo: "support@app.com",       // optional
    }),
  },
})`}
      />
      <p>
        Uses <code>fetch</code> internally with a 10-second timeout.
        Non-2xx responses throw, triggering the retry + fallback pipeline.
      </p>

      <h2>Custom email provider</h2>
      <p>
        The <code>EmailProvider</code> interface is tiny. Wrap Postmark, SES,
        SendGrid, or any HTTP service in ~20 lines:
      </p>
      <Code
        code={`import type { EmailProvider } from "@notifykitjs/core"

export function postmarkProvider(opts: {
  token: string
  from: string
}): EmailProvider {
  return {
    id: "postmark",
    async send(input) {
      const res = await fetch("https://api.postmarkapp.com/email", {
        method: "POST",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json",
          "X-Postmark-Server-Token": opts.token,
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
}`}
      />

      <h2>Webhook provider</h2>
      <p>
        The webhook channel ships its own provider that POSTs a signed JSON
        envelope:
      </p>
      <Code
        code={`import { webhookProvider } from "@notifykitjs/core"

createNotifyKit({
  // ...
  providers: {
    webhook: webhookProvider({
      secret: process.env.WEBHOOK_SIGNING_SECRET,
    }),
  },
})`}
      />
      <p>
        Every request includes an <code>x-notifykit-signature: sha256=&lt;hex&gt;</code>{" "}
        header. Receivers verify by HMAC-SHA256-ing the raw body with the
        shared secret — same pattern as Stripe and GitHub.
      </p>

      <h3>Verifying webhooks on the receiving end</h3>
      <Code
        code={`import { verifyWebhookSignature } from "@notifykitjs/core"

app.post("/webhooks/notifykit", (req, res) => {
  const signature = req.headers["x-notifykit-signature"]
  const valid = verifyWebhookSignature(req.rawBody, signature, SECRET)
  if (!valid) return res.status(401).end()
  // process the notification...
})`}
      />

      <h2>SMS provider</h2>
      <p>
        Same pattern as email. Implement the <code>SmsProvider</code>{" "}
        interface:
      </p>
      <Code
        code={`import type { SmsProvider } from "@notifykitjs/core"

export function twilioProvider(opts: {
  accountSid: string
  authToken: string
  from: string
}): SmsProvider {
  return {
    id: "twilio",
    async send(input) {
      const res = await fetch(
        \`https://api.twilio.com/2010-04-01/Accounts/\${opts.accountSid}/Messages.json\`,
        {
          method: "POST",
          headers: {
            Authorization: \`Basic \${btoa(\`\${opts.accountSid}:\${opts.authToken}\`)}\`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            From: opts.from,
            To: input.to,
            Body: input.body,
          }),
        },
      )
      if (!res.ok) throw new Error(\`Twilio: \${res.status}\`)
      const json = await res.json() as { sid: string }
      return { providerMessageId: json.sid }
    },
  }
}`}
      />

      <h2>Queues &amp; retries</h2>
      <p>
        The default <code>inlineQueue()</code> runs deliveries synchronously.
        Switch to <code>setTimeoutQueue()</code> for async, or implement the{" "}
        <code>Queue</code> interface for BullMQ, SQS, or Cloudflare Queues:
      </p>
      <Code
        code={`import type { Queue } from "@notifykitjs/core"

const bullQueue: Queue = {
  async enqueue(job, run) {
    await queue.add("notifykit", { job, run: run.toString() })
  },
  async drain() {
    await queue.drain()
  },
}`}
      />
      <div className="callout">
        <strong>Retries live in the engine, not the queue.</strong> A queue&apos;s
        only job is to decide <em>when</em> a worker runs. Every queue
        implementation gets retries and fallback channels for free.
      </div>

      <h2>Retry configuration</h2>
      <Code
        code={`createNotifyKit({
  // ...
  retry: {
    maxAttempts: 5,
    delayMs: (attempt) => Math.min(1000 * 2 ** (attempt - 1), 30_000),
  },
})`}
      />

      <div className="page-nav">
        <Link href="/docs/database">
          <span className="page-nav-label">Previous</span>
          <span className="page-nav-title">Database adapters</span>
        </Link>
        <Link href="/docs/multi-tenancy">
          <span className="page-nav-label">Next</span>
          <span className="page-nav-title">Multi-tenancy</span>
        </Link>
      </div>
    </article>
  );
}

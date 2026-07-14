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

      <table>
        <thead>
          <tr><th>Channel</th><th>Built-in</th><th>Custom</th></tr>
        </thead>
        <tbody>
          <tr><td>Email</td><td><code>@notifykitjs/resend</code></td><td>Postmark, SES, SendGrid — ~20 lines</td></tr>
          <tr><td>SMS</td><td>—</td><td>Twilio, Vonage — implement <code>SmsProvider</code></td></tr>
          <tr><td>Webhook</td><td><code>webhookProvider()</code> in core</td><td>N/A (generic by design)</td></tr>
        </tbody>
      </table>

      <div className="callout callout-tip">
        <strong>Every provider is just a <code>send()</code> function.</strong> If
        your service has an HTTP API, you can wrap it in under 20 lines.
        NotifyKit handles retries, fallbacks, and rate limiting — your provider
        just makes the request.
      </div>

      <div className="features">
        <div className="feature-card">
          <h3>Automatic retries</h3>
          <p>Exponential backoff with configurable max attempts. Transient errors retry; permanent errors fail fast.</p>
        </div>
        <div className="feature-card">
          <h3>Provider failover</h3>
          <p>Chain multiple providers per channel. If Resend is down, Postmark picks up — same email, no user impact.</p>
        </div>
        <div className="feature-card">
          <h3>Durable queues</h3>
          <p>Plug in BullMQ or SQS for deliveries that survive deploys and crashes. Or use inline for simplicity.</p>
        </div>
        <div className="feature-card">
          <h3>Environment switching</h3>
          <p>Fake providers in dev and test, sandbox in staging, live keys in production — one config pattern.</p>
        </div>
      </div>

      <h2>Choosing an email provider</h2>
      <p>
        Haven&apos;t picked a provider yet? Here&apos;s a quick comparison of
        common options and when they fit:
      </p>
      <table>
        <thead>
          <tr><th>Provider</th><th>Free tier</th><th>Best for</th><th>Integration effort</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Resend</strong></td>
            <td>3,000 emails/mo</td>
            <td>Startups, developer-first apps. Simple API, fast setup.</td>
            <td>1 line — <code>@notifykitjs/resend</code></td>
          </tr>
          <tr>
            <td><strong>Postmark</strong></td>
            <td>100 emails/mo</td>
            <td>Transactional email with high deliverability. No marketing allowed.</td>
            <td>~20 lines — custom provider</td>
          </tr>
          <tr>
            <td><strong>AWS SES</strong></td>
            <td>62,000 emails/mo (from EC2)</td>
            <td>High volume, already on AWS. Cheapest at scale ($0.10/1k).</td>
            <td>~30 lines — custom provider with SDK</td>
          </tr>
          <tr>
            <td><strong>SendGrid</strong></td>
            <td>100 emails/day</td>
            <td>Teams needing analytics dashboards and dedicated IPs.</td>
            <td>~20 lines — custom provider</td>
          </tr>
        </tbody>
      </table>
      <div className="features">
        <div className="feature-card">
          <h3>Need to ship fast?</h3>
          <p>Use Resend — first-party package, one import, generous free tier. Swap later if needed.</p>
        </div>
        <div className="feature-card">
          <h3>Sending 100k+ emails/month?</h3>
          <p>Use SES for cost, or Postmark for deliverability. Consider <Link href="/docs/fallbacks">failover</Link> with two providers.</p>
        </div>
        <div className="feature-card">
          <h3>Not ready to pick?</h3>
          <p>Use <code>fakeEmailProvider()</code> — zero config, logs to console. Swap to a real provider with one line when ready.</p>
        </div>
      </div>

      <h2>Resend</h2>
      <Code
        lang="bash"
        code={`npm install @notifykitjs/resend`}
      />
      <Code
        filename="lib/notifykit.ts"
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
        Every provider implements the same minimal contract:
      </p>
      <table>
        <thead>
          <tr><th>Field</th><th>Type</th><th>Purpose</th></tr>
        </thead>
        <tbody>
          <tr><td><code>id</code></td><td><code>string</code></td><td>Identifier for logs and timeline (e.g. &quot;postmark&quot;)</td></tr>
          <tr><td><code>send(input)</code></td><td><code>async</code></td><td>Make the API call. Throw on failure. Return <code>{`{ providerMessageId? }`}</code> on success.</td></tr>
        </tbody>
      </table>
      <div className="callout callout-tip">
        <strong>Error contract.</strong> Throw any error to trigger retries.
        NotifyKit catches it, records it in the timeline, and retries per your{" "}
        <code>retry</code> config. You don&apos;t need try/catch inside your
        provider — just let non-2xx responses throw.
      </div>
      <p>
        Wrap Postmark, SES, SendGrid, or any HTTP service in ~20 lines:
      </p>
      <Code
        filename="lib/providers/postmark.ts"
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
        filename="lib/notifykit.ts"
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
        filename="routes/webhooks.ts"
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
        filename="lib/providers/twilio.ts"
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

      <h2>Smoke-testing your provider</h2>
      <p>
        Before wiring a custom provider into your app, test it in isolation.
        This catches auth issues, payload problems, and network errors
        without touching the rest of the stack:
      </p>
      <Code
        filename="scripts/test-provider.ts"
        code={`// Run: npx tsx scripts/test-provider.ts
import { postmarkProvider } from "./lib/providers/postmark"

const provider = postmarkProvider({
  token: process.env.POSTMARK_TOKEN!,
  from: "test@yourapp.com",
})

const result = await provider.send({
  to: "your-own-email@gmail.com",
  subject: "[TEST] NotifyKit provider smoke test",
  body: "If you see this, the provider works.",
})

console.log("✓ Sent:", result.providerMessageId ?? "(no message ID returned)")`}
      />
      <table>
        <thead>
          <tr><th>You see</th><th>Meaning</th><th>Fix</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><code>&#x2713; Sent: msg_abc123</code></td>
            <td>Provider works — safe to wire into NotifyKit</td>
            <td>None needed</td>
          </tr>
          <tr>
            <td><code>401 Unauthorized</code></td>
            <td>API key is invalid or expired</td>
            <td>Regenerate the key in the provider dashboard</td>
          </tr>
          <tr>
            <td><code>403 / domain not verified</code></td>
            <td>The &quot;from&quot; address uses an unverified domain</td>
            <td>Verify the domain in provider settings (DNS records)</td>
          </tr>
          <tr>
            <td><code>422 / invalid recipient</code></td>
            <td>Test address rejected — try a different <code>to</code></td>
            <td>Use a real address you own; some providers reject <code>+</code> aliases</td>
          </tr>
          <tr>
            <td><code>fetch failed / ENOTFOUND</code></td>
            <td>Network or DNS issue</td>
            <td>Check internet connection; verify the API URL in your provider code</td>
          </tr>
        </tbody>
      </table>
      <div className="callout callout-tip">
        <strong>Test before you commit.</strong> A provider that passes this
        script will work with NotifyKit — the engine calls the same{" "}
        <code>send(input)</code> method with the same shape. If the isolated test
        works but the wired version doesn&apos;t, the issue is in your config
        (wrong env var name, missing <code>!</code> assertion), not the provider.
      </div>

      <h2>Provider input shapes</h2>
      <p>
        Each provider type receives a different <code>input</code> object:
      </p>
      <table>
        <thead>
          <tr><th>Provider</th><th>Input fields</th></tr>
        </thead>
        <tbody>
          <tr><td><code>EmailProvider</code></td><td><code>to</code>, <code>subject</code>, <code>body</code></td></tr>
          <tr><td><code>SmsProvider</code></td><td><code>to</code>, <code>body</code></td></tr>
          <tr><td><code>WebhookProvider</code></td><td><code>url</code>, <code>headers</code>, <code>payload</code> (full notification context)</td></tr>
        </tbody>
      </table>

      <h2>Queues &amp; retries</h2>
      <p>
        The queue decides <em>when</em> delivery code runs. Pick based on your
        deployment:
      </p>
      <table>
        <thead>
          <tr><th>Queue</th><th>Delivery timing</th><th>Survives restart</th><th>Best for</th></tr>
        </thead>
        <tbody>
          <tr><td><code>inlineQueue()</code></td><td><code>send()</code> awaits provider</td><td>N/A</td><td>Scripts, tests, CLIs</td></tr>
          <tr><td><code>setTimeoutQueue()</code></td><td>Background via <code>setTimeout</code></td><td>No — in-flight lost on crash</td><td>Web servers, single-instance apps</td></tr>
          <tr><td>Custom (BullMQ, SQS)</td><td>External worker picks up jobs</td><td>Yes — jobs persist in Redis/SQS</td><td>Multi-instance production, serverless</td></tr>
        </tbody>
      </table>
      <div className="callout callout-warn">
        <strong>Serverless needs a durable queue.</strong> Vercel/Lambda
        functions die after the response. <code>setTimeoutQueue()</code> jobs
        will be lost. Use BullMQ (with Redis) or SQS, or stick with{" "}
        <code>inlineQueue()</code> and accept the latency hit.
      </div>
      <p>
        Implement the <code>Queue</code> interface — two methods:
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
      <div className="callout callout-tip">
        <strong>Retries live in the engine, not the queue.</strong> A queue&apos;s
        only job is to decide <em>when</em> a worker runs. Every queue
        implementation gets retries and fallback channels for free.
      </div>

      <h3>Complete BullMQ implementation</h3>
      <p>
        The stub above shows the contract. Here&apos;s a production-ready
        implementation with Redis connection, worker setup, and graceful
        shutdown — copy this into your project:
      </p>
      <Code
        filename="lib/queue.ts"
        code={`import { Queue as BullQueue } from "bullmq"
import type { Queue as NotifyKitQueue } from "@notifykitjs/core"

const connection = { host: process.env.REDIS_HOST!, port: 6379 }

const deliveryQueue = new BullQueue("notifykit-deliveries", {
  connection,
  defaultJobOptions: {
    removeOnComplete: 1000,  // keep last 1000 completed jobs for debugging
    removeOnFail: 5000,      // keep last 5000 failed for investigation
  },
})

export const bullMQQueue: NotifyKitQueue = {
  async enqueue(job) {
    await deliveryQueue.add("deliver", job, {
      jobId: job.deliveryId, // prevents duplicate jobs on retry
    })
  },
  async drain() {
    await deliveryQueue.close()
  },
}`}
      />
      <Code
        filename="worker.ts"
        code={`import { Worker } from "bullmq"
import { notify } from "./lib/notifykit"

const connection = { host: process.env.REDIS_HOST!, port: 6379 }

const worker = new Worker(
  "notifykit-deliveries",
  async (job) => {
    await notify.processDeliveryJob(job.data)
  },
  {
    connection,
    concurrency: 10,           // parallel deliveries
    limiter: { max: 50, duration: 1000 }, // 50 jobs/sec max
  },
)

worker.on("failed", (job, err) => {
  console.error(\`Delivery \${job?.id} failed: \${err.message}\`)
})

// Graceful shutdown
process.on("SIGTERM", async () => {
  await worker.close()
  process.exit(0)
})`}
      />
      <table>
        <thead>
          <tr><th>Design choice</th><th>Why</th><th>Adjust when</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><code>jobId: job.deliveryId</code></td>
            <td>Prevents duplicate queue entries if <code>send()</code> retries enqueue</td>
            <td>Remove if you want BullMQ to generate IDs (rare)</td>
          </tr>
          <tr>
            <td><code>concurrency: 10</code></td>
            <td>Processes 10 deliveries in parallel per worker instance</td>
            <td>Increase for high volume, decrease if providers rate-limit you</td>
          </tr>
          <tr>
            <td><code>removeOnComplete: 1000</code></td>
            <td>Keeps Redis memory bounded while allowing debug inspection</td>
            <td>Decrease on memory-constrained Redis, increase for longer audit trail</td>
          </tr>
          <tr>
            <td>Separate worker process</td>
            <td>Deliveries survive web server restarts and deploys</td>
            <td>Run in-process if you only have one server and want simplicity</td>
          </tr>
        </tbody>
      </table>
      <div className="callout callout-tip">
        <strong>The worker must import the same <code>notify</code> instance.</strong>{" "}
        It needs access to the same notification definitions, providers, and
        retry config. Extract your <code>createNotifyKit()</code> setup into a
        shared <code>lib/notifykit.ts</code> and import it from both the web
        server and the worker.
      </div>

      <h3>Choosing your queue</h3>
      <p>
        Use this decision table based on what you can tolerate:
      </p>
      <table>
        <thead>
          <tr><th>Question</th><th>If no</th><th>If yes</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>Can you lose in-flight deliveries on crash?</td>
            <td>Use BullMQ/SQS (durable)</td>
            <td>Use <code>setTimeoutQueue()</code></td>
          </tr>
          <tr>
            <td>Does response latency matter for the send caller?</td>
            <td>Use <code>inlineQueue()</code> — simplest</td>
            <td>Use <code>setTimeoutQueue()</code> or BullMQ</td>
          </tr>
          <tr>
            <td>Are you on serverless (Vercel, Lambda)?</td>
            <td>Any queue works</td>
            <td>Use <code>inlineQueue()</code> or external queue with a worker</td>
          </tr>
          <tr>
            <td>Do you need delivery metrics and job inspection?</td>
            <td>Any queue works</td>
            <td>Use BullMQ — comes with Bull Board UI for free</td>
          </tr>
        </tbody>
      </table>

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
      <p>With the default exponential backoff, the retry timeline looks like:</p>
      <div className="overview-flow">
        <div className="overview-flow-step">
          <span className="overview-flow-number">1</span>
          <div>
            <strong>Attempt 1</strong>
            <p>Immediate. If it fails, wait 1s.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">2</span>
          <div>
            <strong>Attempt 2</strong>
            <p>After 1s. If it fails, wait 2s.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">3</span>
          <div>
            <strong>Attempt 3</strong>
            <p>After 2s. If it fails, wait 4s.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">4</span>
          <div>
            <strong>Attempt 4</strong>
            <p>After 4s. If it fails, wait 8s.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">5</span>
          <div>
            <strong>Attempt 5 (final)</strong>
            <p>After 8s. If it fails → <code>delivery.failed</code> hook fires, fallback triggers.</p>
          </div>
        </div>
      </div>

      <h2>Transient vs permanent errors</h2>
      <p>
        Not all failures should be retried. A 429 (rate limit) or 503 (service
        unavailable) will likely succeed on retry. A 400 (bad request) or 422
        (invalid recipient) never will. Your provider controls this:
      </p>
      <table>
        <thead>
          <tr><th>Error type</th><th>Provider behavior</th><th>Engine response</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Transient</strong> (retryable)</td>
            <td>Throw a regular <code>Error</code></td>
            <td>Retries up to <code>maxAttempts</code>, then fails with fallback</td>
          </tr>
          <tr>
            <td><strong>Permanent</strong> (not retryable)</td>
            <td>Throw with <code>permanent: true</code> property</td>
            <td>Immediately fails — no retries, fallback triggers right away</td>
          </tr>
        </tbody>
      </table>
      <Code
        code={`import type { EmailProvider } from "@notifykitjs/core"

export function myProvider(opts): EmailProvider {
  return {
    id: "my-esp",
    async send(input) {
      const res = await fetch("https://api.provider.com/send", {
        method: "POST",
        headers: { Authorization: \`Bearer \${opts.apiKey}\` },
        body: JSON.stringify({ to: input.to, subject: input.subject, body: input.body }),
      })

      if (res.ok) {
        const json = await res.json()
        return { providerMessageId: json.id }
      }

      // Permanent errors — retrying won't help
      if (res.status === 400 || res.status === 422) {
        const err = new Error(\`Provider rejected: \${res.status}\`)
        ;(err as any).permanent = true
        throw err
      }

      // Transient errors — retry with backoff
      throw new Error(\`Provider error: \${res.status}\`)
    },
  }
}`}
      />
      <table>
        <thead>
          <tr><th>HTTP status</th><th>Classification</th><th>Examples</th></tr>
        </thead>
        <tbody>
          <tr><td><code>400</code>, <code>422</code></td><td>Permanent</td><td>Invalid email address, malformed payload, recipient bounced</td></tr>
          <tr><td><code>401</code>, <code>403</code></td><td>Permanent</td><td>Bad API key, account suspended, insufficient permissions</td></tr>
          <tr><td><code>429</code></td><td>Transient</td><td>Provider rate limit — back off and retry</td></tr>
          <tr><td><code>500</code>, <code>502</code>, <code>503</code></td><td>Transient</td><td>Provider outage — usually recovers within seconds</td></tr>
          <tr><td>Network error / timeout</td><td>Transient</td><td>DNS failure, connection reset, read timeout</td></tr>
        </tbody>
      </table>
      <div className="callout callout-tip">
        <strong>When in doubt, let it retry.</strong> Only mark errors as
        permanent when you&apos;re certain the same input will never succeed.
        Wasting a few retries on a 400 costs milliseconds; skipping retries
        on a transient 500 loses the notification entirely.
      </div>

      <h2>Provider failover</h2>
      <p>
        Channel-level fallbacks (email→inbox) change the delivery mechanism
        when a channel fails. Provider failover is different — it keeps the
        same channel (email) but switches to a backup provider (Resend→Postmark)
        when the primary is down.
      </p>
      <table>
        <thead>
          <tr><th>Mechanism</th><th>What changes</th><th>Use when</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Channel fallback</strong></td>
            <td>Channel (email → inbox)</td>
            <td>User should get the notification <em>somewhere</em>, even if degraded</td>
          </tr>
          <tr>
            <td><strong>Provider failover</strong></td>
            <td>Provider (Resend → Postmark)</td>
            <td>Email must arrive as email — different provider, same experience</td>
          </tr>
        </tbody>
      </table>
      <p>
        Implement provider failover by wrapping multiple providers into one
        that tries each in order:
      </p>
      <Code
        filename="lib/providers/failover.ts"
        code={`import type { EmailProvider } from "@notifykitjs/core"

export function failoverEmailProvider(
  providers: EmailProvider[]
): EmailProvider {
  return {
    id: providers.map(p => p.id).join("+"),
    async send(input) {
      let lastError: Error | null = null

      for (const provider of providers) {
        try {
          return await provider.send(input)
        } catch (err) {
          lastError = err instanceof Error ? err : new Error(String(err))
          // If permanent error, don't try the next provider either
          if ((lastError as any).permanent) throw lastError
          // Otherwise, try the next provider
        }
      }

      // All providers failed with transient errors
      throw lastError!
    },
  }
}`}
      />
      <Code
        filename="lib/notifykit.ts"
        code={`import { resendProvider } from "@notifykitjs/resend"

const notify = createNotifyKit({
  // ...
  providers: {
    email: failoverEmailProvider([
      resendProvider({ apiKey: process.env.RESEND_API_KEY!, from: "app@example.com" }),
      postmarkProvider({ token: process.env.POSTMARK_TOKEN!, from: "app@example.com" }),
    ]),
  },
})`}
      />
      <div className="overview-flow">
        <div className="overview-flow-step">
          <span className="overview-flow-number">1</span>
          <div>
            <strong>Try primary</strong>
            <p>Resend gets the first attempt. If it succeeds, done.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">2</span>
          <div>
            <strong>Primary fails (transient)</strong>
            <p>500, timeout, or network error. Move to backup.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">3</span>
          <div>
            <strong>Try backup</strong>
            <p>Postmark gets the same input. If it succeeds, the user gets their email.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">4</span>
          <div>
            <strong>Both fail</strong>
            <p>The wrapper throws the last error. The engine retries the whole chain per your retry config.</p>
          </div>
        </div>
      </div>
      <table>
        <thead>
          <tr><th>Design choice</th><th>Recommendation</th><th>Why</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>Permanent errors</td>
            <td>Don&apos;t try backup</td>
            <td>A 422 (bad address) will fail on any provider — no point trying Postmark</td>
          </tr>
          <tr>
            <td>Provider order</td>
            <td>Cheapest/fastest first</td>
            <td>The backup only fires during outages — optimize for the happy path</td>
          </tr>
          <tr>
            <td>Monitoring</td>
            <td>Log which provider succeeded</td>
            <td>Track when backups fire — sustained backup usage means your primary is degraded</td>
          </tr>
          <tr>
            <td>From address</td>
            <td>Same <code>from</code> on both</td>
            <td>Recipients see a consistent sender regardless of which provider fired</td>
          </tr>
        </tbody>
      </table>
      <div className="callout callout-tip">
        <strong>Failover happens inside a single retry attempt.</strong> If
        Resend fails and Postmark succeeds, that counts as one successful
        attempt — no retry consumed. If both fail, the engine retries the
        whole failover chain on the next attempt. This means with 2 providers
        and 3 retry attempts, you get up to 6 total provider calls before
        giving up.
      </div>

      <h2>Environment-based provider switching</h2>
      <p>
        Most apps need different providers per environment — fake in dev,
        a sandbox key in staging, production keys in prod. Wire this with a
        simple function that reads the environment:
      </p>
      <Code
        filename="lib/providers.ts"
        code={`import { fakeEmailProvider } from "@notifykitjs/core"
import { resendProvider } from "@notifykitjs/resend"

export function emailProvider() {
  switch (process.env.NODE_ENV) {
    case "production":
      return resendProvider({
        apiKey: process.env.RESEND_API_KEY!,
        from: process.env.EMAIL_FROM!,
      })

    case "test":
      return fakeEmailProvider() // logs only, no network

    default: // development
      return process.env.RESEND_API_KEY
        ? resendProvider({ apiKey: process.env.RESEND_API_KEY, from: "dev@localhost" })
        : fakeEmailProvider()
  }
}

// lib/notifykit.ts
import { emailProvider } from "./providers"

export const notify = createNotifyKit({
  notifications: [...] as const,
  database: adapter(),
  providers: { email: emailProvider() },
})`}
      />
      <table>
        <thead>
          <tr><th>Environment</th><th>Provider</th><th>Behavior</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Development</strong> (no key)</td>
            <td><code>fakeEmailProvider()</code></td>
            <td>Logs the subject, recipient, and body to the terminal. No network calls.</td>
          </tr>
          <tr>
            <td><strong>Development</strong> (with key)</td>
            <td>Real provider in sandbox mode</td>
            <td>Sends to your own email for visual verification. Useful for testing templates.</td>
          </tr>
          <tr>
            <td><strong>Test</strong> (CI)</td>
            <td><code>fakeEmailProvider()</code></td>
            <td>Deterministic — never hits the network. Tests run offline and fast.</td>
          </tr>
          <tr>
            <td><strong>Staging</strong></td>
            <td>Real provider, sandbox/test key</td>
            <td>Validates the full delivery path without sending to real users.</td>
          </tr>
          <tr>
            <td><strong>Production</strong></td>
            <td>Real provider, live key</td>
            <td>Full delivery to recipients. Requires verified domain.</td>
          </tr>
        </tbody>
      </table>
      <div className="callout callout-tip">
        <strong>Use <code>devMode: true</code> as a safety net.</strong> Even if
        you accidentally load a real provider in development, <code>devMode</code>{" "}
        blocks all actual sends and logs what would have happened. Set it from
        the environment:{" "}
        <code>devMode: process.env.NODE_ENV !== &quot;production&quot;</code>.
      </div>
      <div className="callout callout-warn">
        <strong>Never commit API keys.</strong> Use <code>.env.local</code>{" "}
        (gitignored) for local keys and your hosting platform&apos;s secret
        management for staging/production. The <code>!</code> assertion
        (<code>process.env.RESEND_API_KEY!</code>) will throw at startup if the
        var is missing — which is what you want in production.
      </div>

      <h2>Monitoring provider health</h2>
      <p>
        A provider that worked at deploy time can degrade silently — rate limits
        tighten, API keys expire, DNS flaps. Use{" "}
        <Link href="/docs/hooks">hooks</Link> to track delivery outcomes and
        surface problems before users notice:
      </p>
      <Code
        filename="lib/notifykit.ts"
        code={`createNotifyKit({
  // ...
  on: {
    "delivery.sent": ({ delivery }) => {
      metrics.inc("notifykit.delivery.sent", {
        provider: delivery.provider,
        channel: delivery.channel,
      })
      metrics.histogram("notifykit.delivery.latency_ms", delivery.latencyMs, {
        provider: delivery.provider,
      })
    },
    "delivery.failed": ({ delivery }) => {
      metrics.inc("notifykit.delivery.failed", {
        provider: delivery.provider,
        channel: delivery.channel,
        permanent: String(delivery.permanent),
      })
      // Alert if failure rate spikes
      if (delivery.attempts >= 3) {
        alerting.warn(\`Provider \${delivery.provider} failing after \${delivery.attempts} attempts: \${delivery.error}\`)
      }
    },
    "delivery.retrying": ({ delivery }) => {
      metrics.inc("notifykit.delivery.retry", {
        provider: delivery.provider,
        attempt: String(delivery.attempts),
      })
    },
  },
})`}
      />
      <table>
        <thead>
          <tr><th>Metric</th><th>Healthy range</th><th>Alert when</th><th>Likely cause</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Delivery success rate</strong></td>
            <td>&gt; 99%</td>
            <td>&lt; 95% for 5 min</td>
            <td>Provider outage, expired API key, domain verification lost</td>
          </tr>
          <tr>
            <td><strong>Delivery latency (p95)</strong></td>
            <td>&lt; 2s for email, &lt; 1s for SMS</td>
            <td>&gt; 5s sustained</td>
            <td>Provider under load, network congestion, DNS resolution slow</td>
          </tr>
          <tr>
            <td><strong>Retry rate</strong></td>
            <td>&lt; 5% of sends</td>
            <td>&gt; 20% for 10 min</td>
            <td>Provider rate limiting you, intermittent 5xx errors</td>
          </tr>
          <tr>
            <td><strong>Permanent failure rate</strong></td>
            <td>&lt; 2%</td>
            <td>Spike above baseline</td>
            <td>Bad recipient data (bounces), payload validation changes upstream</td>
          </tr>
          <tr>
            <td><strong>Failover activations</strong></td>
            <td>0 in normal operation</td>
            <td>Any sustained failover</td>
            <td>Primary provider degraded — investigate before backup budget drains</td>
          </tr>
        </tbody>
      </table>
      <div className="overview-flow">
        <div className="overview-flow-step">
          <span className="overview-flow-number">1</span>
          <div>
            <strong>Baseline</strong>
            <p>After first deploy, observe metrics for 48h to establish normal ranges for your volume and provider.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">2</span>
          <div>
            <strong>Alert on deviation</strong>
            <p>Set thresholds relative to your baseline. A 10k/day app alerting at 95% catches 500+ lost emails.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">3</span>
          <div>
            <strong>Diagnose with timeline</strong>
            <p>When alerts fire, use <Link href="/docs/timeline">timeline</Link> to see exact error sequences and <Link href="/docs/explain">explain()</Link> to dry-run the failing payload.</p>
          </div>
        </div>
      </div>
      <div className="callout callout-tip">
        <strong>Start with the <code>delivery.failed</code> hook alone.</strong>{" "}
        It catches 90% of production issues — expired keys, bounced addresses,
        provider outages. Add latency tracking and retry metrics when you need
        to distinguish &quot;slow but working&quot; from &quot;about to
        fail.&quot;
      </div>

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

import Link from "next/link";
import { createDocsMetadata } from "../../../lib/site";
import { Code } from "../../_components/code";

export const metadata = createDocsMetadata("channels");

export default function ChannelsPage() {
  return (
    <article>
      <h1>Channels</h1>
      <p>
        A channel is a delivery mechanism. Each notification definition lists
        the channels it should be sent through. NotifyKit ships four channel
        types — inbox, email, SMS, and webhook.
      </p>

      <table>
        <thead>
          <tr><th>Channel</th><th>Type</th><th>How it delivers</th></tr>
        </thead>
        <tbody>
          <tr><td><strong>Inbox</strong></td><td>Pull</td><td>Writes a row — user fetches it via hook or API</td></tr>
          <tr><td><strong>Email</strong></td><td>Push</td><td>Sends via your email provider (Resend, Postmark, etc.)</td></tr>
          <tr><td><strong>SMS</strong></td><td>Push</td><td>Sends via your SMS provider (Twilio, Vonage, etc.)</td></tr>
          <tr><td><strong>Webhook</strong></td><td>Push</td><td>POSTs a signed JSON payload to a URL</td></tr>
        </tbody>
      </table>

      <div className="callout callout-tip">
        <strong>Pull vs push matters.</strong> Pull channels (inbox) are never
        affected by quiet hours or delivery failures — the item is simply
        there when the user looks. Push channels (email, SMS, webhook) go
        through the full pipeline: queue, retry, quiet hours, fallback.
      </div>

      <h2>At a glance</h2>
      <p>
        Minimal working config for each channel type. Copy the one you need,
        then scroll down for options and advanced patterns:
      </p>
      <div className="features">
        <div className="feature-card">
          <h3>Inbox</h3>
          <p>Pull channel — writes a row, user fetches it.</p>
          <code style={{ fontSize: "0.8em", whiteSpace: "pre", display: "block", marginTop: "0.5rem" }}>{`inbox({
  title: "{{actorName}} mentioned you",
  body: "In {{postTitle}}",
  actionUrl: "{{postUrl}}",
})`}</code>
        </div>
        <div className="feature-card">
          <h3>Email</h3>
          <p>Push channel — queued to your email provider.</p>
          <code style={{ fontSize: "0.8em", whiteSpace: "pre", display: "block", marginTop: "0.5rem" }}>{`email({
  subject: "{{actorName}} mentioned you",
  body: "Open {{postUrl}}\\n\\n{{_unsubscribeUrl}}",
})`}</code>
        </div>
        <div className="feature-card">
          <h3>SMS</h3>
          <p>Push channel — sent via Twilio/Vonage/etc.</p>
          <code style={{ fontSize: "0.8em", whiteSpace: "pre", display: "block", marginTop: "0.5rem" }}>{`sms({
  body: "Your code is {{code}}",
})`}</code>
        </div>
        <div className="feature-card">
          <h3>Webhook</h3>
          <p>Push channel — signed POST to a URL.</p>
          <code style={{ fontSize: "0.8em", whiteSpace: "pre", display: "block", marginTop: "0.5rem" }}>{`webhook({
  url: "https://hooks.slack.com/...",
})`}</code>
        </div>
      </div>

      <h2>Inbox</h2>
      <p>
        The inbox channel writes a row to your database. It&apos;s user-pulled
        (the recipient fetches it via the React hook or REST API), so it&apos;s
        never subject to quiet hours or delivery failures.
      </p>
      <table>
        <thead>
          <tr><th>Property</th><th>Required</th><th>Description</th></tr>
        </thead>
        <tbody>
          <tr><td><code>title</code></td><td>Yes</td><td>Main text shown in the inbox list</td></tr>
          <tr><td><code>body</code></td><td>No</td><td>Secondary text or preview</td></tr>
          <tr><td><code>actionUrl</code></td><td>No</td><td>Link destination when the item is clicked</td></tr>
        </tbody>
      </table>
      <Code
        code={`import { channel } from "@notifykitjs/core"

const inbox = channel.inbox()

inbox({
  title: "{{actorName}} mentioned you",
  body: "In {{postTitle}}",
  actionUrl: "{{postUrl}}",
})`}
      />
      <p>
        Inbox items support read/unread state, archiving, and deletion. All
        mutations publish realtime events when a{" "}
        <Link href="/docs/realtime">realtime adapter</Link> is configured.
      </p>

      <h2>Email</h2>
      <p>
        The email channel queues a delivery job that your configured{" "}
        <Link href="/docs/providers">email provider</Link> sends.
      </p>
      <table>
        <thead>
          <tr><th>Property</th><th>Required</th><th>Description</th></tr>
        </thead>
        <tbody>
          <tr><td><code>subject</code></td><td>Yes</td><td>Email subject line (supports template variables)</td></tr>
          <tr><td><code>body</code></td><td>Yes</td><td>Plain text body (supports template variables)</td></tr>
        </tbody>
      </table>
      <Code
        code={`const email = channel.email()

email({
  subject: "{{actorName}} mentioned you in {{postTitle}}",
  body: "Open {{postUrl}} to reply.\\n\\nUnsubscribe: {{_unsubscribeUrl}}",
})`}
      />
      <div className="callout callout-warn">
        <strong>Built-in variable.</strong> <code>{`{{_unsubscribeUrl}}`}</code> is
        injected automatically — it links to the one-click unsubscribe handler.
        Always include it in email bodies.
      </div>

      <h2>SMS</h2>
      <p>
        The SMS channel sends a text message through your configured{" "}
        SMS provider.
      </p>
      <table>
        <thead>
          <tr><th>Property</th><th>Required</th><th>Description</th></tr>
        </thead>
        <tbody>
          <tr><td><code>body</code></td><td>Yes</td><td>Message text (max ~160 chars recommended)</td></tr>
        </tbody>
      </table>
      <Code
        code={`const sms = channel.sms()

sms({
  body: "Your verification code is {{code}}",
})`}
      />
      <div className="callout callout-warn">
        <strong>Recipient requires <code>phone</code>.</strong> If the recipient
        doesn&apos;t have a phone number set, the SMS channel resolves to{" "}
        <code>&quot;unavailable&quot;</code> and is skipped.
      </div>

      <h2>Webhook</h2>
      <p>
        The webhook channel POSTs a signed JSON envelope to a URL. Use it for
        Slack integrations, custom destinations, or forwarding to external
        services.
      </p>
      <table>
        <thead>
          <tr><th>Property</th><th>Required</th><th>Description</th></tr>
        </thead>
        <tbody>
          <tr><td><code>url</code></td><td>Yes</td><td>Destination endpoint</td></tr>
          <tr><td><code>headers</code></td><td>No</td><td>Additional HTTP headers</td></tr>
        </tbody>
      </table>
      <Code
        code={`const webhook = channel.webhook()

webhook({
  url: "https://hooks.slack.com/services/T.../B.../xxx",
  headers: { "Content-Type": "application/json" },
})`}
      />

      <h3>Signature verification</h3>
      <p>
        When a <code>secret</code> is configured on the webhook provider,
        every request includes an <code>x-notifykit-signature</code> header.
      </p>
      <div className="overview-flow">
        <div className="overview-flow-step">
          <span className="overview-flow-number">1</span>
          <div>
            <strong>NotifyKit signs</strong>
            <p>HMAC-SHA256 of the raw JSON body with your shared secret.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">2</span>
          <div>
            <strong>Header sent</strong>
            <p><code>x-notifykit-signature: sha256=&lt;hex&gt;</code> included on every POST.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">3</span>
          <div>
            <strong>Receiver verifies</strong>
            <p>Compute HMAC-SHA256 of the raw body with the same secret. Compare to header value.</p>
          </div>
        </div>
      </div>

      <h3>Webhook payload format</h3>
      <p>
        Every webhook delivery POSTs a JSON envelope with a consistent shape.
        Your receiver can rely on this structure regardless of the notification
        type:
      </p>
      <Code
        code={`// What your endpoint receives:
{
  "event": "notification.delivered",
  "notificationId": "deploy_completed",
  "recipientId": "user_123",
  "payload": {
    "projectName": "api-gateway",
    "status": "succeeded",
    "sha": "abc123f"
  },
  "metadata": {
    "sentAt": "2026-06-27T14:30:00.000Z",
    "deliveryId": "del_abc123",
    "attempt": 1
  }
}`}
      />
      <table>
        <thead>
          <tr><th>Field</th><th>Type</th><th>Description</th></tr>
        </thead>
        <tbody>
          <tr><td><code>event</code></td><td><code>string</code></td><td>Always <code>&quot;notification.delivered&quot;</code> for webhook deliveries</td></tr>
          <tr><td><code>notificationId</code></td><td><code>string</code></td><td>The notification definition ID — use for routing on the receiver</td></tr>
          <tr><td><code>recipientId</code></td><td><code>string</code></td><td>Who this notification is for</td></tr>
          <tr><td><code>payload</code></td><td><code>object</code></td><td>Your full typed payload, as passed to <code>send()</code></td></tr>
          <tr><td><code>metadata.sentAt</code></td><td><code>ISO 8601</code></td><td>When the delivery was dispatched</td></tr>
          <tr><td><code>metadata.deliveryId</code></td><td><code>string</code></td><td>Unique delivery ID — use for idempotency on the receiver</td></tr>
          <tr><td><code>metadata.attempt</code></td><td><code>number</code></td><td>Retry attempt (1 = first try, 2+ = retry)</td></tr>
        </tbody>
      </table>

      <h3>Verifying signatures (receiver code)</h3>
      <p>
        When your webhook provider has a <code>secret</code> configured, verify
        the <code>x-notifykit-signature</code> header before processing:
      </p>
      <Code
        code={`// Your webhook receiver (any framework)
import { createHmac, timingSafeEqual } from "node:crypto"

const WEBHOOK_SECRET = process.env.NOTIFYKIT_WEBHOOK_SECRET!

function verifySignature(rawBody: string, signatureHeader: string): boolean {
  const expected = createHmac("sha256", WEBHOOK_SECRET)
    .update(rawBody)
    .digest("hex")

  const received = signatureHeader.replace("sha256=", "")

  return timingSafeEqual(
    Buffer.from(expected, "hex"),
    Buffer.from(received, "hex"),
  )
}

// Express / Node.js example:
app.post("/webhooks/notifykit", (req, res) => {
  const signature = req.headers["x-notifykit-signature"]
  if (!signature || !verifySignature(req.rawBody, signature)) {
    return res.status(401).json({ error: "Invalid signature" })
  }

  const { notificationId, payload, metadata } = req.body
  // Process the webhook...
  res.status(200).json({ received: true })
})

// Next.js Route Handler:
export async function POST(request: Request) {
  const rawBody = await request.text()
  const signature = request.headers.get("x-notifykit-signature")

  if (!signature || !verifySignature(rawBody, signature)) {
    return Response.json({ error: "Invalid signature" }, { status: 401 })
  }

  const body = JSON.parse(rawBody)
  // Process...
  return Response.json({ received: true })
}`}
      />
      <table>
        <thead>
          <tr><th>Security detail</th><th>Why</th></tr>
        </thead>
        <tbody>
          <tr><td><code>timingSafeEqual</code></td><td>Prevents timing attacks — a naive <code>===</code> comparison leaks info about which bytes matched</td></tr>
          <tr><td>Verify on raw body</td><td>The HMAC is computed over the raw string, not a parsed-and-re-serialized object</td></tr>
          <tr><td>Return 401 on failure</td><td>NotifyKit retries on 5xx but not 4xx — a 401 tells it to stop immediately</td></tr>
          <tr><td>Check <code>metadata.deliveryId</code></td><td>Use as an idempotency key on the receiver to handle retries gracefully</td></tr>
        </tbody>
      </table>
      <div className="callout callout-warn">
        <strong>Always use the raw body for verification.</strong> If your
        framework parses the body before you can access the raw string (e.g.
        Express with <code>json()</code> middleware), configure a raw body
        parser for your webhook route. Parsing and re-serializing can change
        key ordering or whitespace, breaking the signature.
      </div>

      <h3>Formatting for external services</h3>
      <p>
        External services like Slack and Discord expect specific payload shapes.
        Use <code>render()</code> on the webhook channel to transform your
        payload into the format each service expects:
      </p>
      <Code
        code={`// Slack: expects { text } or { blocks }
notification({
  id: "deploy_completed",
  payload: {
    projectName: "string",
    status: "string",
    sha: "string",
    actorName: "string",
  },
  channels: [
    inbox({ title: "Deploy {{status}}: {{projectName}}" }),
    webhook({
      url: "https://hooks.slack.com/services/T.../B.../xxx",
      render: (payload) => ({
        body: JSON.stringify({
          text: \`Deploy *\${payload.status}*: \${payload.projectName} (\${payload.sha.slice(0, 7)})\`,
          blocks: [
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: \`*\${payload.projectName}* deployed by \${payload.actorName}\`,
              },
            },
            {
              type: "context",
              elements: [
                { type: "mrkdwn", text: \`Status: \${payload.status} | SHA: \\\`\${payload.sha.slice(0, 7)}\\\`\` },
              ],
            },
          ],
        }),
      }),
    }),
  ],
})

// Discord: expects { content } or { embeds }
webhook({
  url: "https://discord.com/api/webhooks/123/abc",
  render: (payload) => ({
    body: JSON.stringify({
      content: \`Deploy **\${payload.status}**: \${payload.projectName}\`,
      embeds: [{
        title: payload.projectName,
        description: \`Deployed by \${payload.actorName}\`,
        color: payload.status === "succeeded" ? 0x00ff00 : 0xff0000,
        fields: [
          { name: "SHA", value: \`\\\`\${payload.sha.slice(0, 7)}\\\`\`, inline: true },
          { name: "Status", value: payload.status, inline: true },
        ],
      }],
    }),
  }),
})`}
      />
      <table>
        <thead>
          <tr><th>Service</th><th>Required field</th><th>Rich formatting</th></tr>
        </thead>
        <tbody>
          <tr><td><strong>Slack</strong></td><td><code>text</code> (fallback)</td><td><code>blocks</code> array with Block Kit elements</td></tr>
          <tr><td><strong>Discord</strong></td><td><code>content</code> (plain text)</td><td><code>embeds</code> array with title, description, color, fields</td></tr>
          <tr><td><strong>Microsoft Teams</strong></td><td><code>text</code> or <code>@type: MessageCard</code></td><td>Adaptive Cards via <code>attachments</code></td></tr>
          <tr><td><strong>Custom endpoint</strong></td><td>Whatever your API expects</td><td>Full control via <code>render()</code></td></tr>
        </tbody>
      </table>
      <div className="callout callout-tip">
        <strong>Per-user webhook URLs.</strong> For integrations where each
        user configures their own endpoint (like a Slack incoming webhook per
        workspace), store the URL on the recipient or in the payload and use{" "}
        <code>{`url: "{{webhookUrl}}"`}</code> with a <code>condition</code>{" "}
        that skips when no URL is set. See{" "}
        <Link href="#conditional-channels">conditional channels</Link> below.
      </div>

      <h2>Channel behavior during send</h2>
      <div className="callout callout-tip">
        <strong>Key insight.</strong> Inbox always delivers immediately (it&apos;s
        just a DB write). Everything else goes through the queue and can be
        deferred, retried, or skipped.
      </div>
      <table>
        <thead>
          <tr>
            <th>Channel</th>
            <th>Delivery</th>
            <th>Quiet hours</th>
            <th>Preferences</th>
            <th>Retries</th>
            <th>Fallback</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Inbox</td>
            <td>Immediate (DB write)</td>
            <td>Not affected</td>
            <td>Respects opt-out</td>
            <td>N/A (can&apos;t fail)</td>
            <td>N/A</td>
          </tr>
          <tr>
            <td>Email</td>
            <td>Via queue + provider</td>
            <td>Deferred until window ends</td>
            <td>Respects opt-out</td>
            <td>Up to 5 with backoff</td>
            <td>Supported</td>
          </tr>
          <tr>
            <td>SMS</td>
            <td>Via queue + provider</td>
            <td>Deferred until window ends</td>
            <td>Respects opt-out</td>
            <td>Up to 5 with backoff</td>
            <td>Supported</td>
          </tr>
          <tr>
            <td>Webhook</td>
            <td>Via queue + provider</td>
            <td>Deferred until window ends</td>
            <td>Respects opt-out</td>
            <td>Up to 5 with backoff</td>
            <td>Supported</td>
          </tr>
        </tbody>
      </table>
      <p>
        Retry count and backoff are configured globally via{" "}
        <Link href="/docs/providers">Providers &amp; queues</Link>. Fallback
        channels are configured per-notification — see{" "}
        <Link href="/docs/fallbacks">Fallback channels</Link>.
      </p>

      <h2>Choosing channels for your notifications</h2>
      <p>
        Not every notification needs every channel. Match urgency to
        intrusiveness — higher urgency means more channels and less user
        control:
      </p>
      <div className="features">
        <div className="feature-card">
          <h3>Critical</h3>
          <p><strong>Act now.</strong> User must see this immediately regardless of context. Multiple channels ensure delivery.</p>
          <table style={{ fontSize: "0.85em", marginTop: "0.5rem" }}>
            <tbody>
              <tr><td>Channels</td><td>Email + SMS + Inbox</td></tr>
              <tr><td>Config</td><td><code>required: true</code> + fallback</td></tr>
              <tr><td>Examples</td><td>Security alert, 2FA, payment failed</td></tr>
            </tbody>
          </table>
        </div>
        <div className="feature-card">
          <h3>Important</h3>
          <p><strong>Act soon.</strong> User should know within minutes but can choose how they&apos;re reached.</p>
          <table style={{ fontSize: "0.85em", marginTop: "0.5rem" }}>
            <tbody>
              <tr><td>Channels</td><td>Email + Inbox</td></tr>
              <tr><td>Config</td><td>Default — user can opt out</td></tr>
              <tr><td>Examples</td><td>Team invite, mention, task assigned</td></tr>
            </tbody>
          </table>
        </div>
        <div className="feature-card">
          <h3>Informational</h3>
          <p><strong>FYI.</strong> Nice to know but not worth an interruption. User checks on their own time.</p>
          <table style={{ fontSize: "0.85em", marginTop: "0.5rem" }}>
            <tbody>
              <tr><td>Channels</td><td>Inbox only</td></tr>
              <tr><td>Config</td><td><code>defaultChannels: {`{ email: false }`}</code></td></tr>
              <tr><td>Examples</td><td>New follower, post liked, deploy OK</td></tr>
            </tbody>
          </table>
        </div>
        <div className="feature-card">
          <h3>System-to-system</h3>
          <p><strong>Machine consumer.</strong> No human reads this directly — it triggers automation or syncs state.</p>
          <table style={{ fontSize: "0.85em", marginTop: "0.5rem" }}>
            <tbody>
              <tr><td>Channels</td><td>Webhook (+ Inbox as audit)</td></tr>
              <tr><td>Config</td><td>Rate-limited, signed payload</td></tr>
              <tr><td>Examples</td><td>Slack alert, CI webhook, analytics</td></tr>
            </tbody>
          </table>
        </div>
      </div>
      <div className="callout callout-tip">
        <strong>Start with inbox + email, expand from there.</strong> Most
        apps only need two channels at launch. Add SMS when you have time-critical
        notifications, and webhooks when you integrate with external services.
        Users can always turn off channels they don&apos;t want via{" "}
        <Link href="/docs/preferences">preferences</Link>.
      </div>

      <h2 id="conditional-channels">Conditional channels</h2>
      <p>
        Sometimes a channel should only fire based on runtime data — SMS only
        for high-severity alerts, webhook only when a URL is configured, or
        email only for external users. Use a <code>condition</code> function
        on any channel to gate delivery at send time:
      </p>
      <Code
        code={`notification({
  id: "incident_alert",
  payload: {
    severity: "string",    // "low" | "medium" | "high" | "critical"
    title: "string",
    dashboardUrl: "string",
  },
  channels: [
    // Inbox: always fires
    inbox({
      title: "Incident: {{title}}",
      actionUrl: "{{dashboardUrl}}",
    }),

    // Email: fires for medium+ severity
    email({
      condition: (payload) => payload.severity !== "low",
      subject: "[{{severity}}] {{title}}",
      body: "View dashboard: {{dashboardUrl}}\\n\\nUnsubscribe: {{_unsubscribeUrl}}",
    }),

    // SMS: fires only for critical
    sms({
      condition: (payload) => payload.severity === "critical",
      body: "CRITICAL: {{title}} — check dashboard immediately",
    }),
  ],
})`}
      />
      <p>
        When a condition returns <code>false</code>, the channel is skipped with{" "}
        <code>reason: &quot;condition_false&quot;</code> in the result — no delivery
        attempt, no retry, no fallback trigger.
      </p>

      <table>
        <thead>
          <tr><th>Pattern</th><th>Condition</th><th>Use case</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Severity escalation</strong></td>
            <td><code>{`(p) => p.severity === "critical"`}</code></td>
            <td>Only page oncall for critical incidents, not every warning</td>
          </tr>
          <tr>
            <td><strong>Feature flag</strong></td>
            <td><code>{`(p) => p.smsEnabled === true`}</code></td>
            <td>Gradually roll out SMS to users who opted into the beta</td>
          </tr>
          <tr>
            <td><strong>Payload presence</strong></td>
            <td><code>{`(p) => !!p.webhookUrl`}</code></td>
            <td>Only POST webhook if the user has configured an endpoint</td>
          </tr>
          <tr>
            <td><strong>User type</strong></td>
            <td><code>{`(p) => p.userType === "external"`}</code></td>
            <td>Email external collaborators but only inbox internal team</td>
          </tr>
        </tbody>
      </table>

      <Code
        code={`// Dynamic webhook URL from payload:
notification({
  id: "deploy_completed",
  payload: {
    projectName: "string",
    status: "string",
    webhookUrl: "string",  // empty string if not configured
  },
  channels: [
    inbox({
      title: "Deploy {{status}}: {{projectName}}",
    }),
    webhook({
      condition: (payload) => !!payload.webhookUrl,
      url: "{{webhookUrl}}",   // dynamic — comes from payload
    }),
  ],
})`}
      />

      <div className="callout callout-tip">
        <strong>Conditions vs preferences.</strong> Conditions are developer-controlled
        routing logic (&quot;only SMS for critical&quot;). Preferences are user-controlled
        opt-in/out (&quot;I don&apos;t want email&quot;). Both are checked at send time —
        conditions first, then preferences. A channel that fails its condition is never
        checked against preferences.
      </div>

      <div className="callout callout-warn">
        <strong>Conditions don&apos;t trigger fallbacks.</strong> A{" "}
        <code>condition_false</code> skip is intentional routing, not a failure.
        Fallbacks only fire on delivery failures (<code>channel.failed</code>) or
        missing destinations (<code>missing_address</code>). If you need a backup
        for a conditionally-skipped channel, define the backup as a separate
        channel with the inverse condition.
      </div>

      <h2>Putting it together</h2>
      <p>
        Here&apos;s a single notification that uses three channels. Each renders
        the same payload differently based on the medium:
      </p>
      <Code
        code={`notification({
  id: "task_assigned",
  payload: {
    assignerName: "string",
    taskTitle: "string",
    taskUrl: "string",
    projectName: "string",
  },
  channels: [
    inbox({
      title: "{{assignerName}} assigned you a task",
      body: "{{taskTitle}} in {{projectName}}",
      actionUrl: "{{taskUrl}}",
    }),
    email({
      subject: "New task: {{taskTitle}}",
      body: "{{assignerName}} assigned you '{{taskTitle}}' in {{projectName}}.\\n\\nOpen it: {{taskUrl}}\\n\\nUnsubscribe: {{_unsubscribeUrl}}",
    }),
    webhook({
      url: "https://hooks.slack.com/services/T.../B.../xxx",
    }),
  ],
  // Pipeline options (all optional):
  required: false,              // user can opt out per channel
  defaultChannels: { inbox: true, email: true, webhook: true },
})`}
      />
      <table>
        <thead>
          <tr><th>What happens at send time</th><th>Inbox</th><th>Email</th><th>Webhook</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Preferences checked</strong></td>
            <td>User opted out? → skip</td>
            <td>User opted out? → skip</td>
            <td>User opted out? → skip</td>
          </tr>
          <tr>
            <td><strong>Destination resolved</strong></td>
            <td>Always available (DB write)</td>
            <td>Needs <code>email</code> on recipient</td>
            <td>URL hardcoded in config</td>
          </tr>
          <tr>
            <td><strong>Quiet hours</strong></td>
            <td>Delivers immediately</td>
            <td>Deferred if in window</td>
            <td>Deferred if in window</td>
          </tr>
          <tr>
            <td><strong>Delivery</strong></td>
            <td>Instant DB write</td>
            <td>Queued → provider</td>
            <td>Queued → POST</td>
          </tr>
        </tbody>
      </table>
      <div className="callout callout-tip">
        <strong>Each channel is independent.</strong> If email fails after retries,
        the inbox item and webhook delivery are unaffected. Use{" "}
        <Link href="/docs/fallbacks">fallbacks</Link> to fire an alternate channel
        when one fails.
      </div>

      <h2>Template syntax</h2>
      <p>
        Channel strings support <code>{`{{variable}}`}</code> interpolation.
        Variables come from the <code>payload</code> you pass to{" "}
        <code>send()</code>, plus a few built-in variables injected by the
        engine.
      </p>
      <Code
        code={`// Definition:
notification({
  id: "comment_mentioned",
  payload: { actorName: "string", postTitle: "string", postUrl: "string" },
  channels: [
    inbox({ title: "{{actorName}} mentioned you", body: "In {{postTitle}}", actionUrl: "{{postUrl}}" }),
    email({ subject: "{{actorName}} mentioned you in {{postTitle}}", body: "Open {{postUrl}}" }),
  ],
})

// Send:
await notify.send({
  recipientId: user.id,
  notificationId: "comment_mentioned",
  payload: { actorName: "Rey", postTitle: "Launch Plan", postUrl: "/posts/42" },
})
// → inbox title resolves to "Rey mentioned you"
// → email subject resolves to "Rey mentioned you in Launch Plan"`}
      />
      <table>
        <thead>
          <tr><th>Variable type</th><th>Source</th><th>Examples</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Payload fields</strong></td>
            <td>Your <code>payload</code> object</td>
            <td><code>{`{{actorName}}`}</code>, <code>{`{{orderNumber}}`}</code>, <code>{`{{postUrl}}`}</code></td>
          </tr>
          <tr>
            <td><strong>Built-in: unsubscribe</strong></td>
            <td>Engine (requires <code>unsubscribe</code> config)</td>
            <td><code>{`{{_unsubscribeUrl}}`}</code> — HMAC-signed one-click link</td>
          </tr>
          <tr>
            <td><strong>Built-in: recipient</strong></td>
            <td>Recipient record fields</td>
            <td><code>{`{{_recipient.name}}`}</code>, <code>{`{{_recipient.email}}`}</code></td>
          </tr>
        </tbody>
      </table>
      <div className="callout callout-warn">
        <strong>Missing variables render as empty strings.</strong> If you
        reference <code>{`{{foo}}`}</code> but don&apos;t pass <code>foo</code>{" "}
        in the payload, the template outputs <code>&quot;&quot;</code> — no error
        is thrown at runtime. Use payload validation (typed schemas) to catch
        missing fields at send time.
      </div>

      <h3>Built-in variables</h3>
      <p>
        Variables prefixed with <code>_</code> are injected by the engine and
        don&apos;t need to be in your payload schema:
      </p>
      <table>
        <thead>
          <tr><th>Variable</th><th>Available in</th><th>Value</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><code>{`{{_unsubscribeUrl}}`}</code></td>
            <td>Email only</td>
            <td>Signed URL to unsubscribe from this notification. Requires <code>unsubscribe</code> config.</td>
          </tr>
          <tr>
            <td><code>{`{{_recipient.name}}`}</code></td>
            <td>All channels</td>
            <td>Recipient&apos;s <code>name</code> field from <code>upsertRecipient()</code></td>
          </tr>
          <tr>
            <td><code>{`{{_recipient.email}}`}</code></td>
            <td>All channels</td>
            <td>Recipient&apos;s email address</td>
          </tr>
          <tr>
            <td><code>{`{{_notificationId}}`}</code></td>
            <td>All channels</td>
            <td>The notification&apos;s ID (useful in webhook payloads for routing)</td>
          </tr>
        </tbody>
      </table>
      <Code
        code={`// Using built-in variables in an email:
email({
  subject: "Hi {{_recipient.name}}, {{actorName}} mentioned you",
  body: \`Open {{postUrl}} to reply.

Unsubscribe: {{_unsubscribeUrl}}\`,
})`}
      />
      <div className="callout callout-tip">
        <strong>Templates are intentionally simple.</strong> No conditionals,
        no loops, no filters. If you need complex rendering (HTML emails,
        i18n, conditional sections), use a{" "}
        <code>render()</code> function on your channel config instead — it
        receives the full typed payload and returns the final string.
      </div>

      <h2>Using render() for complex templates</h2>
      <p>
        When <code>{`{{variable}}`}</code> interpolation isn&apos;t enough —
        HTML emails, conditional sections, loops, or i18n — use a{" "}
        <code>render()</code> function instead. It receives the typed payload
        and returns the final string for each field.
      </p>
      <table>
        <thead>
          <tr><th>Approach</th><th>Supports</th><th>Best for</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Template strings</strong> (<code>{`{{var}}`}</code>)</td>
            <td>Variable substitution only</td>
            <td>Simple notifications — title, subject, short body</td>
          </tr>
          <tr>
            <td><strong>render() function</strong></td>
            <td>Conditionals, loops, HTML, i18n, any JS logic</td>
            <td>HTML emails, dynamic content, multi-language, complex formatting</td>
          </tr>
        </tbody>
      </table>

      <h3>Basic render()</h3>
      <p>
        Pass a <code>render</code> function that returns the channel fields.
        It receives the full typed payload:
      </p>
      <Code
        code={`notification({
  id: "order_shipped",
  payload: {
    orderNumber: "string",
    itemCount: "number",
    trackingUrl: "string",
    expedited: "boolean",
  },
  channels: [
    inbox({
      render: (payload) => ({
        title: \`Order \${payload.orderNumber} shipped\`,
        body: payload.expedited
          ? \`\${payload.itemCount} items — expedited shipping\`
          : \`\${payload.itemCount} items on the way\`,
        actionUrl: payload.trackingUrl,
      }),
    }),
    email({
      render: (payload) => ({
        subject: \`Your order \${payload.orderNumber} has shipped\`,
        body: [
          \`Hi! Your order with \${payload.itemCount} item\${payload.itemCount > 1 ? "s" : ""} is on the way.\`,
          payload.expedited ? "Expedited delivery — arriving in 1-2 days." : "",
          \`Track your package: \${payload.trackingUrl}\`,
          "",
          \`Unsubscribe: {{_unsubscribeUrl}}\`,
        ].filter(Boolean).join("\\n"),
      }),
    }),
  ],
})`}
      />
      <div className="callout callout-tip">
        <strong>render() and templates can mix.</strong> Inside a{" "}
        <code>render()</code> return value, you can still use{" "}
        <code>{`{{_unsubscribeUrl}}`}</code> — built-in variables are
        interpolated after your function returns. Only payload variables need
        to be handled in the function.
      </div>

      <h3>HTML emails</h3>
      <p>
        For rich HTML emails, use <code>render()</code> with any templating
        approach — template literals, React email, or a library like mjml:
      </p>
      <Code
        code={`import { renderEmailHtml } from "@/lib/email-templates"

notification({
  id: "weekly_digest",
  payload: {
    recipientName: "string",
    highlights: "string",
    unreadCount: "number",
    weekOf: "string",
  },
  channels: [
    email({
      render: (payload) => ({
        subject: \`Your weekly digest — \${payload.weekOf}\`,
        body: renderEmailHtml({
          heading: \`Hey \${payload.recipientName}, here's your week\`,
          sections: [
            { title: "Highlights", content: payload.highlights },
            { title: "Unread", content: \`\${payload.unreadCount} notifications waiting\` },
          ],
          footer: { unsubscribeUrl: "{{_unsubscribeUrl}}" },
        }),
        html: true,
      }),
    }),
  ],
})`}
      />

      <h3>Internationalization (i18n)</h3>
      <p>
        Use <code>render()</code> with your i18n library to send notifications
        in the recipient&apos;s language:
      </p>
      <Code
        code={`import { t } from "@/lib/i18n"

notification({
  id: "comment_mentioned",
  payload: {
    actorName: "string",
    postTitle: "string",
    postUrl: "string",
    locale: "string",
  },
  channels: [
    inbox({
      render: (payload) => ({
        title: t(payload.locale, "mention.title", { actor: payload.actorName }),
        body: t(payload.locale, "mention.body", { post: payload.postTitle }),
        actionUrl: payload.postUrl,
      }),
    }),
    email({
      render: (payload) => ({
        subject: t(payload.locale, "mention.email_subject", {
          actor: payload.actorName,
          post: payload.postTitle,
        }),
        body: t(payload.locale, "mention.email_body", {
          actor: payload.actorName,
          url: payload.postUrl,
        }),
      }),
    }),
  ],
})`}
      />
      <table>
        <thead>
          <tr><th>Pattern</th><th>How to pass locale</th><th>Trade-off</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Locale in payload</strong></td>
            <td>Include <code>locale: user.locale</code> at send time</td>
            <td>Simple — works with any i18n library. Payload grows slightly.</td>
          </tr>
          <tr>
            <td><strong>Locale on recipient</strong></td>
            <td>Store on the recipient record, access via <code>{`{{_recipient.locale}}`}</code></td>
            <td>Cleaner payloads, but requires a custom recipient field.</td>
          </tr>
        </tbody>
      </table>
      <div className="callout callout-tip">
        <strong>render() is sync.</strong> It cannot be <code>async</code> — no
        database queries or API calls inside it. Load all the data you need
        into the payload at send time, then render from that. This keeps the
        delivery pipeline fast and predictable.
      </div>

      <h2>Testing channels</h2>
      <p>
        Template strings and <code>render()</code> functions are the most common
        source of notification bugs — a typo in a variable name produces a blank
        field silently. Test at three levels:
      </p>
      <table>
        <thead>
          <tr><th>Level</th><th>What you verify</th><th>How</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Unit</strong></td>
            <td><code>render()</code> output for edge-case payloads</td>
            <td>Call the function directly in a test file</td>
          </tr>
          <tr>
            <td><strong>Integration</strong></td>
            <td>Full template resolution including built-in variables</td>
            <td><code>explain()</code> with a real payload — no delivery</td>
          </tr>
          <tr>
            <td><strong>E2E</strong></td>
            <td>Actual delivery reaches the destination</td>
            <td>Dev mode with test providers (console sink, Mailpit, etc.)</td>
          </tr>
        </tbody>
      </table>

      <h3>Unit-testing render() functions</h3>
      <p>
        Extract <code>render()</code> functions so they&apos;re importable, then
        test edge cases directly:
      </p>
      <Code
        code={`// notifications/order-shipped.ts
export const orderShippedInbox = (payload) => ({
  title: \`Order \${payload.orderNumber} shipped\`,
  body: payload.itemCount === 1
    ? "1 item on the way"
    : \`\${payload.itemCount} items on the way\`,
  actionUrl: payload.trackingUrl,
})

// notifications/order-shipped.test.ts
import { orderShippedInbox } from "./order-shipped"

test("singular item text", () => {
  const result = orderShippedInbox({
    orderNumber: "ABC-123",
    itemCount: 1,
    trackingUrl: "/track/abc",
    expedited: false,
  })
  expect(result.body).toBe("1 item on the way")
})

test("plural item text", () => {
  const result = orderShippedInbox({
    orderNumber: "ABC-123",
    itemCount: 5,
    trackingUrl: "/track/abc",
    expedited: false,
  })
  expect(result.body).toBe("5 items on the way")
})`}
      />

      <h3>Integration testing with explain()</h3>
      <p>
        <code>explain()</code> dry-runs the full pipeline — template resolution,
        preference checks, channel evaluation — without writing any records or
        triggering providers. Use it to verify the final rendered output:
      </p>
      <Code
        code={`import { notify } from "./notifykit"

test("comment_mentioned resolves all template variables", async () => {
  const result = await notify.explain({
    recipientId: "user_test",
    notificationId: "comment_mentioned",
    payload: { actorName: "Rey", postTitle: "Launch Plan", postUrl: "/posts/42" },
  })

  // Verify no unresolved {{variables}} remain
  const inboxChannel = result.channels.find(c => c.name === "inbox")
  expect(inboxChannel.rendered.title).toBe("Rey mentioned you")
  expect(inboxChannel.rendered.title).not.toMatch(/\\{\\{/)

  // Verify channel was not skipped
  expect(inboxChannel.status).toBe("would_deliver")
})`}
      />
      <div className="callout callout-tip">
        <strong>Catch blank fields in CI.</strong> Add an assertion that no
        rendered field is empty or contains <code>{`{{`}</code> — this catches
        payload/template mismatches before they reach users. Pattern:{" "}
        <code>{`expect(rendered.title).not.toMatch(/\\{\\{|^$/)`}</code>
      </div>

      <h3>Dev mode: inspect without real providers</h3>
      <p>
        In dev mode, channel deliveries are logged to the console instead of
        hitting real providers. This lets you iterate on templates visually:
      </p>
      <Code
        code={`// notifykit.config.ts
import { createNotifyKit } from "@notifykitjs/core"
import { memoryAdapter } from "@notifykitjs/core"

export const notify = createNotifyKit({
  database: memoryAdapter(),
  devMode: process.env.NODE_ENV !== "production",
  // In dev mode:
  // - Email renders to console (subject + body)
  // - SMS renders to console (body)
  // - Webhook logs the full payload without POSTing
  // - Inbox writes to the in-memory DB as normal
})`}
      />
      <p>
        Sample dev mode console output:
      </p>
      <Code
        code={`// Console when devMode is enabled:
// ┌─────────────────────────────────────────────────
// │ 📧 EMAIL → user_123
// │ Subject: Rey mentioned you in Launch Plan
// │ Body: Open /posts/42 to reply.
// │
// │ Unsubscribe: http://localhost:3000/unsubscribe?token=dev_xxx
// └─────────────────────────────────────────────────
// ┌─────────────────────────────────────────────────
// │ 📥 INBOX → user_123
// │ Title: Rey mentioned you
// │ Body: In Launch Plan
// │ Action: /posts/42
// └─────────────────────────────────────────────────`}
      />
      <div className="callout callout-tip">
        <strong>Dev mode still runs the full pipeline.</strong> Preferences,
        quiet hours, deduplication, and digests all apply — only the final
        provider call is replaced with a console log. This means dev mode
        catches pipeline bugs, not just template bugs.
      </div>

      <h2>Debugging channel delivery</h2>
      <p>
        When a notification doesn&apos;t arrive, work through these checks in
        order. Most issues resolve at step 1 or 2:
      </p>

      <div className="overview-flow">
        <div className="overview-flow-step">
          <span className="overview-flow-number">1</span>
          <div>
            <strong>Check <code>result.skipped</code></strong>
            <p>Was the channel skipped entirely? <code>reason</code> tells you why: preferences, missing address, rate limit, or dedup match.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">2</span>
          <div>
            <strong>Check <code>result.deferredChannels</code></strong>
            <p>Was it deferred by quiet hours? The delivery will fire when the window ends — call <code>flushScheduledSends()</code> to release manually.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">3</span>
          <div>
            <strong>Check <code>result.deliveries</code></strong>
            <p>Was it attempted but failed? Look at <code>status</code> and <code>error</code>. Provider errors (5xx, timeout) are retried automatically.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">4</span>
          <div>
            <strong>Check <code>result.digested</code> / <code>result.rateLimited</code></strong>
            <p>Was the send absorbed? Digested sends deliver later; rate-limited sends are silently dropped.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">5</span>
          <div>
            <strong>Use <code>explain()</code></strong>
            <p>Dry-run the same send. Shows the full resolution trail — preferences, quiet hours, channel evaluation — without writing any records.</p>
          </div>
        </div>
      </div>

      <p>
        The table below maps specific symptoms to their root cause:
      </p>
      <table>
        <thead>
          <tr><th>Symptom</th><th>Channel</th><th>Likely cause</th><th>Fix</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>Item not in inbox</td>
            <td>Inbox</td>
            <td>Recipient opted out via preferences</td>
            <td>Check <code>result.skipped</code> — look for <code>reason: &quot;preference_opt_out&quot;</code></td>
          </tr>
          <tr>
            <td>Email never arrives</td>
            <td>Email</td>
            <td>No <code>email</code> on recipient record</td>
            <td>Check <code>result.skipped</code> for <code>reason: &quot;missing_destination&quot;</code></td>
          </tr>
          <tr>
            <td>Email delayed by hours</td>
            <td>Email</td>
            <td>Recipient is in quiet hours window</td>
            <td>Check <code>result.deferredChannels</code> — delivery will happen when window ends</td>
          </tr>
          <tr>
            <td>SMS not delivered</td>
            <td>SMS</td>
            <td>Provider returned error (invalid number, region blocked)</td>
            <td>Check <code>result.deliveries</code> for the SMS entry — <code>error</code> field has provider message</td>
          </tr>
          <tr>
            <td>Webhook returns 4xx/5xx</td>
            <td>Webhook</td>
            <td>Endpoint down, auth expired, or payload rejected</td>
            <td>Check <code>result.deliveries</code> — retries happen automatically up to 5 times</td>
          </tr>
          <tr>
            <td>Nothing sent at all</td>
            <td>All</td>
            <td>Deduplication key matched a recent send</td>
            <td>Check <code>result.idempotent</code> — the original send&apos;s result is returned</td>
          </tr>
          <tr>
            <td>Send returns but no delivery records</td>
            <td>All</td>
            <td>Notification was digested</td>
            <td>Check <code>result.digested === true</code> — it will deliver when the digest window fires</td>
          </tr>
        </tbody>
      </table>

      <h3>Inspecting the result programmatically</h3>
      <Code
        code={`const result = await notify.send({
  recipientId: user.id,
  notificationId: "comment_mentioned",
  payload: { actorName: "Rey", postTitle: "Launch", postUrl: "/posts/1" },
})

// Was anything skipped?
for (const skip of result.skipped) {
  console.log(\`Channel \${skip.channel} skipped: \${skip.reason}\`)
  // → "Channel email skipped: missing_destination"
  // → "Channel sms skipped: preference_opt_out"
}

// Did any delivery fail after retries?
const failures = result.deliveries.filter(d => d.status === "failed")
for (const fail of failures) {
  console.log(\`\${fail.channel} failed: \${fail.error}\`)
  // → "email failed: 550 mailbox not found"
}

// Was it deferred by quiet hours?
if (result.deferredChannels.length > 0) {
  console.log(\`Deferred: \${result.deferredChannels.join(", ")}\`)
  // → "Deferred: email, sms"
}`}
      />
      <div className="callout callout-tip">
        <strong>Use the <code>delivery.failed</code> hook for monitoring.</strong>{" "}
        Instead of checking every send result manually, set up a{" "}
        <Link href="/docs/hooks">hook</Link> that fires on failures and routes
        them to your error tracker (Sentry, Datadog, etc.).
      </div>

      <div className="callout callout-warn">
        <strong>Template errors are silent.</strong> If a{" "}
        <code>{`{{variable}}`}</code> is missing from the payload, the template
        renders an empty string — no error is thrown. If your messages look
        blank or incomplete, verify the payload fields match your template
        variables exactly.
      </div>

      <div className="button-row">
        <Link href="/docs/preferences" className="primary">User preferences</Link>
        <Link href="/docs/providers">Email providers</Link>
        <Link href="/docs/fallbacks">Fallback channels</Link>
      </div>

      <div className="page-nav">
        <Link href="/docs/sending">
          <span className="page-nav-label">Previous</span>
          <span className="page-nav-title">Sending</span>
        </Link>
        <Link href="/docs/preferences">
          <span className="page-nav-label">Next</span>
          <span className="page-nav-title">Preferences & unsubscribe</span>
        </Link>
      </div>
    </article>
  );
}

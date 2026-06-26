import type { Metadata } from "next";
import Link from "next/link";
import { Code } from "../../_components/code";

export const metadata: Metadata = { title: "TypeScript types" };

export default function TypesPage() {
  return (
    <article>
      <h1>TypeScript types</h1>
      <p>
        All types are exported from <code>@notifykitjs/core</code>. This
        page documents the most commonly referenced ones.
      </p>

      <table>
        <thead>
          <tr><th>Type</th><th>Used for</th></tr>
        </thead>
        <tbody>
          <tr><td><code>NotificationDefinition</code></td><td>Defining notifications</td></tr>
          <tr><td><code>ChannelConfig</code></td><td>Inbox, email, SMS, webhook channel templates</td></tr>
          <tr><td><code>Recipient</code></td><td>User profiles with contact info and quiet hours</td></tr>
          <tr><td><code>InboxItem</code></td><td>Inbox entries with read/archive state</td></tr>
          <tr><td><code>DeliveryRecord</code></td><td>Delivery attempts and their outcomes</td></tr>
          <tr><td><code>RecipientPreference</code></td><td>Per-notification channel opt-in/out</td></tr>
          <tr><td><code>EmailProvider / SmsProvider</code></td><td>Implementing custom providers</td></tr>
          <tr><td><code>Queue / RetryPolicy</code></td><td>Custom queue implementations</td></tr>
          <tr><td><code>SkipReason</code></td><td>Understanding why a channel was skipped</td></tr>
        </tbody>
      </table>

      <h2>Importing types</h2>
      <p>
        Everything exports from a single path. Import only what you need:
      </p>
      <Code
        code={`import type {
  SendResult,
  InboxItem,
  DeliveryRecord,
  RecipientPreference,
  EmailProvider,
  SkipReason,
} from "@notifykitjs/core"`}
      />
      <table>
        <thead>
          <tr><th>Building</th><th>Types you&apos;ll reach for</th></tr>
        </thead>
        <tbody>
          <tr><td>Notification definitions</td><td><code>NotificationDefinition</code>, <code>ChannelConfig</code>, <code>DigestConfig</code></td></tr>
          <tr><td>Send result handling</td><td><code>SendResult</code>, <code>SkipReason</code>, <code>DeliveryRecord</code></td></tr>
          <tr><td>Custom provider</td><td><code>EmailProvider</code>, <code>SmsProvider</code>, <code>WebhookProvider</code></td></tr>
          <tr><td>Custom queue</td><td><code>Queue</code>, <code>RetryPolicy</code>, <code>DeliveryJob</code></td></tr>
          <tr><td>UI / client code</td><td><code>InboxItem</code>, <code>RecipientPreference</code></td></tr>
        </tbody>
      </table>

      <h2>How types flow through the system</h2>
      <p>
        Types aren&apos;t isolated — they flow from your definition through the
        engine and into results. Understanding these connections helps you write
        typed utilities without casting:
      </p>
      <div className="overview-flow">
        <div className="overview-flow-step">
          <span className="overview-flow-number">D</span>
          <div>
            <strong>NotificationDefinition</strong>
            <p>You write: <code>id</code>, <code>payload</code> schema, <code>channels</code>. TypeScript infers <code>Id</code> and <code>PayloadSchema</code> as literal types.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">S</span>
          <div>
            <strong>send() input</strong>
            <p>Narrowed by <code>notificationId</code>. Pass <code>&quot;comment_mentioned&quot;</code> and TypeScript enforces <em>that notification&apos;s</em> payload shape.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">R</span>
          <div>
            <strong>SendResult</strong>
            <p>Contains <code>NotificationRecord</code>, <code>InboxItem[]</code>, <code>DeliveryRecord[]</code>, <code>SkippedDelivery[]</code>. All typed — no unknown fields.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">H</span>
          <div>
            <strong>Hook context</strong>
            <p>Hooks receive typed objects: <code>delivery.sent</code> gives you a <code>DeliveryRecord</code>, <code>notification.created</code> gives you a <code>NotificationRecord</code>.</p>
          </div>
        </div>
      </div>

      <table>
        <thead>
          <tr><th>You define</th><th>TypeScript infers</th><th>You get back</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><code>id: &quot;comment_mentioned&quot;</code></td>
            <td>Literal type <code>&quot;comment_mentioned&quot;</code></td>
            <td><code>send()</code> only accepts this exact string for <code>notificationId</code></td>
          </tr>
          <tr>
            <td><code>payload: {`{ actorName: "string" }`}</code></td>
            <td><code>{`{ actorName: string }`}</code></td>
            <td><code>send()</code> requires <code>actorName</code> when this ID is used</td>
          </tr>
          <tr>
            <td><code>channels: [inbox(...), email(...)]</code></td>
            <td>Channel config union</td>
            <td><code>result.deliveries[].channel</code> is <code>&quot;inbox&quot; | &quot;email&quot;</code></td>
          </tr>
          <tr>
            <td><code>as const</code> on the array</td>
            <td>Tuple of all definitions</td>
            <td><code>notificationId</code> is a union of all registered IDs, not <code>string</code></td>
          </tr>
        </tbody>
      </table>

      <div className="callout callout-warn">
        <strong>The <code>as const</code> assertion is critical.</strong> Without it,
        TypeScript widens <code>&quot;comment_mentioned&quot;</code> to{" "}
        <code>string</code> and you lose all narrowing. Your <code>send()</code>
        call would accept any string as <code>notificationId</code> and any
        object as <code>payload</code> — defeating the purpose.
      </div>

      <h2>Extracting types from definitions</h2>
      <p>
        You don&apos;t need to manually duplicate your payload types. Extract them
        from the definitions themselves:
      </p>
      <Code
        code={`import type { InferPayload, InferNotificationId } from "@notifykitjs/core"
import type { notify } from "@/lib/notifykit"

// Extract the union of all notification IDs
type NotificationId = InferNotificationId<typeof notify>
// → "comment_mentioned" | "order_shipped" | "team_invite"

// Extract the payload type for a specific notification
type CommentPayload = InferPayload<typeof notify, "comment_mentioned">
// → { actorName: string; postTitle: string; postUrl: string }

// Use in your own utilities:
function trackNotificationSent(id: NotificationId, payload: Record<string, unknown>) {
  analytics.track("notification_sent", { notificationId: id, ...payload })
}`}
      />
      <table>
        <thead>
          <tr><th>Utility type</th><th>Extracts</th><th>Use for</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><code>InferNotificationId&lt;T&gt;</code></td>
            <td>Union of all registered notification IDs</td>
            <td>Typed switch statements, exhaustiveness checks, analytics events</td>
          </tr>
          <tr>
            <td><code>InferPayload&lt;T, Id&gt;</code></td>
            <td>Payload shape for a specific notification</td>
            <td>Typing helper functions that construct payloads, test factories</td>
          </tr>
          <tr>
            <td><code>InferSendInput&lt;T&gt;</code></td>
            <td>Full <code>send()</code> input union</td>
            <td>Wrapping <code>send()</code> in a queue job or server action</td>
          </tr>
        </tbody>
      </table>
      <Code
        code={`// Common pattern: typed wrapper for background job queues
import type { InferSendInput } from "@notifykitjs/core"
import type { notify } from "@/lib/notifykit"

type SendJob = InferSendInput<typeof notify>

// Your queue enqueues typed jobs:
async function enqueueSend(job: SendJob) {
  await queue.add("notification:send", job)
}

// Your worker processes them:
async function processSend(job: SendJob) {
  await notify.send(job)
}

// Both sides are fully typed — if you add a new notification,
// the worker automatically accepts its payload shape.`}
      />
      <div className="callout callout-tip">
        <strong>Derive, don&apos;t duplicate.</strong> If you find yourself
        writing <code>type CommentPayload = {`{ actorName: string; ... }`}</code>{" "}
        by hand, use <code>InferPayload</code> instead. The definition is the
        single source of truth — derived types stay in sync automatically when
        you add or rename fields.
      </div>

      <h2>Type map</h2>
      <p>
        Every type belongs to one layer. Use this to quickly find what
        you&apos;re looking for:
      </p>
      <table>
        <thead>
          <tr><th>Layer</th><th>Types</th><th>You touch these when</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Definition</strong></td>
            <td><code>NotificationDefinition</code>, <code>ChannelConfig</code>, <code>DigestConfig</code>, <code>RateLimitConfig</code></td>
            <td>Writing notification definitions in <code>lib/notifications/</code></td>
          </tr>
          <tr>
            <td><strong>Input</strong></td>
            <td><code>InferSendInput</code>, <code>InferPayload</code>, <code>InferNotificationId</code></td>
            <td>Typing wrappers around <code>send()</code> — queues, server actions, helpers</td>
          </tr>
          <tr>
            <td><strong>Output</strong></td>
            <td><code>SendResult</code>, <code>InboxItem</code>, <code>DeliveryRecord</code>, <code>SkipReason</code></td>
            <td>Inspecting what happened after a send — logging, analytics, conditional UI</td>
          </tr>
          <tr>
            <td><strong>State</strong></td>
            <td><code>Recipient</code>, <code>RecipientPreference</code>, <code>QuietHours</code>, <code>SecurityScope</code></td>
            <td>Managing user profiles, preferences, and tenant scoping</td>
          </tr>
          <tr>
            <td><strong>Extension</strong></td>
            <td><code>EmailProvider</code>, <code>SmsProvider</code>, <code>WebhookProvider</code>, <code>Queue</code>, <code>RetryPolicy</code>, <code>DatabaseAdapter</code></td>
            <td>Building custom providers, queues, or database adapters</td>
          </tr>
        </tbody>
      </table>
      <div className="callout callout-tip">
        <strong>Most apps only need Output types.</strong> If you&apos;re using
        the built-in adapters and providers, you&apos;ll mainly import{" "}
        <code>SendResult</code>, <code>InboxItem</code>, and{" "}
        <code>SkipReason</code> for result handling. The Definition layer is
        handled by the <code>notification()</code> helper, and Extension types
        are only needed when building custom integrations.
      </div>

      <h2>NotificationDefinition</h2>
      <div className="callout callout-tip">
        <strong>Only 3 fields are required:</strong> <code>id</code>,{" "}
        <code>payload</code>, and <code>channels</code>. Everything else is
        opt-in as your needs grow.
      </div>
      <Code
        code={`type NotificationDefinition<Id extends string, S extends PayloadSchema> = {
  // Required
  id: Id
  payload: S
  channels: ChannelConfig[]

  // Delivery control
  digest?: DigestConfig<S>
  rateLimit?: RateLimitConfig
  fallback?: InboxChannelConfig | FallbackRule[]
  required?: boolean
  defaultChannels?: ChannelPreferenceMap

  // Metadata
  description?: string
  category?: string
  classification?: "transactional" | "product" | "marketing"
  version?: number

  // Security & validation
  redact?: readonly string[]
  validate?: (payload: unknown) => Record<string, unknown>
}`}
      />

      <h2>Channel configs</h2>
      <Code
        code={`type InboxChannelConfig = {
  type: "inbox"
  title: string
  body?: string
  actionUrl?: string
}

type EmailChannelConfig = {
  type: "email"
  subject: string
  body: string
  html?: boolean
}

type SmsChannelConfig = {
  type: "sms"
  body: string
}

type WebhookChannelConfig = {
  type: "webhook"
  url: string
  headers?: Record<string, string>
}

type ChannelConfig = InboxChannelConfig | EmailChannelConfig | SmsChannelConfig | WebhookChannelConfig
type ChannelType = "inbox" | "email" | "sms" | "webhook"`}
      />

      <h2>Recipient</h2>
      <Code
        code={`type Recipient = {
  id: string
  tenantId?: string
  workspaceId?: string
  email?: string
  phone?: string
  name?: string
  quietHours?: QuietHours | null
  createdAt: Date
  updatedAt: Date
}

type QuietHours = {
  start: string    // "HH:MM" 24h format
  end: string      // "HH:MM" 24h format
  timezone?: string // IANA timezone, defaults to "UTC"
}`}
      />

      <h2>InboxItem</h2>
      <Code
        code={`type InboxItem = {
  id: string
  notificationRecordId: string
  recipientId: string
  tenantId?: string
  workspaceId?: string
  notificationId: string
  title: string
  body?: string
  actionUrl?: string
  readAt?: Date | null
  archivedAt?: Date | null
  createdAt: Date
}`}
      />

      <h2>DeliveryRecord</h2>
      <Code
        code={`type DeliveryRecord = {
  id: string
  notificationRecordId: string
  recipientId: string
  tenantId?: string
  workspaceId?: string
  notificationId: string
  channel: "email" | "webhook" | "sms" | "inbox"
  provider: string
  status: "pending" | "sent" | "failed" | "skipped"
  to?: string
  subject?: string
  body?: string
  providerMessageId?: string
  error?: string
  skipReason?: SkipReason
  skipDetails?: string
  attempts: number
  createdAt: Date
  updatedAt: Date
  sentAt?: Date | null
  failedAt?: Date | null
}`}
      />

      <h2>RecipientPreference</h2>
      <Code
        code={`type RecipientPreference = {
  recipientId: string
  tenantId?: string
  workspaceId?: string
  notificationId: string
  channels: ChannelPreferenceMap
  updatedAt: Date
}

type ChannelPreferenceMap = Partial<Record<ChannelType, boolean>>`}
      />

      <h2>Provider interfaces</h2>
      <table>
        <thead>
          <tr><th>Interface</th><th>Input</th><th>Return</th></tr>
        </thead>
        <tbody>
          <tr><td><code>EmailProvider</code></td><td><code>to</code>, <code>subject</code>, <code>body</code></td><td rowSpan={3}><code>{`{ providerMessageId? }`}</code> — stored on the delivery record for tracking</td></tr>
          <tr><td><code>SmsProvider</code></td><td><code>to</code>, <code>body</code></td></tr>
          <tr><td><code>WebhookProvider</code></td><td><code>url</code>, <code>headers</code>, <code>payload</code></td></tr>
        </tbody>
      </table>
      <Code
        code={`type EmailProvider = {
  id: string
  send(input: { to: string; subject: string; body: string }): Promise<{ providerMessageId?: string }>
}

type SmsProvider = {
  id: string
  send(input: { to: string; body: string }): Promise<{ providerMessageId?: string }>
}

type WebhookProvider = {
  id: string
  signed?: boolean
  send(input: {
    url: string
    headers: Record<string, string>
    payload: {
      notificationId: string
      recipientId: string
      tenantId?: string
      workspaceId?: string
      payload: Record<string, unknown>
      sentAt: string
    }
  }): Promise<{ providerMessageId?: string }>
}`}
      />

      <h2>Queue &amp; retry</h2>
      <Code
        code={`type Queue = {
  enqueue(job: DeliveryJob, run: (job: DeliveryJob) => Promise<void>): void | Promise<void>
  drain(): Promise<void>
}

type RetryPolicy = {
  maxAttempts: number
  delayMs(attempt: number): number
}`}
      />

      <h2>SecurityScope</h2>
      <Code
        code={`type SecurityScope = {
  tenantId?: string
  organizationId?: string  // alias for tenantId
  workspaceId?: string
}`}
      />

      <h2>SkipReason</h2>
      <p>
        When a channel is skipped, <code>result.skipped[].reason</code> tells
        you why:
      </p>
      <table>
        <thead>
          <tr><th>Reason</th><th>What happened</th></tr>
        </thead>
        <tbody>
          <tr><td><code>preferences_disabled</code></td><td>User opted out of this channel for this notification</td></tr>
          <tr><td><code>missing_address</code></td><td>Recipient has no email/phone for this channel</td></tr>
          <tr><td><code>missing_provider</code></td><td>No provider configured for this channel type</td></tr>
          <tr><td><code>rate_limited</code></td><td>Send exceeded the notification&apos;s rate limit</td></tr>
          <tr><td><code>quiet_hours_deferred</code></td><td>Deferred — will send when quiet hours end</td></tr>
          <tr><td><code>duplicate</code></td><td>Matched an existing dedup key within the window</td></tr>
          <tr><td><code>idempotent_replay</code></td><td>Idempotency key already exists — original result returned</td></tr>
          <tr><td><code>unsubscribed</code></td><td>User unsubscribed via email link</td></tr>
          <tr><td><code>invalid_payload</code></td><td>Payload failed schema validation</td></tr>
          <tr><td><code>suppressed</code></td><td>All channels were skipped — notification had no effect</td></tr>
          <tr><td><code>condition_false</code></td><td>A conditional channel rule evaluated to false</td></tr>
          <tr><td><code>expired</code></td><td>Scheduled send expired before delivery</td></tr>
          <tr><td><code>disabled_in_dev</code></td><td>Channel disabled in dev mode configuration</td></tr>
          <tr><td><code>required_override</code></td><td>Preferences were bypassed by <code>required: true</code></td></tr>
        </tbody>
      </table>

      <h2>Working with SendResult</h2>
      <p>
        <code>SendResult</code> is the most common type you&apos;ll interact
        with. Here are practical patterns for inspecting and acting on it:
      </p>
      <Code
        code={`import type { SendResult, SkipReason } from "@notifykitjs/core"

async function sendAndLog(result: SendResult) {
  // Was the notification actually delivered to any channel?
  const delivered = result.deliveries.length > 0 || result.inboxItems.length > 0

  // Was it silently absorbed?
  if (result.rateLimited) return "dropped_by_rate_limit"
  if (result.digested) return "buffered_in_digest"
  if (result.idempotent) return "duplicate_replay"

  // Which channels were skipped and why?
  const skippedEmail = result.skipped.find(s => s.channel === "email")
  if (skippedEmail) {
    switch (skippedEmail.reason) {
      case "preferences_disabled": // user opted out — expected
        break
      case "missing_address": // no email on file — maybe prompt user
        await promptUserForEmail(result.notification?.recipientId)
        break
      case "missing_provider": // dev oversight — log a warning
        logger.warn("No email provider configured")
        break
    }
  }

  // Track which channels actually fired
  const channels = result.deliveries.map(d => d.channel)
  analytics.track("notification_sent", {
    id: result.notification?.notificationId,
    channels,
    skipped: result.skipped.map(s => \`\${s.channel}:\${s.reason}\`),
  })

  return delivered ? "delivered" : "suppressed"
}`}
      />
      <table>
        <thead>
          <tr><th>Pattern</th><th>Fields to check</th><th>Use case</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>Did anything deliver?</td>
            <td><code>deliveries.length + inboxItems.length &gt; 0</code></td>
            <td>Showing &quot;Notification sent&quot; vs &quot;Notification suppressed&quot; toasts</td>
          </tr>
          <tr>
            <td>Why was email skipped?</td>
            <td><code>skipped.find(s =&gt; s.channel === &quot;email&quot;)?.reason</code></td>
            <td>Debugging &quot;user didn&apos;t get email&quot; support tickets</td>
          </tr>
          <tr>
            <td>Is this a retry replay?</td>
            <td><code>result.idempotent === true</code></td>
            <td>Avoiding double-counting in analytics</td>
          </tr>
          <tr>
            <td>Was it deferred?</td>
            <td><code>result.deferredChannels.length &gt; 0</code></td>
            <td>Showing &quot;Will deliver at 8am&quot; in the UI</td>
          </tr>
        </tbody>
      </table>
      <div className="callout callout-tip">
        <strong>Type narrowing works out of the box.</strong> When{" "}
        <code>result.rateLimited</code> is <code>true</code>,{" "}
        <code>result.notification</code> is <code>null</code> — TypeScript
        narrows this automatically. No type assertions needed.
      </div>

      <div className="page-nav">
        <Link href="/docs/api">
          <span className="page-nav-label">Previous</span>
          <span className="page-nav-title">API reference</span>
        </Link>
        <Link href="/docs/handler-routes">
          <span className="page-nav-label">Next</span>
          <span className="page-nav-title">Handler routes</span>
        </Link>
      </div>
    </article>
  );
}

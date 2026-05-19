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

      <h2>NotificationDefinition</h2>
      <Code
        code={`type NotificationDefinition<Id extends string, S extends PayloadSchema> = {
  id: Id
  payload: S
  channels: ChannelConfig[]
  digest?: DigestConfig<S>
  rateLimit?: RateLimitConfig
  fallback?: InboxChannelConfig | FallbackRule[]
  description?: string
  category?: string
  version?: number
  redact?: readonly string[]
  validate?: (payload: unknown) => Record<string, unknown>
  required?: boolean
  defaultChannels?: ChannelPreferenceMap
  classification?: "transactional" | "product" | "marketing"
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
      <Code
        code={`type SkipReason =
  | "preferences_disabled"
  | "required_override"
  | "missing_address"
  | "missing_provider"
  | "rate_limited"
  | "quiet_hours_deferred"
  | "duplicate"
  | "idempotent_replay"
  | "condition_false"
  | "expired"
  | "unsubscribed"
  | "suppressed"
  | "invalid_payload"
  | "disabled_in_dev"`}
      />

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

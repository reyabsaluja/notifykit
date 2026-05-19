import type { Metadata } from "next";
import Link from "next/link";
import { Code } from "../../_components/code";

export const metadata: Metadata = { title: "Defining notifications" };

export default function DefiningPage() {
  return (
    <article>
      <h1>Defining notifications</h1>
      <p>
        A notification has an <code>id</code>, a <code>payload</code> schema,
        and a list of <code>channels</code>. Define them in code. Your
        notification IDs and payload shapes become typed values the rest of
        your app can rely on.
      </p>

      <h2>Basic definition</h2>
      <Code
        code={`import { channel, notification } from "@notifykitjs/core"

const inbox = channel.inbox()
const email = channel.email()

export const commentMentioned = notification({
  id: "comment_mentioned",
  payload: {
    actorName: "string",
    postTitle: "string",
    postUrl: "string",
  },
  channels: [
    inbox({
      title: "{{actorName}} mentioned you",
      body: "In {{postTitle}}",
      actionUrl: "{{postUrl}}",
    }),
    email({
      subject: "{{actorName}} mentioned you in {{postTitle}}",
      body: "Open {{postUrl}} to reply.",
    }),
  ],
})`}
      />

      <h2>Payload schema</h2>
      <p>
        The schema is <code>Record&lt;string, &quot;string&quot; | &quot;number&quot; |
        &quot;boolean&quot;&gt;</code>. It&apos;s intentionally simple — enough to
        type-check payloads at the <code>send()</code> call site and validate
        at runtime.
      </p>
      <Code
        code={`notification({
  id: "order_shipped",
  payload: {
    orderNumber: "string",
    total:       "number",
    expedited:   "boolean",
  },
  channels: [...],
})`}
      />
      <p>
        For complex validation (nested objects, arrays, refinements), use the{" "}
        <code>validate</code> field with Zod, Valibot, or ArkType:
      </p>
      <Code
        code={`import { z } from "zod"
import { withZod } from "@notifykitjs/core/zod"

notification({
  id: "invoice_created",
  payload: { invoiceId: "string", amount: "number" },
  validate: withZod(z.object({
    invoiceId: z.string().uuid(),
    amount: z.number().positive(),
  })),
  channels: [...],
})`}
      />

      <h2>Templates</h2>
      <p>
        Every channel&apos;s string fields support <code>{`{{key}}`}</code>{" "}
        interpolation against the payload. Missing keys render as empty strings.
      </p>
      <p>
        Email <code>body</code> additionally gets a reserved{" "}
        <code>{`{{_unsubscribeUrl}}`}</code> variable when unsubscribe is
        configured — see{" "}
        <Link href="/docs/preferences">Preferences &amp; unsubscribe</Link>.
      </p>

      <h2>Optional fields</h2>
      <Code
        code={`notification({
  id: "team_invite",
  payload: { inviterName: "string", teamName: "string" },
  channels: [...],

  // Metadata
  description: "Sent when a user is invited to a team",
  category: "social",
  classification: "product",
  version: 1,

  // Behavior
  required: true,                         // bypasses preferences
  defaultChannels: { email: true, inbox: true },
  redact: ["inviterName"],                // mask in logs

  // Delivery control
  rateLimit: { max: 5, windowMs: 60_000 },
  digest: { windowMs: 300_000, render: ... },
  fallback: inbox({ title: "You have a team invite" }),
})`}
      />

      <h2>Registering definitions</h2>
      <p>
        Pass all notification definitions to <code>createNotifyKit()</code>.
        The <code>as const</code> assertion is required for full type inference:
      </p>
      <Code
        code={`import { createNotifyKit } from "@notifykitjs/core"
import { commentMentioned } from "./notifications/comment-mentioned"
import { orderShipped } from "./notifications/order-shipped"
import { teamInvite } from "./notifications/team-invite"

export const notify = createNotifyKit({
  notifications: [commentMentioned, orderShipped, teamInvite] as const,
  // ...
})`}
      />
      <p>
        Now <code>notify.send()</code> only accepts valid notification IDs and
        the correct payload shape for each.
      </p>

      <div className="page-nav">
        <Link href="/docs/quickstart">
          <span className="page-nav-label">Previous</span>
          <span className="page-nav-title">Quickstart</span>
        </Link>
        <Link href="/docs/sending">
          <span className="page-nav-label">Next</span>
          <span className="page-nav-title">Sending</span>
        </Link>
      </div>
    </article>
  );
}

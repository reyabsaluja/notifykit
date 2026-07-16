import Link from "next/link";
import { createDocsMetadata } from "../../../lib/site";
import { Code } from "../../_components/code";

export const metadata = createDocsMetadata("defining");

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

      <div className="features">
        <div className="feature-card">
          <h3>Identifier</h3>
          <p>A unique string like <code>&quot;comment_mentioned&quot;</code>. Used in <code>send()</code>, preferences, and rate limit scoping.</p>
        </div>
        <div className="feature-card">
          <h3>Payload</h3>
          <p>A typed schema of the data this notification needs. Enforced at compile time and validated at runtime.</p>
        </div>
        <div className="feature-card">
          <h3>Channels</h3>
          <p>Where to deliver — inbox, email, SMS, webhook. Each channel has its own template using <code>{`{{payload}}`}</code> interpolation.</p>
        </div>
      </div>

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
      <table>
        <thead>
          <tr><th>Approach</th><th>When to use</th><th>Provides</th></tr>
        </thead>
        <tbody>
          <tr><td><strong>Inline schema</strong></td><td>Flat payloads with simple types</td><td>Compile-time types + runtime type check</td></tr>
          <tr><td><strong>Zod / Valibot / ArkType</strong></td><td>Nested objects, arrays, refinements (UUID, positive, min/max)</td><td>Full schema validation + compile-time types</td></tr>
        </tbody>
      </table>

      <h3>Inline schema</h3>
      <p>
        A <code>Record&lt;string, &quot;string&quot; | &quot;number&quot; |
        &quot;boolean&quot;&gt;</code> — simple, zero dependencies:
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

      <h3>Zod validation</h3>
      <p>
        For complex shapes, use <code>zodPayload()</code> to get both the
        schema definition and a runtime validator:
      </p>
      <Code
        code={`import { z } from "zod"
import { zodPayload } from "@notifykitjs/core/zod"

const invoicePayload = zodPayload(z.object({
  invoiceId: z.string().uuid(),
  amount: z.number().positive(),
}))

notification({
  id: "invoice_created",
  payload: invoicePayload.payload,
  validate: invoicePayload.validate,
  channels: [...],
})`}
      />
      <div className="callout callout-warn">
        <strong>Validation runs on every <code>send()</code>.</strong> If the
        payload doesn&apos;t match, the send short-circuits with{" "}
        <code>invalid_payload</code> — no delivery attempts, no records written.
        Check <code>result.skipped</code> or use <code>explain()</code> to debug.
      </div>

      <h2>Templates</h2>
      <p>
        Every channel&apos;s string fields support <code>{`{{key}}`}</code>{" "}
        interpolation against the payload:
      </p>
      <table>
        <thead>
          <tr><th>Template</th><th>Payload</th><th>Result</th></tr>
        </thead>
        <tbody>
          <tr><td><code>{`{{actorName}} mentioned you`}</code></td><td><code>{`{ actorName: "Rey" }`}</code></td><td>Rey mentioned you</td></tr>
          <tr><td><code>{`In {{postTitle}}`}</code></td><td><code>{`{ postTitle: "Launch" }`}</code></td><td>In Launch</td></tr>
          <tr><td><code>{`{{missing}}`}</code></td><td><code>{`{}`}</code></td><td>(empty string)</td></tr>
        </tbody>
      </table>
      <div className="callout callout-tip">
        <strong>Reserved variable.</strong> Email <code>body</code> gets{" "}
        <code>{`{{_unsubscribeUrl}}`}</code> injected automatically when
        unsubscribe is configured. See{" "}
        <Link href="/docs/preferences">Preferences &amp; unsubscribe</Link>.
      </div>

      <h2>Optional fields</h2>
      <p>
        Beyond the three required fields, notifications accept configuration
        for metadata, behavior, and delivery control:
      </p>
      <table>
        <thead>
          <tr><th>Field</th><th>Purpose</th><th>When to use</th></tr>
        </thead>
        <tbody>
          <tr><td><code>description</code></td><td>Human label for admin UIs</td><td>Always — helps non-engineers understand the notification</td></tr>
          <tr><td><code>category</code></td><td>Groups notifications in preference UIs</td><td>When you have 5+ notifications that need grouping</td></tr>
          <tr><td><code>required</code></td><td>Bypasses preference checks</td><td>Transactional: password resets, 2FA, billing receipts</td></tr>
          <tr><td><code>defaultChannels</code></td><td>Override which channels are on by default</td><td>When a notification shouldn&apos;t email by default</td></tr>
          <tr><td><code>redact</code></td><td>Mask fields in logs and hooks</td><td>Payload contains PII (emails, IPs, names)</td></tr>
          <tr><td><code>rateLimit</code></td><td>Hard-cap sends per window</td><td>Preventing notification spam</td></tr>
          <tr><td><code>digest</code></td><td>Batch sends into one delivery</td><td>High-frequency events (comments, likes)</td></tr>
          <tr><td><code>fallback</code></td><td>Catch failed or skipped channels</td><td>Critical notifications that must reach the user</td></tr>
        </tbody>
      </table>
      <Code
        code={`notification({
  id: "team_invite",
  payload: { inviterName: "string", teamName: "string" },
  channels: [...],
  description: "Sent when a user is invited to a team",
  category: "social",
  required: true,
  redact: ["inviterName"],
  rateLimit: { max: 5, windowMs: 60_000 },
  fallback: inbox({ title: "You have a team invite" }),
})`}
      />

      <h2>Which options do I need?</h2>
      <p>
        Walk through these questions for each new notification. Most only
        need the first two — add complexity when you observe problems, not
        upfront.
      </p>
      <div className="features">
        <div className="feature-card">
          <h3>Must it always deliver?</h3>
          <p>Password resets, 2FA, receipts → set <code>required: true</code>. This bypasses user preference opt-outs.</p>
        </div>
        <div className="feature-card">
          <h3>Can the same event fire rapidly?</h3>
          <p>Multiple likes, edits, or comments in seconds → add <code>digest</code> with a window (e.g. 5 min). Users get one email, not twenty.</p>
        </div>
        <div className="feature-card">
          <h3>Could a bad actor trigger it in a loop?</h3>
          <p>Any user-initiated event that targets another user → add <code>rateLimit</code>. Caps sends per recipient per window.</p>
        </div>
        <div className="feature-card">
          <h3>Is delivery failure unacceptable?</h3>
          <p>Critical alerts where the user must see it → add <code>fallback</code> to a secondary channel (usually inbox).</p>
        </div>
      </div>
      <table>
        <thead>
          <tr><th>Scenario</th><th>Options to set</th><th>Example notification</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>Simple activity alert</td>
            <td>None — defaults are fine</td>
            <td>Task assigned, team invite</td>
          </tr>
          <tr>
            <td>Transactional email</td>
            <td><code>required: true</code></td>
            <td>Password reset, payment receipt</td>
          </tr>
          <tr>
            <td>High-frequency social</td>
            <td><code>digest</code> + <code>rateLimit</code></td>
            <td>Post liked, new follower</td>
          </tr>
          <tr>
            <td>Critical system alert</td>
            <td><code>rateLimit</code> + <code>fallback</code></td>
            <td>Usage limit warning, incident alert</td>
          </tr>
          <tr>
            <td>Noisy + critical</td>
            <td><code>digest</code> + <code>rateLimit</code> + <code>fallback</code></td>
            <td>Error spike alert, security events</td>
          </tr>
        </tbody>
      </table>
      <div className="callout callout-tip">
        <strong>Start with zero options.</strong> Ship the notification with just{" "}
        <code>id</code>, <code>payload</code>, and <code>channels</code>. Add{" "}
        <code>rateLimit</code> when you see spam, <code>digest</code> when users
        complain about noise, and <code>fallback</code> for paths where delivery
        failures cause support tickets.
      </div>

      <h2>Modeling your notifications</h2>
      <p>
        Not sure what notifications to create? Start by listing every event
        where a user should know something happened. Then categorize:
      </p>
      <table>
        <thead>
          <tr><th>Category</th><th>Examples</th><th>Typical config</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Transactional</strong></td>
            <td>Password reset, 2FA code, payment receipt</td>
            <td><code>required: true</code>, email only, no digest</td>
          </tr>
          <tr>
            <td><strong>Activity</strong></td>
            <td>Comment mention, team invite, task assigned</td>
            <td>Inbox + email, dedup by entity, user can opt out</td>
          </tr>
          <tr>
            <td><strong>Social</strong></td>
            <td>New follower, post liked, reaction added</td>
            <td>Inbox + digest (batch by window), email off by default</td>
          </tr>
          <tr>
            <td><strong>System</strong></td>
            <td>Deploy succeeded, usage limit warning, incident alert</td>
            <td>Webhook + inbox, rate-limited, with fallback</td>
          </tr>
        </tbody>
      </table>
      <div className="callout callout-tip">
        <strong>One notification per user-visible event.</strong> Don&apos;t
        create <code>comment_created_inbox</code> and{" "}
        <code>comment_created_email</code> separately — use one definition
        with multiple channels. The user controls which channels fire via
        preferences.
      </div>

      <h2>Payload design patterns</h2>
      <p>
        The payload is the contract between your <code>send()</code> call and
        your channel templates. Structure it around what the <em>recipient</em>{" "}
        needs to understand — not around your internal data model.
      </p>

      <div className="features">
        <div className="feature-card">
          <h3>Actor + target</h3>
          <p>Someone did something to something. Comments, mentions, reviews, assignments.</p>
        </div>
        <div className="feature-card">
          <h3>Status change</h3>
          <p>Something changed state. Orders, deployments, approvals, workflow transitions.</p>
        </div>
        <div className="feature-card">
          <h3>Content preview</h3>
          <p>Someone created content you should see. Messages, posts, document edits.</p>
        </div>
        <div className="feature-card">
          <h3>Threshold alert</h3>
          <p>A metric crossed a boundary. Usage limits, latency spikes, budget caps.</p>
        </div>
        <div className="feature-card">
          <h3>Action required</h3>
          <p>The recipient must do something by a deadline. Approvals, reviews, renewals.</p>
        </div>
      </div>

      <table>
        <thead>
          <tr><th>Pattern</th><th>Shape</th><th>Use for</th><th>Template example</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Actor + target</strong></td>
            <td><code>actorName</code>, <code>targetName</code>, <code>targetUrl</code></td>
            <td>Someone did something to something</td>
            <td><code>{`{{actorName}} commented on {{targetName}}`}</code></td>
          </tr>
          <tr>
            <td><strong>Status change</strong></td>
            <td><code>entityName</code>, <code>oldStatus</code>, <code>newStatus</code>, <code>entityUrl</code></td>
            <td>Something changed state</td>
            <td><code>{`{{entityName}} moved to {{newStatus}}`}</code></td>
          </tr>
          <tr>
            <td><strong>Content preview</strong></td>
            <td><code>actorName</code>, <code>preview</code>, <code>contentUrl</code></td>
            <td>Someone created content you should see</td>
            <td><code>{`{{actorName}}: "{{preview}}"`}</code></td>
          </tr>
          <tr>
            <td><strong>Threshold alert</strong></td>
            <td><code>metricName</code>, <code>currentValue</code>, <code>threshold</code>, <code>dashboardUrl</code></td>
            <td>A metric crossed a boundary</td>
            <td><code>{`{{metricName}} hit {{currentValue}} (limit: {{threshold}})`}</code></td>
          </tr>
          <tr>
            <td><strong>Action required</strong></td>
            <td><code>actionLabel</code>, <code>deadline</code>, <code>actionUrl</code></td>
            <td>Recipient must do something by a date</td>
            <td><code>{`Action needed: {{actionLabel}} by {{deadline}}`}</code></td>
          </tr>
        </tbody>
      </table>
      <Code
        code={`// Actor + target: "Rey commented on Launch Plan"
notification({
  id: "comment_added",
  payload: {
    actorName: "string",
    targetName: "string",
    targetUrl: "string",
    preview: "string",
  },
  channels: [
    inbox({
      title: "{{actorName}} commented on {{targetName}}",
      body: "{{preview}}",
      actionUrl: "{{targetUrl}}",
    }),
  ],
})

// Status change: "Order #1234 shipped"
notification({
  id: "order_status_changed",
  payload: {
    orderNumber: "string",
    newStatus: "string",
    trackingUrl: "string",
  },
  channels: [
    inbox({
      title: "Order #{{orderNumber}} {{newStatus}}",
      actionUrl: "{{trackingUrl}}",
    }),
    email({
      subject: "Your order #{{orderNumber}} is now {{newStatus}}",
      body: "Track your order: {{trackingUrl}}\\n\\nUnsubscribe: {{_unsubscribeUrl}}",
    }),
  ],
})

// Threshold alert: "API latency hit 2400ms (limit: 2000ms)"
notification({
  id: "metric_threshold",
  payload: {
    metricName: "string",
    currentValue: "string",
    threshold: "string",
    dashboardUrl: "string",
  },
  channels: [
    inbox({
      title: "{{metricName}} exceeded threshold",
      body: "Current: {{currentValue}} (limit: {{threshold}})",
      actionUrl: "{{dashboardUrl}}",
    }),
  ],
})`}
      />

      <div className="callout callout-tip">
        <strong>Include a URL in every payload.</strong> The <code>actionUrl</code>{" "}
        / <code>targetUrl</code> / <code>dashboardUrl</code> gives the user
        somewhere to go. Without it, the notification tells them something happened
        but doesn&apos;t help them act on it.
      </div>

      <h3>Payload field naming conventions</h3>
      <table>
        <thead>
          <tr><th>Convention</th><th>Example</th><th>Why</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>Use display-ready values</td>
            <td><code>actorName: &quot;Rey Saluja&quot;</code> not <code>actorId: &quot;usr_123&quot;</code></td>
            <td>Templates render directly — no lookup possible at render time</td>
          </tr>
          <tr>
            <td>Include URLs, not entity IDs</td>
            <td><code>postUrl: &quot;/posts/42&quot;</code> not <code>postId: &quot;42&quot;</code></td>
            <td>Channels need a link destination, not a raw identifier</td>
          </tr>
          <tr>
            <td>Use <code>string</code> for numbers in templates</td>
            <td><code>amount: &quot;string&quot;</code> → pass <code>&quot;$12.99&quot;</code></td>
            <td>Formatting (currency, locale) should happen at send time, not in the template</td>
          </tr>
          <tr>
            <td>Keep payloads flat</td>
            <td><code>actorName</code>, <code>actorAvatar</code> not <code>actor: {`{ name, avatar }`}</code></td>
            <td>Inline schemas only support flat keys. Nested requires Zod.</td>
          </tr>
          <tr>
            <td>Prefix internal fields with context</td>
            <td><code>invoiceId</code> not just <code>id</code></td>
            <td>Avoid collisions when payloads are logged or composed in digests</td>
          </tr>
        </tbody>
      </table>
      <div className="callout callout-warn">
        <strong>Don&apos;t store raw IDs as your only reference.</strong> If you
        pass <code>actorId: &quot;usr_123&quot;</code> without <code>actorName</code>,
        your templates can&apos;t show a human-readable name.{" "}
        <code>render()</code> functions can&apos;t be async — they can&apos;t look
        up names from a database. Resolve everything at send time.
      </div>

      <h2>Complete example</h2>
      <p>
        A production notification combining multiple features — rate limiting,
        digest, fallback, category, and redaction — all in one definition:
      </p>
      <Code
        code={`export const commentMentioned = notification({
  id: "comment_mentioned",
  description: "Someone mentioned you in a comment",
  category: "activity",

  payload: {
    actorName: "string",
    actorEmail: "string",
    postTitle: "string",
    postUrl: "string",
    commentPreview: "string",
  },

  channels: [
    inbox({
      title: "{{actorName}} mentioned you",
      body: "{{commentPreview}}",
      actionUrl: "{{postUrl}}",
    }),
    email({
      subject: "{{actorName}} mentioned you in {{postTitle}}",
      body: "{{commentPreview}}\\n\\nOpen {{postUrl}} to reply.\\n\\nUnsubscribe: {{_unsubscribeUrl}}",
    }),
  ],

  // Don't spam — max 30 mentions per hour per recipient
  rateLimit: { max: 30, windowMs: 60 * 60_000 },

  // Batch rapid-fire mentions into one email
  digest: {
    windowMs: 5 * 60_000,
    key: ({ payload }) => payload.postUrl,
    render: ({ payloads, count }) => ({
      actorName: payloads[payloads.length - 1]!.actorName,
      actorEmail: payloads[payloads.length - 1]!.actorEmail,
      postTitle: payloads[0]!.postTitle,
      postUrl: payloads[0]!.postUrl,
      commentPreview: count > 1
        ? \`\${count} new mentions\`
        : payloads[0]!.commentPreview,
    }),
  },

  // If email fails, at least show it in the inbox
  fallback: inbox({
    title: "{{actorName}} mentioned you (email delivery failed)",
    actionUrl: "{{postUrl}}",
  }),

  // Strip PII from logs and timeline
  redact: ["actorEmail"],
})`}
      />
      <table>
        <thead>
          <tr><th>Feature used</th><th>Why</th></tr>
        </thead>
        <tbody>
          <tr><td><code>category</code></td><td>Groups with other activity notifications in the preferences UI</td></tr>
          <tr><td><code>rateLimit</code></td><td>Prevents a spam attack from flooding a user&apos;s inbox</td></tr>
          <tr><td><code>digest</code></td><td>If Rey mentions you 5 times in 5 minutes, you get one email, not five</td></tr>
          <tr><td><code>fallback</code></td><td>Email delivery can fail — the user still sees it in-app</td></tr>
          <tr><td><code>redact</code></td><td>Actor email appears in logs as <code>[REDACTED]</code> — only needed for delivery</td></tr>
        </tbody>
      </table>
      <div className="callout callout-tip">
        <strong>Start simple, add features as you need them.</strong> Most
        notifications only need <code>id</code>, <code>payload</code>, and{" "}
        <code>channels</code>. Add rate limiting when you observe spam, digests
        when users complain about noise, and fallbacks for critical paths.
        Don&apos;t over-engineer on day one.
      </div>

      <h2>Evolving definitions over time</h2>
      <p>
        Notification definitions live in code and evolve with your app. Use
        this quick matrix to assess changes before you deploy:
      </p>
      <div className="features">
        <div className="feature-card">
          <h3>Safe — deploy freely</h3>
          <p>Change template text, add an optional payload field, add or remove a channel, tweak <code>rateLimit</code> / <code>digest</code> values.</p>
        </div>
        <div className="feature-card">
          <h3>Risky — review first</h3>
          <p>Remove a payload field (search all <code>send()</code> sites), delete a notification (wait for in-flight to drain).</p>
        </div>
        <div className="feature-card">
          <h3>Breaking — requires migration</h3>
          <p>Rename a notification ID (preferences, dedup keys, and rate limit counters reference the old one).</p>
        </div>
      </div>
      <table>
        <thead>
          <tr><th>Change</th><th>Safe?</th><th>Risk</th><th>Mitigation</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Add a payload field</strong></td>
            <td>Yes (if optional)</td>
            <td>Old sends missing the field render <code>{`{{newField}}`}</code> as empty</td>
            <td>Use a default in your template: <code>{`{{newField}}`}</code> renders blank gracefully, or use <code>render()</code> with a fallback</td>
          </tr>
          <tr>
            <td><strong>Remove a payload field</strong></td>
            <td>Risky</td>
            <td>Old templates referencing removed field render empty; callers passing it get a TS error</td>
            <td>Remove from schema and template in the same deploy. Search for all <code>send()</code> calls first.</td>
          </tr>
          <tr>
            <td><strong>Rename a notification ID</strong></td>
            <td>Breaking</td>
            <td>Existing preferences, rate limit counters, and dedup keys reference the old ID</td>
            <td>Create a new ID, migrate preferences with a script, then remove the old one</td>
          </tr>
          <tr>
            <td><strong>Change a template string</strong></td>
            <td>Yes</td>
            <td>Existing inbox items keep the old rendered text (it&apos;s stored at write time)</td>
            <td>No migration needed — only new sends use the updated template</td>
          </tr>
          <tr>
            <td><strong>Add a channel</strong></td>
            <td>Yes</td>
            <td>Users who didn&apos;t opt out will start receiving it immediately</td>
            <td>Set <code>defaultChannels: {`{ newChannel: false }`}</code> to make it opt-in at first</td>
          </tr>
          <tr>
            <td><strong>Remove a channel</strong></td>
            <td>Yes</td>
            <td>Users who had preferences set for that channel keep stale preference rows</td>
            <td>Harmless — stale preferences are ignored. Clean up optionally.</td>
          </tr>
          <tr>
            <td><strong>Delete a notification entirely</strong></td>
            <td>Careful</td>
            <td>Inbox items for old sends still exist; preferences become orphaned</td>
            <td>Remove from the array. Old inbox items remain visible (they&apos;re just data). Clean up if needed.</td>
          </tr>
        </tbody>
      </table>

      <h3>Adding fields safely</h3>
      <Code
        code={`// BEFORE: original definition
notification({
  id: "comment_mentioned",
  payload: { actorName: "string", postUrl: "string" },
  channels: [
    inbox({ title: "{{actorName}} mentioned you" }),
  ],
})

// AFTER: added commentPreview (optional in template)
notification({
  id: "comment_mentioned",
  payload: { actorName: "string", postUrl: "string", commentPreview: "string" },
  channels: [
    inbox({
      title: "{{actorName}} mentioned you",
      body: "{{commentPreview}}",  // renders empty if old sends didn't have it
    }),
  ],
})`}
      />

      <h3>Renaming a notification (migration)</h3>
      <Code
        code={`// Step 1: Create the new definition alongside the old one
export const commentReply = notification({
  id: "comment_reply",  // new name
  payload: { actorName: "string", postUrl: "string", commentPreview: "string" },
  channels: [...],
})

// Step 2: Migrate preferences from old ID to new ID
const allPrefs = await db
  .select()
  .from(notifyKitSchema.preferences)
  .where(eq(notifyKitSchema.preferences.notificationId, "comment_mentioned"))

for (const pref of allPrefs) {
  await notify.preferences.update({
    recipientId: pref.recipientId,
    notificationId: "comment_reply",
    channels: pref.channels,
  })
}

// Step 3: Update all send() call sites to use the new ID
// Step 4: Remove the old definition from the notifications array`}
      />

      <div className="callout callout-tip">
        <strong>Templates are rendered at send time, not read time.</strong>{" "}
        When you change a template string, existing inbox items keep their
        original text — only future sends use the new template. This means
        template changes are always safe to deploy without migration.
      </div>

      <h3>Deprecating gracefully</h3>
      <p>
        When removing a notification, consider existing subscribers and in-flight
        state:
      </p>
      <div className="overview-flow">
        <div className="overview-flow-step">
          <span className="overview-flow-number">1</span>
          <div>
            <strong>Stop sending</strong>
            <p>Remove all <code>send()</code> calls for this notification from your code.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">2</span>
          <div>
            <strong>Wait for in-flight to drain</strong>
            <p>If using digests or quiet hours, wait for <code>flushDigests()</code> and <code>flushScheduledSends()</code> to clear buffered sends.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">3</span>
          <div>
            <strong>Remove the definition</strong>
            <p>Delete from the <code>notifications</code> array. The preferences UI stops showing it.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">4</span>
          <div>
            <strong>Clean up (optional)</strong>
            <p>Delete orphaned preferences and old inbox items if they clutter your database.</p>
          </div>
        </div>
      </div>
      <div className="callout callout-warn">
        <strong>Don&apos;t reuse deleted IDs.</strong> If you delete{" "}
        <code>&quot;comment_mentioned&quot;</code> and later create a new
        notification with the same ID, old preference rows will apply to the
        new notification — users who opted out of the old one will be opted out
        of the new one. Use a fresh ID.
      </div>

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

      <h2>Safe schema evolution</h2>
      <p>
        Once a notification is in production, changing its payload schema
        requires care. Buffered digests, queued deliveries, and in-flight sends
        may still carry the old shape. Follow these rules to evolve safely:
      </p>
      <table>
        <thead>
          <tr><th>Change</th><th>Safe?</th><th>Why</th><th>Migration needed</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Add an optional field</strong></td>
            <td>Yes</td>
            <td>Old sends pass validation (field is optional). Templates render it as empty string if absent.</td>
            <td>None</td>
          </tr>
          <tr>
            <td><strong>Add a required field</strong></td>
            <td>No</td>
            <td>In-flight sends and buffered digests lack the field — validation fails on flush.</td>
            <td>Add as optional first, backfill all callers, then make required in a follow-up deploy</td>
          </tr>
          <tr>
            <td><strong>Remove a field</strong></td>
            <td>Yes (if templates updated)</td>
            <td>Old queued sends may still include it (harmless — extra fields are ignored). Danger is templates referencing a now-missing field.</td>
            <td>Remove from templates first, then from schema</td>
          </tr>
          <tr>
            <td><strong>Rename a field</strong></td>
            <td>No</td>
            <td>Equivalent to adding required + removing old. In-flight sends break.</td>
            <td>Add new field (optional), update callers, update templates, remove old field</td>
          </tr>
          <tr>
            <td><strong>Change a field&apos;s type</strong></td>
            <td>No</td>
            <td>Old sends carry the old type — validation or template rendering breaks.</td>
            <td>Add a new field with the new type, migrate callers, then remove the old field</td>
          </tr>
        </tbody>
      </table>

      <div className="callout callout-warn">
        <strong>Digests are the hidden danger.</strong> A 24-hour digest window
        means payloads from yesterday are flushed with today&apos;s schema. If you
        added a required field between those sends, the <code>render()</code>{" "}
        function receives payloads that lack it. Always guard with optional
        chaining or defaults inside <code>render()</code>.
      </div>

      <h3>Safe field addition (two-deploy pattern)</h3>
      <Code
        code={`// Deploy 1: add as optional, handle absence in templates
notification({
  id: "order_shipped",
  payload: {
    orderNumber: "string",
    trackingUrl: "string",
    carrier: "string?",     // new optional field
  },
  channels: [
    inbox({
      render: (p) => ({
        title: \`Order \${p.orderNumber} shipped\`,
        body: p.carrier
          ? \`Shipped via \${p.carrier}\`
          : "Your order is on the way",
      }),
    }),
  ],
  digest: {
    windowMs: 60 * 60_000,
    render: ({ payloads, count }) => ({
      orderNumber: payloads[payloads.length - 1]!.orderNumber,
      trackingUrl: payloads[payloads.length - 1]!.trackingUrl,
      carrier: payloads[payloads.length - 1]?.carrier ?? undefined,
    }),
  },
})

// Deploy 2 (after all callers pass carrier): promote to required
// payload: { orderNumber: "string", trackingUrl: "string", carrier: "string" }`}
      />

      <div className="overview-flow">
        <div className="overview-flow-step">
          <span className="overview-flow-number">1</span>
          <div>
            <strong>Deploy: add optional field</strong>
            <p>Schema accepts both old (without field) and new (with field) payloads. Templates handle absence gracefully.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">2</span>
          <div>
            <strong>Update all callers</strong>
            <p>Every <code>send()</code> call now passes the new field. Verify with <code>grep</code> — no caller should omit it.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">3</span>
          <div>
            <strong>Wait for in-flight to drain</strong>
            <p>Wait at least as long as your longest digest window + queue retry delay. All old-shape payloads flush.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">4</span>
          <div>
            <strong>Deploy: make required</strong>
            <p>Now safe — no in-flight payloads lack the field. TypeScript enforces it at compile time from here on.</p>
          </div>
        </div>
      </div>

      <div className="callout callout-tip">
        <strong>The wait in step 3 equals your longest digest window.</strong>{" "}
        If your longest digest is 1 hour, wait 1 hour after deploy 2 before
        deploy 3. If you use <code>setTimeoutQueue()</code> with 5 retry
        attempts at exponential backoff, add ~30 seconds for the retry tail.
        For <code>inlineQueue()</code>, there&apos;s no wait — sends resolve
        synchronously.
      </div>

      <h2>File organization</h2>
      <p>
        One notification per file keeps things manageable as your count grows.
        Scale your structure to match your notification count:
      </p>
      <table>
        <thead>
          <tr><th>Scale</th><th>Pattern</th><th>File structure</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>1–5 notifications</strong></td>
            <td>All in one file</td>
            <td><code>lib/notifykit.ts</code> — definitions + instance together</td>
          </tr>
          <tr>
            <td><strong>5–20 notifications</strong></td>
            <td>One file per notification</td>
            <td><code>lib/notifications/comment-mentioned.ts</code>, <code>order-shipped.ts</code>, etc.</td>
          </tr>
          <tr>
            <td><strong>20+ notifications</strong></td>
            <td>Grouped by domain + barrel</td>
            <td><code>lib/notifications/activity/</code>, <code>billing/</code>, <code>social/</code> with <code>index.ts</code> per folder</td>
          </tr>
        </tbody>
      </table>
      <Code
        code={`// lib/notifications/index.ts — barrel export for all definitions
export { commentMentioned } from "./activity/comment-mentioned"
export { taskAssigned } from "./activity/task-assigned"
export { newFollower } from "./social/new-follower"
export { invoicePaid } from "./billing/invoice-paid"
export { passwordReset } from "./billing/password-reset"

// lib/notifykit.ts — single import, wire up
import * as notifications from "./notifications"

export const notify = createNotifyKit({
  notifications: Object.values(notifications) as const,
  database: drizzlePostgresAdapter(db),
  providers: { email: resendProvider({ ... }) },
})`}
      />
      <div className="callout callout-tip">
        <strong>One file per notification is the sweet spot.</strong> Each file
        is self-contained (payload, channels, options), easy to find by ID,
        and gives clean git blame. Co-locate definitions with the feature that
        sends them — when a feature is deleted, its notification goes with it.
      </div>

      <h3>Shared channel builders</h3>
      <p>
        When multiple notifications share the same email structure or inbox
        format, extract a builder to avoid repetition:
      </p>
      <Code
        code={`// lib/notifications/_shared.ts
import { channel } from "@notifykitjs/core"

const inbox = channel.inbox()
const email = channel.email()

export function actorInbox(template: { action: string; target: string }) {
  return inbox({
    title: \`{{actorName}} \${template.action}\`,
    body: \`In \${template.target}\`,
    actionUrl: "{{actionUrl}}",
  })
}

export function transactionalEmail(subject: string) {
  return email({
    subject,
    body: \`\${subject}\\n\\n{{body}}\\n\\n---\\nUnsubscribe: {{_unsubscribeUrl}}\`,
  })
}

// lib/notifications/comment-mentioned.ts
import { notification } from "@notifykitjs/core"
import { actorInbox, transactionalEmail } from "./_shared"

export const commentMentioned = notification({
  id: "comment_mentioned",
  payload: { actorName: "string", postTitle: "string", actionUrl: "string", body: "string" },
  channels: [
    actorInbox({ action: "mentioned you", target: "{{postTitle}}" }),
    transactionalEmail("{{actorName}} mentioned you in {{postTitle}}"),
  ],
})`}
      />

      <h3>When to split vs combine</h3>
      <p>
        A common question: should &quot;comment mentioned&quot; and
        &quot;comment replied&quot; be one notification or two? Use this
        decision framework:
      </p>
      <table>
        <thead>
          <tr><th>Question</th><th>If yes → split</th><th>If no → combine</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>Do users want separate preference toggles?</td>
            <td>&quot;Mentions&quot; and &quot;Replies&quot; as separate rows in settings</td>
            <td>One &quot;Comments&quot; toggle covers both</td>
          </tr>
          <tr>
            <td>Are the payloads meaningfully different?</td>
            <td>A mention has <code>postUrl</code>, a deploy has <code>buildId + logs</code></td>
            <td>Both carry <code>actorName + targetUrl</code></td>
          </tr>
          <tr>
            <td>Would they have different rate limits or digests?</td>
            <td>Mentions digest at 5min, replies deliver immediately</td>
            <td>Same noise profile, same delivery rules</td>
          </tr>
          <tr>
            <td>Do different channels apply?</td>
            <td>Mentions → inbox + email, deploys → webhook only</td>
            <td>Both go to inbox + email</td>
          </tr>
        </tbody>
      </table>
      <div className="callout callout-tip">
        <strong>When in doubt, split.</strong> It&apos;s trivial to merge two
        notifications later (combine into one ID, update send calls). Splitting
        one into two is harder — you need to migrate existing preference rows
        and update every send call site.
      </div>

      <h2>Testing your definitions</h2>
      <p>
        Notification definitions are the contract between your app and your
        users. Test them the same way you&apos;d test any API contract — verify
        that the right channels fire, templates render correctly, and invalid
        payloads are rejected.
      </p>
      <table>
        <thead>
          <tr><th>What to test</th><th>Why</th><th>Catches</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Template rendering</strong></td>
            <td>Verifies payload fields appear where expected</td>
            <td>Typos in <code>{`{{field}}`}</code> names, missing fields rendering blank</td>
          </tr>
          <tr>
            <td><strong>Channel selection</strong></td>
            <td>Confirms the right channels fire for each notification</td>
            <td>Accidentally removing a channel, or adding one users don&apos;t expect</td>
          </tr>
          <tr>
            <td><strong>Payload validation</strong></td>
            <td>Ensures malformed data is rejected at send time</td>
            <td>Missing required fields, wrong types, schema drift</td>
          </tr>
          <tr>
            <td><strong>Digest rendering</strong></td>
            <td>Confirms batched payloads merge into a coherent message</td>
            <td>Broken <code>render()</code> when count is 1 vs many, undefined access</td>
          </tr>
          <tr>
            <td><strong>Rate limit behavior</strong></td>
            <td>Proves the cap is enforced at the expected threshold</td>
            <td>Rate limit misconfigured (too high or too low)</td>
          </tr>
        </tbody>
      </table>

      <h3>Pattern: definition smoke tests</h3>
      <Code
        code={`import { describe, it, expect } from "vitest"
import { createNotifyKit, memoryAdapter, fakeEmailProvider } from "@notifykitjs/core"
import { commentMentioned, orderShipped } from "./notifications"

function setup() {
  return createNotifyKit({
    notifications: [commentMentioned, orderShipped] as const,
    database: memoryAdapter(),
    providers: { email: fakeEmailProvider() },
  })
}

describe("notification definitions", () => {
  it("comment_mentioned renders actor name in inbox title", async () => {
    const notify = setup()
    await notify.upsertRecipient({ id: "u1", email: "test@test.com" })

    const result = await notify.send({
      recipientId: "u1",
      notificationId: "comment_mentioned",
      payload: { actorName: "Rey", postTitle: "Launch", postUrl: "/p/1" },
    })

    expect(result.inboxItems[0].title).toBe("Rey mentioned you")
    expect(result.inboxItems[0].body).toBe("In Launch")
    expect(result.inboxItems[0].actionUrl).toBe("/p/1")
  })

  it("comment_mentioned delivers to both inbox and email", async () => {
    const notify = setup()
    await notify.upsertRecipient({ id: "u1", email: "test@test.com" })

    const result = await notify.send({
      recipientId: "u1",
      notificationId: "comment_mentioned",
      payload: { actorName: "Rey", postTitle: "Launch", postUrl: "/p/1" },
    })

    expect(result.inboxItems).toHaveLength(1)
    expect(result.deliveries.find(d => d.channel === "email")).toBeDefined()
  })

  it("rejects invalid payload (missing required field)", async () => {
    const notify = setup()
    await notify.upsertRecipient({ id: "u1", email: "test@test.com" })

    const result = await notify.send({
      recipientId: "u1",
      notificationId: "comment_mentioned",
      // @ts-expect-error — testing runtime validation
      payload: { actorName: "Rey" },
    })

    expect(result.skipped).toBe(true)
    expect(result.skipReason).toBe("invalid_payload")
  })
})`}
      />

      <h3>Testing digest rendering</h3>
      <p>
        Digests are the trickiest part of a definition to get right —
        the <code>render()</code> function must handle both the single-event and
        multi-event case gracefully:
      </p>
      <Code
        code={`describe("comment_mentioned digest", () => {
  it("renders single event as normal message", async () => {
    const notify = setup()
    await notify.upsertRecipient({ id: "u1", email: "test@test.com" })

    await notify.send({
      recipientId: "u1",
      notificationId: "comment_mentioned",
      payload: { actorName: "Rey", postTitle: "Launch", postUrl: "/p/1", commentPreview: "looks good!" },
    })

    // Flush the digest window
    const flushed = await notify.flushDigests()
    expect(flushed[0].inboxItems[0].body).toBe("looks good!")
  })

  it("renders multiple events as count summary", async () => {
    const notify = setup()
    await notify.upsertRecipient({ id: "u1", email: "test@test.com" })

    // Send 3 events within the digest window
    for (const actor of ["Rey", "Sam", "Alex"]) {
      await notify.send({
        recipientId: "u1",
        notificationId: "comment_mentioned",
        payload: { actorName: actor, postTitle: "Launch", postUrl: "/p/1", commentPreview: "..." },
      })
    }

    const flushed = await notify.flushDigests()
    expect(flushed[0].inboxItems[0].body).toBe("3 new mentions")
  })
})`}
      />

      <h3>Testing rate limits on definitions</h3>
      <Code
        code={`describe("comment_mentioned rate limit", () => {
  it("enforces max 30 sends per hour", async () => {
    const notify = setup()
    await notify.upsertRecipient({ id: "u1", email: "test@test.com" })

    // Send up to the limit
    for (let i = 0; i < 30; i++) {
      const result = await notify.send({
        recipientId: "u1",
        notificationId: "comment_mentioned",
        payload: { actorName: \`User \${i}\`, postTitle: "Post", postUrl: "/p/1" },
      })
      expect(result.skipped).toBeFalsy()
    }

    // 31st send should be rate-limited
    const blocked = await notify.send({
      recipientId: "u1",
      notificationId: "comment_mentioned",
      payload: { actorName: "One More", postTitle: "Post", postUrl: "/p/1" },
    })

    expect(blocked.skipped).toBe(true)
    expect(blocked.skipReason).toBe("rate_limited")
  })
})`}
      />
      <table>
        <thead>
          <tr><th>Test level</th><th>What it proves</th><th>I/O boundary</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Template rendering</strong></td>
            <td>Payload fields map to the right template slots</td>
            <td>In-memory, no provider or database</td>
          </tr>
          <tr>
            <td><strong>Channel delivery</strong></td>
            <td>Correct channels fire (inbox, email, SMS)</td>
            <td>Fake provider, no network</td>
          </tr>
          <tr>
            <td><strong>Validation rejection</strong></td>
            <td>Malformed payloads fail gracefully with a reason</td>
            <td>In-memory validation</td>
          </tr>
          <tr>
            <td><strong>Digest rendering</strong></td>
            <td>Single and multi-event <code>render()</code> both work</td>
            <td>In-memory buffer and renderer</td>
          </tr>
          <tr>
            <td><strong>Rate limit</strong></td>
            <td>Cap is enforced at the configured threshold</td>
            <td>In-memory loop; duration depends on the configured limit</td>
          </tr>
        </tbody>
      </table>
      <div className="callout callout-tip">
        <strong>Run definition tests on every PR.</strong> They&apos;re the fastest
        tests in your suite (in-memory adapter, fake providers, no network) and
        catch the most embarrassing bugs — a typo in a template field means users
        see blank notifications in production. One test file per notification keeps
        coverage proportional to your notification count.
      </div>

      <div className="button-row">
        <Link href="/docs/sending" className="primary">Send notifications</Link>
        <Link href="/docs/channels">Configure channels</Link>
        <Link href="/docs/digests">Add digests</Link>
      </div>

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

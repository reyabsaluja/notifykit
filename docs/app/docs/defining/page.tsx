import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Defining notifications" };

export default function DefiningPage() {
  return (
    <article>
      <h1>Defining notifications</h1>
      <p>
        A notification has an <code>id</code>, a <code>payload</code> schema,
        and a list of <code>channels</code>. Define them in code. Your
        notification ids and payload shapes become typed values the rest of
        your app can rely on.
      </p>

      <h2>Basic definition</h2>
      <pre>
        <code>{`import { channel, notification } from "notifykit"

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
})`}</code>
      </pre>

      <h2>Payload schema</h2>
      <p>
        The schema is <code>Record&lt;string, &quot;string&quot; | &quot;number&quot; |
        &quot;boolean&quot;&gt;</code>. It&apos;s intentionally simple — enough to
        type-check payloads at the <code>send()</code> call site and validate
        at runtime.
      </p>
      <pre>
        <code>{`notification({
  id: "order_shipped",
  payload: {
    orderNumber: "string",
    total:       "number",
    expedited:   "boolean",
  },
  channels: [...],
})`}</code>
      </pre>

      <h2>Templates</h2>
      <p>
        Every channel&apos;s string fields support <code>{`{{key}}`}</code>{" "}
        interpolation against the payload. Missing keys render as empty
        strings.
      </p>
      <p>
        Email <code>body</code> additionally gets a reserved{" "}
        <code>{`{{_unsubscribeUrl}}`}</code> key when unsubscribe is
        configured — see{" "}
        <Link href="/docs/preferences">Preferences &amp; unsubscribe</Link>.
      </p>

      <h2>Channels</h2>
      <ul>
        <li>
          <code>channel.inbox()</code> — writes a row to the adapter. Shows
          up in the <code>useInbox()</code> hook and{" "}
          <code>&lt;Inbox /&gt;</code> component. User-pulled viewing.
        </li>
        <li>
          <code>channel.email()</code> — goes through the queue +
          retry + unsubscribe pipeline.
        </li>
        <li>
          <code>channel.webhook()</code> — POSTs a signed JSON envelope to{" "}
          <code>url</code> with optional <code>headers</code>. Same
          queue/retry/fallback path as email.
        </li>
      </ul>

      <h2>Guarding against spam: digest + rateLimit</h2>
      <p>
        Two optional fields do the heavy lifting for noisy notifications.
      </p>
      <pre>
        <code>{`notification({
  id: "comment_mentioned",
  payload: {
    actorName: "string",
    postTitle: "string",
    // count is part of the payload because the digest's render() produces it
    // and the inbox template references it.
    count: "number",
  },
  channels: [
    inbox({ title: "{{count}} new comments on {{postTitle}}" }),
  ],
  // Coalesce multiple sends in a rolling window into one notification.
  digest: {
    windowMs: 5 * 60_000,
    key: ({ payload }) => payload.postTitle,
    render: ({ payloads, count }) => ({
      actorName: payloads[payloads.length - 1]!.actorName,
      postTitle: payloads[0]!.postTitle,
      count,
    }),
  },
  // Hard cap — anything over the limit is dropped (not buffered).
  rateLimit: { max: 20, windowMs: 60 * 60_000 },
})`}</code>
      </pre>
      <div className="callout">
        <strong>Rate limit runs before digest.</strong> If a send is over the
        limit it&apos;s dropped outright. Users never get a sneaky mega-digest
        because an attacker flooded the bucket.
      </div>

      <h2>Fallback channels</h2>
      <p>
        When a primary delivery fails after all retries, a fallback inbox
        item keeps the user informed:
      </p>
      <pre>
        <code>{`notification({
  id: "password_reset",
  payload: { link: "string" },
  channels: [email({ subject: "Reset password", body: "{{link}}" })],
  fallback: inbox({
    title: "Password reset (your email bounced)",
    body: "Open {{link}} to continue.",
  }),
})`}</code>
      </pre>

      <h2>CLI check</h2>
      <p>
        <code>notifykit check</code> validates every{" "}
        <code>{`{{key}}`}</code> in every channel template against the
        declared payload schema. Typos become CI failures, not 3am incidents:
      </p>
      <pre>
        <code>{`$ notifykit check
Found 1 issue(s):
  comment_mentioned · inbox[0].title: Template references "{{actorNmae}}" but payload has no "actorNmae" field.`}</code>
      </pre>

      <p>
        Next: <Link href="/docs/sending">Sending →</Link>
      </p>
    </article>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { Code } from "../../_components/code";

export const metadata: Metadata = { title: "Channels" };

export default function ChannelsPage() {
  return (
    <article>
      <h1>Channels</h1>
      <p>
        A channel is a delivery mechanism. Each notification definition lists
        the channels it should be sent through. NotifyKit ships four channel
        types — inbox, email, SMS, and webhook.
      </p>

      <h2>Inbox</h2>
      <p>
        The inbox channel writes a row to your database. It&apos;s user-pulled
        (the recipient fetches it via the React hook or REST API), so it&apos;s
        never subject to quiet hours or delivery failures.
      </p>
      <Code
        code={`import { channel } from "@notifykitjs/core"

const inbox = channel.inbox()

// In a notification definition:
inbox({
  title: "{{actorName}} mentioned you",
  body: "In {{postTitle}}",        // optional
  actionUrl: "{{postUrl}}",        // optional — renders as a link
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
        <Link href="/docs/providers">email provider</Link> sends. It supports
        subject, body (plain text), and the reserved{" "}
        <code>{`{{_unsubscribeUrl}}`}</code> template variable.
      </p>
      <Code
        code={`const email = channel.email()

email({
  subject: "{{actorName}} mentioned you in {{postTitle}}",
  body: "Open {{postUrl}} to reply.\\n\\nUnsubscribe: {{_unsubscribeUrl}}",
})`}
      />
      <p>
        Email deliveries go through the full pipeline: queue, retry with
        backoff, fallback on terminal failure.
      </p>

      <h2>SMS</h2>
      <p>
        The SMS channel sends a text message through your configured{" "}
        SMS provider. The recipient must have a <code>phone</code> field set.
      </p>
      <Code
        code={`const sms = channel.sms()

sms({
  body: "Your verification code is {{code}}",
})`}
      />

      <h2>Webhook</h2>
      <p>
        The webhook channel POSTs a signed JSON envelope to a URL. Use it for
        Slack integrations, custom destinations, or forwarding to external
        services.
      </p>
      <Code
        code={`const webhook = channel.webhook()

webhook({
  url: "https://hooks.slack.com/services/T.../B.../xxx",
  headers: { "Content-Type": "application/json" },
})`}
      />
      <p>
        When a <code>secret</code> is configured on the webhook provider,
        every request includes an <code>x-notifykit-signature: sha256=&lt;hex&gt;</code>{" "}
        header. Receivers verify by HMAC-SHA256-ing the raw body with the
        shared secret.
      </p>

      <h2>Channel behavior during send</h2>
      <table>
        <thead>
          <tr>
            <th>Channel</th>
            <th>Delivery</th>
            <th>Quiet hours</th>
            <th>Preferences</th>
            <th>Retries</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Inbox</td>
            <td>Immediate (DB write)</td>
            <td>Not affected</td>
            <td>Respects opt-out</td>
            <td>N/A</td>
          </tr>
          <tr>
            <td>Email</td>
            <td>Via queue + provider</td>
            <td>Deferred</td>
            <td>Respects opt-out</td>
            <td>Configurable</td>
          </tr>
          <tr>
            <td>SMS</td>
            <td>Via queue + provider</td>
            <td>Deferred</td>
            <td>Respects opt-out</td>
            <td>Configurable</td>
          </tr>
          <tr>
            <td>Webhook</td>
            <td>Via queue + provider</td>
            <td>Deferred</td>
            <td>Respects opt-out</td>
            <td>Configurable</td>
          </tr>
        </tbody>
      </table>

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

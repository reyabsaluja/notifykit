import type { Metadata } from "next";
import Link from "next/link";
import { Code } from "../../_components/code";

export const metadata: Metadata = { title: "Quiet hours" };

export default function QuietHoursPage() {
  return (
    <article>
      <h1>Quiet hours</h1>
      <p>
        Quiet hours define a daily window during which push-style channels
        (email, SMS, webhook) defer delivery. Inbox is unaffected — it&apos;s
        user-pulled, so the item is just there whenever they look.
      </p>

      <h2>Setting quiet hours</h2>
      <p>
        Quiet hours are a property of the recipient. Set them at upsert time:
      </p>
      <Code
        code={`await notify.upsertRecipient({
  id: user.id,
  email: user.email,
  quietHours: {
    start: "22:00",         // HH:MM, 24h format
    end: "08:00",           // can cross midnight
    timezone: "America/New_York",
  },
})`}
      />
      <p>
        To clear quiet hours, pass <code>quietHours: null</code>. Omitting
        the field leaves the existing value unchanged.
      </p>

      <h2>How deferral works</h2>
      <ol>
        <li>
          When <code>send()</code> runs, the engine checks whether the
          current moment falls within the recipient&apos;s quiet window.
        </li>
        <li>
          If so, a <code>ScheduledSend</code> row is written with{" "}
          <code>scheduledFor</code> set to the next quiet-hours end time.
        </li>
        <li>
          The inbox channel still fires immediately — only email, SMS, and
          webhook are deferred.
        </li>
        <li>
          The <code>SendResult</code> includes <code>deferredChannels</code>{" "}
          listing what was delayed and when it will resume.
        </li>
      </ol>

      <h2>Flushing scheduled sends</h2>
      <p>
        Deferred sends need something to pick them up when the window ends.
        With <code>setTimeoutQueue()</code>, this happens automatically via
        internal timers. For production deployments with external queues:
      </p>
      <Code
        code={`// Call on a cron or interval (e.g. every minute):
const flushed = await notify.flushScheduledSends()
// Returns an array of SendResults for each fired scheduled send`}
      />
      <p>
        The flush uses an atomic claim mechanism — multiple workers can
        safely call it concurrently without duplicate delivery.
      </p>

      <h2>Interaction with other features</h2>
      <table>
        <thead>
          <tr>
            <th>Feature</th>
            <th>Interaction</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Required notifications</td>
            <td>Still deferred. Quiet hours override even required sends.</td>
          </tr>
          <tr>
            <td>Digests</td>
            <td>
              Digest flush respects quiet hours. If the flush fires during
              quiet time, the rendered notification is deferred.
            </td>
          </tr>
          <tr>
            <td>Rate limits</td>
            <td>
              Rate limit counts at send time, not delivery time. A deferred
              send still consumes a rate limit slot when <code>send()</code>
              is called.
            </td>
          </tr>
          <tr>
            <td>Explain / dry run</td>
            <td>
              <code>explain()</code> reports <code>quietHours.active: true</code>{" "}
              and <code>resumesAt</code> without writing a scheduled row.
            </td>
          </tr>
        </tbody>
      </table>

      <div className="page-nav">
        <Link href="/docs/digests">
          <span className="page-nav-label">Previous</span>
          <span className="page-nav-title">Digests & rate limits</span>
        </Link>
        <Link href="/docs/deduplication">
          <span className="page-nav-label">Next</span>
          <span className="page-nav-title">Dedup & idempotency</span>
        </Link>
      </div>
    </article>
  );
}

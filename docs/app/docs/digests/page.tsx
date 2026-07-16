import Link from "next/link";
import { createDocsMetadata } from "../../../lib/site";
import { Code } from "../../_components/code";

export const metadata = createDocsMetadata("digests");

export default function DigestsPage() {
  return (
    <article>
      <h1>Digests &amp; rate limits</h1>
      <p>
        Noisy notifications are the fastest way to lose users. Digests
        coalesce multiple sends into one. Rate limits hard-cap delivery.
        Both are configured per-notification with two fields.
      </p>

      <div className="features">
        <div className="feature-card">
          <h3>Digests</h3>
          <p>Buffer rapid-fire events into a single delivery. &quot;5 new comments&quot; instead of 5 separate emails.</p>
        </div>
        <div className="feature-card">
          <h3>Rate limits</h3>
          <p>Hard cap on sends per recipient per window. Excess is permanently dropped — a safety valve against spam loops.</p>
        </div>
        <div className="feature-card">
          <h3>Composable</h3>
          <p>Use both together: rate limits cap the buffer size, digests collapse what passes into one notification.</p>
        </div>
      </div>

      <table>
        <thead>
          <tr><th></th><th>Digest</th><th>Rate limit</th></tr>
        </thead>
        <tbody>
          <tr><td><strong>What it does</strong></td><td>Batches sends into one delivery</td><td>Drops sends that exceed a threshold</td></tr>
          <tr><td><strong>Excess sends are...</strong></td><td>Buffered and included in the batch</td><td>Gone — permanently dropped</td></tr>
          <tr><td><strong>Use when</strong></td><td>Multiple events should collapse (comments, likes)</td><td>You need a hard safety cap</td></tr>
        </tbody>
      </table>

      <h2>What the user experiences</h2>
      <p>
        Without digests, rapid-fire events flood the user. With digests,
        they get one concise summary. Here&apos;s the same scenario both ways:
      </p>
      <table>
        <thead>
          <tr><th></th><th>Without digest</th><th>With 5-min digest</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>10:00</strong></td>
            <td>Email: &quot;Rey commented on Launch Plan&quot;</td>
            <td rowSpan={5}><em>(buffering...)</em></td>
          </tr>
          <tr>
            <td><strong>10:01</strong></td>
            <td>Email: &quot;Sam commented on Launch Plan&quot;</td>
          </tr>
          <tr>
            <td><strong>10:02</strong></td>
            <td>Email: &quot;Ava commented on Launch Plan&quot;</td>
          </tr>
          <tr>
            <td><strong>10:03</strong></td>
            <td>Email: &quot;Rey commented on Launch Plan&quot;</td>
          </tr>
          <tr>
            <td><strong>10:04</strong></td>
            <td>Email: &quot;Sam commented on Launch Plan&quot;</td>
          </tr>
          <tr>
            <td><strong>10:05</strong></td>
            <td>—</td>
            <td>Email: &quot;5 new comments on Launch Plan&quot;</td>
          </tr>
        </tbody>
      </table>

      <div className="callout callout-tip">
        <strong>Inbox items still deliver individually.</strong> Digests batch
        push channels (email, SMS, webhook) — but each <code>send()</code> can
        still write an inbox item immediately if you configure it that way. The
        inbox is user-pulled, so multiple items don&apos;t &quot;interrupt.&quot;
      </div>

      <h2>Digests</h2>
      <p>
        A digest accumulates sends within a rolling time window and
        flushes them as a single notification. Use it when the same event
        can fire many times in quick succession (comments, likes, updates).
      </p>
      <Code
        filename="lib/notifications/comments.ts"
        code={`notification({
  id: "new_comments",
  payload: {
    actorName: "string",
    postTitle: "string",
    count: "number",
  },
  channels: [
    inbox({ title: "{{count}} new comments on {{postTitle}}" }),
    email({
      subject: "{{count}} new comments on {{postTitle}}",
      body: "Latest from {{actorName}}. Open the post to read them all.",
    }),
  ],
  digest: {
    windowMs: 5 * 60_000,
    key: ({ payload }) => payload.postTitle,
    render: ({ payloads, count }) => ({
      actorName: payloads[payloads.length - 1]!.actorName,
      postTitle: payloads[0]!.postTitle,
      count,
    }),
  },
})`}
      />

      <h3>How it works</h3>
      <div className="overview-flow">
        <div className="overview-flow-step">
          <span className="overview-flow-number">1</span>
          <div>
            <strong>First send opens the window</strong>
            <p>Creates a buffer entry with <code>flushAt = now + windowMs</code>. No notification delivered yet.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">2</span>
          <div>
            <strong>Subsequent sends accumulate</strong>
            <p>Sends with the same digest key append their payload to the buffer. Still no delivery.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">3</span>
          <div>
            <strong>Window expires — flush</strong>
            <p>The engine calls <code>render()</code> with all buffered payloads, then executes a normal send with the combined result.</p>
          </div>
        </div>
      </div>

      <h3>What <code>render()</code> receives</h3>
      <p>
        When the window expires, the engine calls your <code>render()</code>{" "}
        function with every buffered payload. You return the single payload
        that gets sent:
      </p>
      <table>
        <thead>
          <tr><th>Input</th><th>Example value</th></tr>
        </thead>
        <tbody>
          <tr><td><code>payloads</code></td><td><code>[{`{ actorName: "Rey", postTitle: "Launch", count: 1 }`}, {`{ actorName: "Sam", postTitle: "Launch", count: 1 }`}, {`{ actorName: "Ava", postTitle: "Launch", count: 1 }`}]</code></td></tr>
          <tr><td><code>count</code></td><td><code>3</code></td></tr>
          <tr><td><strong>Your return →</strong></td><td><code>{`{ actorName: "Ava", postTitle: "Launch", count: 3 }`}</code></td></tr>
        </tbody>
      </table>

      <div className="callout callout-warn">
        <strong>Return shape must match <code>payload</code> schema.</strong> The
        rendered payload goes through the same validation as a normal send. If
        your schema requires <code>actorName: &quot;string&quot;</code>, your{" "}
        <code>render()</code> must include it — even if it&apos;s just the last
        actor in the buffer.
      </div>

      <div className="callout callout-tip">
        <strong>Digest key scoping.</strong> The digest key function only
        controls grouping within the same (recipientId, notificationId, scope)
        boundary. Two different recipients always get separate digests.
      </div>

      <h3>Designing your digest key</h3>
      <p>
        The <code>key</code> function controls which sends get batched together.
        A bad key either groups unrelated events (confusing summaries) or splits
        related events (still noisy). Think of it as: &quot;what should the user
        see as one notification?&quot;
      </p>
      <table>
        <thead>
          <tr><th>Key too broad</th><th>Key too narrow</th><th>Key just right</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>All comments → one digest</td>
            <td>Each comment → its own digest (no batching)</td>
            <td>Comments <em>on the same post</em> → one digest per post</td>
          </tr>
          <tr>
            <td>&quot;8 things happened&quot; — user can&apos;t tell what or where</td>
            <td>8 separate emails — same as no digest</td>
            <td>&quot;8 new comments on Launch Plan&quot; — clear and actionable</td>
          </tr>
        </tbody>
      </table>

      <p>
        Match the key to the entity the user cares about:
      </p>
      <table>
        <thead>
          <tr><th>Notification type</th><th>Key returns</th><th>User sees</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>Comments on a post</td>
            <td><code>payload.postId</code></td>
            <td>&quot;5 new comments on Launch Plan&quot;</td>
          </tr>
          <tr>
            <td>Reactions on any content</td>
            <td><code>{`\`\${payload.targetType}:\${payload.targetId}\``}</code></td>
            <td>&quot;12 reactions on your comment&quot;</td>
          </tr>
          <tr>
            <td>Task updates in a project</td>
            <td><code>payload.projectId</code></td>
            <td>&quot;7 task updates in Backend Refactor&quot;</td>
          </tr>
          <tr>
            <td>New followers</td>
            <td><code>&quot;followers&quot;</code> (constant)</td>
            <td>&quot;4 new followers this week&quot;</td>
          </tr>
          <tr>
            <td>Deploy status per service</td>
            <td><code>payload.serviceName</code></td>
            <td>&quot;3 deploys to api-gateway (latest: succeeded)&quot;</td>
          </tr>
        </tbody>
      </table>
      <Code
        filename="lib/notifications/comments.ts"
        code={`digest: {
  windowMs: 5 * 60_000,

  // Comments: group by post
  key: ({ payload }) => payload.postId,

  // Reactions: group by target
  // key: ({ payload }) => \`\${payload.targetType}:\${payload.targetId}\`,

  // Followers: constant key — all follows batch into one
  // key: () => "followers",

  render: ({ payloads, count }) => ({ /* ... */ }),
}`}
      />

      <div className="callout callout-warn">
        <strong>Don&apos;t include the actor in the key.</strong> If your key is{" "}
        <code>{`\`\${postId}:\${actorId}\``}</code>, each commenter gets a separate
        digest — defeating the purpose. The actor should vary <em>within</em>{" "}
        a digest (&quot;Rey, Sam, and 3 others&quot;), not define the boundary.
      </div>

      <h3>Flush scheduling</h3>
      <table>
        <thead>
          <tr><th>Queue type</th><th>How flush happens</th><th>Action needed</th></tr>
        </thead>
        <tbody>
          <tr><td><code>setTimeoutQueue()</code></td><td>Internal timer per bucket</td><td>None — automatic</td></tr>
          <tr><td><code>inlineQueue()</code></td><td>N/A (no background work)</td><td>Call <code>flushDigests()</code> on a cron</td></tr>
          <tr><td>Custom (BullMQ, SQS)</td><td>Your worker</td><td>Call <code>flushDigests()</code> every ~30s</td></tr>
        </tbody>
      </table>

      <h2>Rate limits</h2>
      <p>
        A rate limit drops sends that exceed a threshold within a sliding
        window. Unlike digests, dropped sends are gone — they&apos;re not
        buffered.
      </p>
      <Code
        filename="lib/notifications/mentions.ts"
        code={`notification({
  id: "comment_mentioned",
  payload: { actorName: "string", postUrl: "string" },
  channels: [inbox({ title: "{{actorName}} mentioned you" })],
  rateLimit: {
    max: 20,
    windowMs: 60 * 60_000,
    scope: "recipient",
  },
})`}
      />

      <h3>Scope options</h3>
      <table>
        <thead>
          <tr>
            <th>Scope</th>
            <th>Counts</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>&quot;recipient&quot;</code> (default)</td>
            <td>Sends to the same recipient for this notification</td>
          </tr>
          <tr>
            <td><code>&quot;global&quot;</code></td>
            <td>All sends for this notification across all recipients</td>
          </tr>
        </tbody>
      </table>

      <h3>Evaluation order</h3>
      <div className="callout callout-warn">
        <strong>Rate limit runs before digest.</strong> If a send exceeds the
        limit, it&apos;s dropped before it ever enters the digest buffer. This
        prevents attackers from flooding a user&apos;s digest bucket.
      </div>

      <h2>Combining both</h2>
      <p>
        Use rate limits as a safety valve and digests for the user experience.
        Here&apos;s what happens when a send hits a notification with both configured:
      </p>
      <div className="overview-flow">
        <div className="overview-flow-step">
          <span className="overview-flow-number">1</span>
          <div>
            <strong>Rate limit check</strong>
            <p>Is the recipient under the threshold? No → <strong>permanently dropped</strong>. Yes → continue.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">2</span>
          <div>
            <strong>Digest buffer</strong>
            <p>Payload appended to the recipient&apos;s bucket. Returns <code>digested: true</code>. No delivery yet.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">3</span>
          <div>
            <strong>Window expires</strong>
            <p><code>render()</code> combines all buffered payloads into one. A normal send executes with the combined payload.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">4</span>
          <div>
            <strong>Delivery</strong>
            <p>One email/notification reaches the user — regardless of how many events passed the rate limit.</p>
          </div>
        </div>
      </div>
      <table>
        <thead>
          <tr><th>With 100 sends in 1 hour</th><th>Rate limit: max 50</th><th>No rate limit</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>Sends that pass</td>
            <td>50 (other 50 permanently dropped)</td>
            <td>100</td>
          </tr>
          <tr>
            <td>Enter digest buffer</td>
            <td>50 payloads</td>
            <td>100 payloads</td>
          </tr>
          <tr>
            <td>Digests delivered</td>
            <td>1 email: &quot;50 new activities&quot;</td>
            <td>1 email: &quot;100 new activities&quot;</td>
          </tr>
          <tr>
            <td>User disruption</td>
            <td>1 notification</td>
            <td>1 notification</td>
          </tr>
        </tbody>
      </table>
      <div className="callout callout-tip">
        <strong>Rate limit protects your system, digest protects your user.</strong>{" "}
        Without the rate limit, an attacker triggering 10,000 events floods your
        digest buffer (wasting storage). The rate limit caps the buffer size.
        Without the digest, 50 individual emails still annoy the user. Together
        they cap both the storage cost and the user interruption.
      </div>
      <Code
        filename="lib/notifications/activity.ts"
        code={`notification({
  id: "activity_feed",
  payload: { summary: "string", count: "number" },
  channels: [inbox({ title: "{{count}} new activities" })],
  rateLimit: { max: 100, windowMs: 60 * 60_000 },
  digest: {
    windowMs: 10 * 60_000,
    render: ({ payloads, count }) => ({
      summary: \`\${count} things happened\`,
      count,
    }),
  },
})`}
      />

      <h2>Choosing a window size</h2>
      <p>
        Too short and you still get notification spam. Too long and users feel
        out of the loop. Match the window to how quickly users need to know:
      </p>
      <table>
        <thead>
          <tr><th>Window</th><th>Good for</th><th>User experience</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>1–2 min</strong></td>
            <td>Chat-style apps, live collaboration</td>
            <td>Near-instant but collapses rapid-fire bursts (3 messages → 1 email)</td>
          </tr>
          <tr>
            <td><strong>5–10 min</strong></td>
            <td>Comments, reactions, task updates</td>
            <td>Feels timely without being noisy. Best default for most apps.</td>
          </tr>
          <tr>
            <td><strong>30–60 min</strong></td>
            <td>Social feeds, activity digests</td>
            <td>Batches a burst of activity into one summary. Good for &quot;5 people liked your post.&quot;</td>
          </tr>
          <tr>
            <td><strong>4–24 hours</strong></td>
            <td>Daily summaries, weekly roundups</td>
            <td>Single comprehensive notification. Pair with a cron-triggered flush.</td>
          </tr>
        </tbody>
      </table>
      <div className="callout callout-tip">
        <strong>Start at 5 minutes and adjust.</strong> Monitor how many payloads
        end up in each digest via the <code>count</code> value in{" "}
        <code>render()</code>. If most digests contain only 1 item, your window
        is too short — you&apos;re adding latency without reducing noise.
      </div>

      <h2>Testing digests locally</h2>
      <p>
        Waiting 5+ minutes for a digest window to expire during development
        is painful. Use these patterns to iterate quickly:
      </p>
      <table>
        <thead>
          <tr><th>Approach</th><th>How</th><th>Best for</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Short window in dev</strong></td>
            <td>Override <code>windowMs</code> to 5 seconds in development</td>
            <td>Manual testing in the browser — see the digest arrive quickly</td>
          </tr>
          <tr>
            <td><strong>Manual flush</strong></td>
            <td>Call <code>notify.flushDigests()</code> directly after sends</td>
            <td>Automated tests — deterministic, no timers involved</td>
          </tr>
          <tr>
            <td><strong>Explain / dry run</strong></td>
            <td>Check <code>result.digested === true</code> on the send result</td>
            <td>Verifying the send entered the buffer without waiting for flush</td>
          </tr>
        </tbody>
      </table>
      <Code
        filename="lib/notifications/comments.ts"
        code={`notification({
  id: "new_comments",
  // ...
  digest: {
    windowMs: process.env.NODE_ENV === "test" ? 0 : 5 * 60_000,
    key: ({ payload }) => payload.postUrl,
    render: ({ payloads, count }) => ({ /* ... */ }),
  },
})`}
      />
      <Code
        filename="tests/digests.test.ts"
        code={`import { describe, it, expect } from "vitest"

describe("comment digest", () => {
  it("batches 3 mentions into one delivery", async () => {
    for (const actor of ["Rey", "Sam", "Ava"]) {
      const result = await testNotify.send({
        recipientId: "user_1",
        notificationId: "new_comments",
        payload: { actorName: actor, postTitle: "Launch", postUrl: "/p/1", count: 1 },
      })
      expect(result.digested).toBe(true)
      expect(result.deliveries).toHaveLength(0)
    }

    const flushed = await testNotify.flushDigests()

    expect(flushed).toHaveLength(1)
    expect(flushed[0].deliveries.length).toBeGreaterThan(0)
  })
})`}
      />
      <div className="callout callout-warn">
        <strong>Don&apos;t use <code>windowMs: 0</code> in production.</strong>{" "}
        A zero window means every send flushes immediately — it&apos;s the
        same as having no digest at all. Only use it in test environments
        where you call <code>flushDigests()</code> manually.
      </div>

      <h2>Retrofitting digests to a live notification</h2>
      <p>
        You shipped a notification without a digest. Now it&apos;s noisy —
        users get 15 emails an hour during active threads. Adding a digest
        to a live notification is safe, but the deploy sequence matters.
      </p>

      <div className="overview-flow">
        <div className="overview-flow-step">
          <span className="overview-flow-number">1</span>
          <div>
            <strong>Add payload fields for the digest summary</strong>
            <p>Your <code>render()</code> needs to return the full payload shape. If your current payload lacks a <code>count</code> or <code>summary</code> field, add it as optional first.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">2</span>
          <div>
            <strong>Deploy with digest config</strong>
            <p>Add <code>digest</code> to the notification definition. From this moment, new sends buffer instead of delivering immediately.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">3</span>
          <div>
            <strong>Ensure flush is running</strong>
            <p>If you use <code>inlineQueue()</code> or a custom queue, add a <code>flushDigests()</code> call to your cron. <code>setTimeoutQueue()</code> handles this automatically.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">4</span>
          <div>
            <strong>Monitor the first few windows</strong>
            <p>Watch items-per-flush in logs. If most digests contain only 1 item, the window is too short for your traffic pattern.</p>
          </div>
        </div>
      </div>

      <Code
        filename="lib/notifications/mentions.ts"
        code={`// BEFORE: direct delivery, noisy during active threads
notification({
  id: "comment_mentioned",
  payload: { actorName: "string", postTitle: "string", postUrl: "string" },
  channels: [
    inbox({ title: "{{actorName}} mentioned you in {{postTitle}}" }),
    email({ subject: "{{actorName}} mentioned you", body: "Open {{postUrl}}" }),
  ],
})`}
      />
      <Code
        filename="lib/notifications/mentions.ts"
        code={`// AFTER: digested — one email per 5 minutes instead of one per comment
notification({
  id: "comment_mentioned",
  payload: {
    actorName: "string",
    postTitle: "string",
    postUrl: "string",
    count: "number",
  },
  channels: [
    inbox({ title: "{{actorName}} mentioned you in {{postTitle}}" }),
    email({
      subject: "{{count}} new mentions in {{postTitle}}",
      body: "Latest from {{actorName}}. Open {{postUrl}} to catch up.",
    }),
  ],
  digest: {
    windowMs: 5 * 60_000,
    key: ({ payload }) => payload.postUrl,
    render: ({ payloads, count }) => ({
      actorName: payloads[payloads.length - 1]!.actorName,
      postTitle: payloads[0]!.postTitle,
      postUrl: payloads[0]!.postUrl,
      count,
    }),
  },
})`}
      />

      <table>
        <thead>
          <tr><th>Concern</th><th>What happens</th><th>Action</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Sends already in flight</strong></td>
            <td>They don&apos;t have <code>count</code> in their payload</td>
            <td>Make <code>count</code> optional in the schema. Handle missing values in <code>render()</code> with a default.</td>
          </tr>
          <tr>
            <td><strong>Inbox items</strong></td>
            <td>Inbox still delivers per-send (not batched)</td>
            <td>Expected — inbox is pull-based. Only push channels (email/SMS) digest.</td>
          </tr>
          <tr>
            <td><strong>Existing preferences</strong></td>
            <td>User opt-outs still apply to the digested send</td>
            <td>No change needed — preferences resolve on the flushed send, not on buffering.</td>
          </tr>
          <tr>
            <td><strong>Rate limits</strong></td>
            <td>Rate limit counts individual sends (before buffering)</td>
            <td>You may want to increase the rate limit now that digests reduce actual delivery volume.</td>
          </tr>
          <tr>
            <td><strong>User experience during deploy</strong></td>
            <td>First digest window after deploy may contain only 1 item</td>
            <td>Normal — the window starts counting from the first send after deploy. Subsequent windows batch properly.</td>
          </tr>
        </tbody>
      </table>

      <div className="callout callout-warn">
        <strong>Update all <code>send()</code> callers to pass <code>count: 1</code>.</strong>{" "}
        The digest <code>render()</code> produces a payload with <code>count</code>,
        but individual sends (that arrive outside a window, or when only 1 event fires)
        also need it. Without it, a single-item &quot;digest&quot; renders with an empty
        count. Set <code>count: 1</code> at every call site.
      </div>

      <div className="callout callout-tip">
        <strong>Rollback is instant.</strong> If the digest window feels wrong
        (too long, too short, users confused), remove the <code>digest</code> field
        and redeploy. Sends go back to direct delivery immediately. Any buffered
        payloads in the current window will flush on the next <code>flushDigests()</code>{" "}
        call — they won&apos;t be lost.
      </div>

      <h2>Render function patterns</h2>
      <p>
        The <code>render()</code> function is where you decide how a batch of
        events reads as a single notification. Here are patterns for common
        use cases:
      </p>
      <table>
        <thead>
          <tr><th>Pattern</th><th>Output example</th><th>When to use</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Latest actor + count</strong></td>
            <td>&quot;Ava and 4 others commented&quot;</td>
            <td>Comments, reactions, follows — user wants to see who and how many</td>
          </tr>
          <tr>
            <td><strong>Actor list (truncated)</strong></td>
            <td>&quot;Rey, Sam, and 3 others liked your post&quot;</td>
            <td>Social actions — names add social proof</td>
          </tr>
          <tr>
            <td><strong>Summary count only</strong></td>
            <td>&quot;12 new updates in Project X&quot;</td>
            <td>High-volume feeds where individual actors don&apos;t matter</td>
          </tr>
          <tr>
            <td><strong>Most recent event</strong></td>
            <td>&quot;Latest: deployment succeeded (+ 5 more)&quot;</td>
            <td>System/CI events — latest status matters most</td>
          </tr>
        </tbody>
      </table>
      <Code
        filename="lib/notifications/render-examples.ts"
        code={`// Latest actor + count
render: ({ payloads, count }) => ({
  actorName: payloads[payloads.length - 1]!.actorName,
  summary: count === 1
    ? \`\${payloads[0]!.actorName} commented\`
    : \`\${payloads[payloads.length - 1]!.actorName} and \${count - 1} others commented\`,
  postUrl: payloads[0]!.postUrl,
  count,
})

// Actor list (truncated to 2 names)
render: ({ payloads, count }) => {
  const unique = [...new Set(payloads.map(p => p.actorName))]
  const names = unique.slice(0, 2)
  const rest = unique.length - names.length

  return {
    actorList: rest > 0
      ? \`\${names.join(", ")}, and \${rest} others\`
      : names.join(" and "),
    action: "liked your post",
    postUrl: payloads[0]!.postUrl,
    count,
  }
}

// Summary count only
render: ({ payloads, count }) => ({
  summary: \`\${count} new updates\`,
  projectName: payloads[0]!.projectName,
  latestUrl: payloads[payloads.length - 1]!.url,
  count,
})

// Most recent event + tail count
render: ({ payloads, count }) => ({
  latest: payloads[payloads.length - 1]!.message,
  count,
  summary: count === 1
    ? payloads[0]!.message
    : \`\${payloads[payloads.length - 1]!.message} (+ \${count - 1} more)\`,
})`}
      />
      <div className="callout callout-tip">
        <strong>Deduplicate actors in render.</strong> If the same user likes
        a post 5 times in a window, you probably don&apos;t want &quot;Rey,
        Rey, Rey, and 2 others.&quot; Use <code>new Set()</code> on actor
        names before building the display string.
      </div>

      <h3>Render pitfalls</h3>
      <table>
        <thead>
          <tr><th>Mistake</th><th>Symptom</th><th>Fix</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>Returning fields not in payload schema</td>
            <td>Validation error on flush</td>
            <td>The rendered output must match your <code>payload</code> definition exactly</td>
          </tr>
          <tr>
            <td>Ignoring single-item case</td>
            <td>&quot;Rey and 0 others&quot;</td>
            <td>Branch on <code>count === 1</code> for singular phrasing</td>
          </tr>
          <tr>
            <td>Expensive computation in render</td>
            <td>Slow flush under load</td>
            <td>Keep render pure and fast — no DB calls, no fetch, no async</td>
          </tr>
          <tr>
            <td>Not handling empty <code>payloads</code></td>
            <td>Runtime crash on <code>payloads[0]!</code></td>
            <td>Won&apos;t happen — engine only calls render when <code>count &gt;= 1</code></td>
          </tr>
        </tbody>
      </table>

      <h2>Monitoring digests in production</h2>
      <p>
        Digests introduce a delay between <code>send()</code> and delivery.
        Monitor these signals to catch misconfigurations before users notice:
      </p>
      <table>
        <thead>
          <tr><th>Signal</th><th>Healthy</th><th>Problem</th><th>Action</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Items per flush</strong></td>
            <td>2–20 payloads per digest</td>
            <td>Consistently 1 item — window is too short, adding latency without reducing noise</td>
            <td>Increase <code>windowMs</code> or remove digest for this notification</td>
          </tr>
          <tr>
            <td><strong>Flush latency</strong></td>
            <td>Within seconds of <code>flushAt</code></td>
            <td>Digests flushing minutes late — cron or timer isn&apos;t running</td>
            <td>Check your flush mechanism (cron interval, <code>setTimeoutQueue</code> health)</td>
          </tr>
          <tr>
            <td><strong>Buffer growth</strong></td>
            <td>Buffers clear on each flush cycle</td>
            <td>Buffer rows accumulating without flushing</td>
            <td>Verify <code>flushDigests()</code> is being called — check for crashes in the worker</td>
          </tr>
          <tr>
            <td><strong>Render errors</strong></td>
            <td>Zero</td>
            <td><code>render()</code> throwing — digest stuck, never delivers</td>
            <td>Check logs for validation errors — returned shape must match payload schema</td>
          </tr>
        </tbody>
      </table>
      <Code
        filename="lib/notifykit.ts"
        code={`createNotifyKit({
  // ...
  on: {
    "notification.created": ({ notification }) => {
      if (notification.digestedCount && notification.digestedCount > 0) {
        metrics.histogram("notifykit.digest.items_per_flush", notification.digestedCount, {
          notification: notification.notificationId,
        })
      }
    },
  },
})`}
      />
      <Code
        filename="scripts/flush-cron.ts"
        code={`const flushed = await notify.flushDigests()
metrics.gauge("notifykit.digest.last_flush_count", flushed.length)`}
      />

      <div className="callout callout-tip">
        <strong>Digest + rate limit interaction recap.</strong> Rate limits run
        before digest buffering. If 100 sends hit a notification with{" "}
        <code>rateLimit: {`{ max: 50 }`}</code> and a 5-minute digest, only 50
        enter the buffer — the other 50 are permanently dropped. Monitor both
        the rate-limited count and the digest count to understand the full
        picture.
      </div>

      <h2>Debugging digest issues</h2>
      <p>
        Digests add a time-delayed step to the send pipeline. When they
        misbehave, the symptoms are confusing — sends appear to succeed
        (no error) but notifications never arrive. Use this table to
        trace the problem:
      </p>
      <table>
        <thead>
          <tr><th>Symptom</th><th>Likely cause</th><th>How to verify</th><th>Fix</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>Notification never arrives (no email, no inbox item from digest)</td>
            <td><code>flushDigests()</code> isn&apos;t running</td>
            <td>Check your cron logs or <code>setTimeoutQueue</code> health. Call <code>flushDigests()</code> manually — if items arrive, the timer is broken.</td>
            <td>Add <code>flushDigests()</code> to a cron (every 30s) or switch to <code>setTimeoutQueue()</code> which auto-flushes.</td>
          </tr>
          <tr>
            <td>Digest delivers but with wrong content (e.g. count is 0, missing fields)</td>
            <td><code>render()</code> function has a bug</td>
            <td>Log the <code>payloads</code> array passed to render. Check that your return shape matches the payload schema exactly.</td>
            <td>Fix the render logic. Common issues: accessing <code>payloads[0]</code> without <code>!</code>, not handling the single-item case, returning fields not in the schema.</td>
          </tr>
          <tr>
            <td>Some sends digest, others deliver immediately</td>
            <td>Digest <code>key</code> function returns different values for events you expected to group</td>
            <td>Log the key return value for each send. Different keys = separate digest buckets, each flushing independently.</td>
            <td>Ensure your key function returns the same string for events that should batch. Don&apos;t include actor IDs or timestamps in the key.</td>
          </tr>
          <tr>
            <td>Digest flushes but user gets a validation error (notification not delivered)</td>
            <td><code>render()</code> returns a shape that doesn&apos;t match the payload schema</td>
            <td>Check error logs around flush time. The engine validates the rendered payload the same way it validates a normal <code>send()</code>.</td>
            <td>Ensure <code>render()</code> returns every required field from your payload schema with the correct type.</td>
          </tr>
          <tr>
            <td>Digest always contains only 1 item</td>
            <td>Window is too short, or events are too spread out</td>
            <td>Log <code>count</code> in your render function. If consistently 1, the window expires before a second event arrives.</td>
            <td>Increase <code>windowMs</code> (try 10–15 min), or remove digest entirely if events don&apos;t actually burst.</td>
          </tr>
          <tr>
            <td><code>send()</code> returns <code>digested: true</code> but inbox item appears immediately</td>
            <td>This is correct — inbox delivers per-send, only push channels (email/SMS) are digested</td>
            <td>Check <code>result.inboxItems</code> vs <code>result.deliveries</code>. Inbox items write immediately; email delivery waits for flush.</td>
            <td>No fix needed — this is by design. Inbox is pull-based (user opens it when ready), so batching adds no value there.</td>
          </tr>
        </tbody>
      </table>

      <div className="overview-flow">
        <div className="overview-flow-step">
          <span className="overview-flow-number">1</span>
          <div>
            <strong>Check if sends enter the buffer</strong>
            <p>After <code>send()</code>, check <code>result.digested === true</code>. If false, the notification doesn&apos;t have a digest config — or dedup/rate-limit intercepted it earlier.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">2</span>
          <div>
            <strong>Check if flush runs</strong>
            <p>Call <code>flushDigests()</code> manually from a script. If it returns results, your automatic flush mechanism is broken. If empty, nothing has expired yet — wait for <code>windowMs</code> to pass.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">3</span>
          <div>
            <strong>Check render output</strong>
            <p>If flush runs but delivery fails, the issue is in <code>render()</code>. Add temporary logging to see what payloads and count look like, then verify your return matches the schema.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">4</span>
          <div>
            <strong>Check downstream pipeline</strong>
            <p>The flushed send goes through preferences, quiet hours, and delivery — same as a normal send. Use <Link href="/docs/explain">explain()</Link> with the rendered payload to check if another stage blocks it.</p>
          </div>
        </div>
      </div>
      <Code
        filename="scripts/diagnose-digest.ts"
        code={`import { notify } from "@/lib/notifykit"

async function diagnoseDigest() {
  const result = await notify.send({
    recipientId: "test_user",
    notificationId: "new_comments",
    payload: { actorName: "Debug", postTitle: "Test", postUrl: "/test", count: 1 },
  })
  console.log("Digested:", result.digested)

  const flushed = await notify.flushDigests()
  console.log("Flushed count:", flushed.length)
  if (flushed.length > 0) {
    console.log("Deliveries:", flushed[0].deliveries.length)
  } else {
    console.log("Nothing to flush — window hasn't expired yet")
  }
}

diagnoseDigest()`}
      />
      <div className="callout callout-tip">
        <strong>Most digest bugs are flush bugs.</strong> If <code>send()</code>{" "}
        returns <code>digested: true</code>, the buffering works. The problem is
        almost always that nothing is calling <code>flushDigests()</code> after
        the window expires. With <code>setTimeoutQueue()</code> this is automatic;
        with any other queue, you need a cron or worker loop.
      </div>

      <div className="button-row">
        <Link href="/docs/quiet-hours" className="primary">Quiet hours</Link>
        <Link href="/docs/hooks">Hooks & observability</Link>
        <Link href="/docs/explain">Explain & dry run</Link>
      </div>

      <div className="page-nav">
        <Link href="/docs/preferences">
          <span className="page-nav-label">Previous</span>
          <span className="page-nav-title">Preferences & unsubscribe</span>
        </Link>
        <Link href="/docs/quiet-hours">
          <span className="page-nav-label">Next</span>
          <span className="page-nav-title">Quiet hours</span>
        </Link>
      </div>
    </article>
  );
}

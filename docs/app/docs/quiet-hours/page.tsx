import Link from "next/link";
import { createDocsMetadata } from "../../../lib/site";
import { Code } from "../../_components/code";

export const metadata = createDocsMetadata("quiet-hours");

export default function QuietHoursPage() {
  return (
    <article>
      <h1>Quiet hours</h1>
      <p>
        Quiet hours define a daily window during which push-style channels
        (email, SMS, webhook) defer delivery. Inbox is unaffected — it&apos;s
        user-pulled, so the item is just there whenever they look.
      </p>

      <div className="features">
        <div className="feature-card">
          <h3>Defers, never drops</h3>
          <p>Push channels (email, SMS, webhook) are held until the window ends. Nothing is lost.</p>
        </div>
        <div className="feature-card">
          <h3>Inbox unaffected</h3>
          <p>Inbox items deliver immediately regardless — they&apos;re user-pulled, not interruptive.</p>
        </div>
        <div className="feature-card">
          <h3>Per-recipient timezone</h3>
          <p>Each user&apos;s window resolves in their stored IANA timezone. Deploy your server anywhere.</p>
        </div>
        <div className="feature-card">
          <h3>Composable with digests</h3>
          <p>Digests batch first, quiet hours defer the result. Users wake up to summaries, not walls of emails.</p>
        </div>
      </div>

      <div className="callout callout-tip">
        <strong>Respect your users&apos; sleep.</strong> A notification at 3am
        doesn&apos;t just annoy — it erodes trust. Quiet hours let you
        deliver the moment the window opens, without losing the notification
        or requiring the user to check later.
      </div>

      <h2>Setting quiet hours</h2>
      <p>
        Quiet hours are a property of the recipient. Set them at upsert time:
      </p>
      <Code
        filename="lib/onboard-user.ts"
        code={`await notify.upsertRecipient({
  id: user.id,
  email: user.email,
  quietHours: {
    start: "22:00",
    end: "08:00",
    timezone: "America/New_York",
  },
})`}
      />
      <div className="callout callout-warn">
        <strong>Always store the user&apos;s IANA timezone.</strong> Without it,
        NotifyKit defaults to UTC — a user in New York with{" "}
        <code>start: &quot;22:00&quot;</code> would have quiet hours from
        10pm <em>UTC</em> (6pm local), not 10pm local.
      </div>
      <p>
        To clear quiet hours, pass <code>quietHours: null</code>. Omitting
        the field leaves the existing value unchanged.
      </p>

      <h2>How deferral works</h2>
      <div className="overview-flow">
        <div className="overview-flow-step">
          <span className="overview-flow-number">1</span>
          <div>
            <strong>Check window</strong>
            <p><code>send()</code> checks if the current moment falls within the recipient&apos;s quiet window.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">2</span>
          <div>
            <strong>Schedule delivery</strong>
            <p>If inside quiet hours, a <code>ScheduledSend</code> row is written with <code>scheduledFor</code> set to the window&apos;s end time.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">3</span>
          <div>
            <strong>Inbox still fires</strong>
            <p>Only push channels (email, SMS, webhook) are deferred. Inbox delivers immediately — it&apos;s user-pulled.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">4</span>
          <div>
            <strong>Window ends — deliver</strong>
            <p>When the flush runs (automatic with <code>setTimeoutQueue</code>, or via <code>flushScheduledSends()</code>), the deferred notification sends normally.</p>
          </div>
        </div>
      </div>

      <h2>Flushing scheduled sends</h2>
      <p>
        Deferred sends need something to pick them up when the window ends.
        The approach depends on your deployment:
      </p>
      <table>
        <thead>
          <tr><th>Environment</th><th>Flush strategy</th><th>Setup</th></tr>
        </thead>
        <tbody>
          <tr><td>Long-running server + <code>setTimeoutQueue()</code></td><td>Automatic</td><td>None — internal timers handle it</td></tr>
          <tr><td>Long-running server + custom queue</td><td>Interval</td><td><code>setInterval(() =&gt; notify.flushScheduledSends(), 60_000)</code></td></tr>
          <tr><td>Serverless (Vercel, Lambda)</td><td>External cron</td><td>Hit an API route every minute via cron job service</td></tr>
        </tbody>
      </table>
      <Code
        filename="app/api/cron/flush-sends/route.ts"
        code={`export async function GET() {
  const flushed = await notify.flushScheduledSends()
  return Response.json({ flushed: flushed.length })
}`}
      />
      <div className="callout callout-tip">
        <strong>Safe to over-call.</strong> The flush uses an atomic claim
        mechanism — multiple workers (or overlapping cron invocations) can
        call it concurrently without duplicate delivery.
      </div>

      <h2>Interaction with other features</h2>
      <p>
        Quiet hours sit late in the pipeline — after rate limits, dedup, and
        preferences have already run. This ordering creates behaviors that
        can surprise you:
      </p>
      <div className="overview-flow">
        <div className="overview-flow-step">
          <span className="overview-flow-number">1</span>
          <div>
            <strong>Rate limit (already counted)</strong>
            <p>The send consumes a rate limit slot at call time — even though delivery is deferred.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">2</span>
          <div>
            <strong>Preferences (already resolved)</strong>
            <p>Opted-out channels are skipped before quiet hours check. Quiet hours only defer what&apos;s left.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">3</span>
          <div>
            <strong>Quiet hours (you are here)</strong>
            <p>Push channels write a <code>ScheduledSend</code>. Inbox delivers immediately.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">4</span>
          <div>
            <strong>Flush → Deliver</strong>
            <p>When the window ends, the deferred send runs delivery as normal.</p>
          </div>
        </div>
      </div>
      <table>
        <thead>
          <tr><th>Feature</th><th>Interaction</th><th>Implication</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Required notifications</strong></td>
            <td>Still deferred — quiet hours override even <code>required: true</code></td>
            <td>For true instant delivery (security alerts), don&apos;t set quiet hours on that recipient</td>
          </tr>
          <tr>
            <td><strong>Digests</strong></td>
            <td>Digest flush respects quiet hours — if it fires during the window, the rendered email is deferred</td>
            <td>Users may get the digest at 8am even if the window was 5 minutes</td>
          </tr>
          <tr>
            <td><strong>Rate limits</strong></td>
            <td>Count at <code>send()</code> time, not delivery time</td>
            <td>A burst of 50 sends at 11pm consumes 50 slots even if they all deliver at 8am</td>
          </tr>
          <tr>
            <td><strong>Dedup</strong></td>
            <td>Dedup window runs from <code>send()</code> time, not delivery time</td>
            <td>A deferred send and a re-send after the window opens won&apos;t be deduped (different keys or window expired)</td>
          </tr>
          <tr>
            <td><strong>Explain / dry run</strong></td>
            <td>Reports <code>quietHours.active: true</code> and <code>resumesAt</code> without side effects</td>
            <td>Use for debugging — shows what <em>would</em> happen without writing a scheduled row</td>
          </tr>
        </tbody>
      </table>
      <div className="callout callout-warn">
        <strong>Rate limits count at send time.</strong> This is the most
        common surprise. If a user&apos;s rate limit is 20/hour and 20
        notifications fire during quiet hours, they&apos;re rate-limited for
        that hour — even though nothing was delivered yet. Design rate limits
        around <em>event frequency</em>, not delivery frequency.
      </div>

      <h2>Batch delivery at window end</h2>
      <p>
        When the quiet window closes, every deferred notification fires at
        once. If 15 emails accumulated overnight, the user gets 15 emails at
        8:00 AM. This is the &quot;morning thunderstorm&quot; — and whether
        it&apos;s a problem depends on volume.
      </p>
      <table>
        <thead>
          <tr><th>Deferred count</th><th>User experience</th><th>Action needed</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>1–5 emails</strong></td>
            <td>Normal. Users expect a small batch in the morning.</td>
            <td>None — this is the designed behavior.</td>
          </tr>
          <tr>
            <td><strong>5–20 emails</strong></td>
            <td>Noisy but tolerable. Users might skim or bulk-archive.</td>
            <td>Consider adding <code>digest</code> to high-frequency notifications. The digest renders before quiet hours defer — so the user gets one &quot;12 new comments&quot; email, not twelve individual ones.</td>
          </tr>
          <tr>
            <td><strong>20+ emails</strong></td>
            <td>Overwhelming. Users unsubscribe or mark as spam.</td>
            <td>You have a noise problem, not a quiet-hours problem. Fix upstream: add rate limits, enable digests, or reduce which notifications use email.</td>
          </tr>
        </tbody>
      </table>
      <div className="overview-flow">
        <div className="overview-flow-step">
          <span className="overview-flow-number">1</span>
          <div>
            <strong>Digests collapse before deferral</strong>
            <p>A 5-minute digest window batches rapid events into one email. Quiet hours then defers that single email — not the 20 individual ones.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">2</span>
          <div>
            <strong>Rate limits cap the total</strong>
            <p>If a notification has <code>rateLimit: {`{ max: 10, windowMs: 3600000 }`}</code>, at most 10 emails defer per hour — even if 50 events fire.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">3</span>
          <div>
            <strong>Inbox absorbs the overflow</strong>
            <p>Inbox delivers immediately regardless of quiet hours. Users who check the app see everything; email is the deferred summary, not the primary channel.</p>
          </div>
        </div>
      </div>
      <div className="callout callout-tip">
        <strong>Combine digests with quiet hours for high-frequency events.</strong>{" "}
        A notification with <code>digest: {`{ windowMs: 300_000 }`}</code> plus a
        user with quiet hours from 10 PM–8 AM means: events batch into one
        email per 5-minute window, and any that land during quiet hours are held
        until morning. The user wakes up to a handful of summary emails — not
        a wall of individual notifications. See{" "}
        <Link href="/docs/digests">Digests &amp; rate limits</Link>.
      </div>

      <h2>Exposing to users</h2>
      <p>
        Quiet hours are a recipient property — update them via{" "}
        <code>upsertRecipient()</code> from a server action tied to a
        settings form:
      </p>
      <Code
        filename="app/actions/quiet-hours.ts"
        code={`"use server"
import { notify } from "@/lib/notifykit"

export async function updateQuietHours(formData: FormData) {
  const start = formData.get("start") as string
  const end = formData.get("end") as string
  const timezone = formData.get("timezone") as string
  const enabled = formData.get("enabled") === "on"

  await notify.upsertRecipient({
    id: session.userId,
    quietHours: enabled ? { start, end, timezone } : null,
  })
}`}
      />
      <table>
        <thead>
          <tr><th>Form field</th><th>Input type</th><th>Guidance</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>Enable/disable toggle</td>
            <td>Checkbox</td>
            <td>Pass <code>null</code> to clear quiet hours entirely</td>
          </tr>
          <tr>
            <td>Start / End time</td>
            <td><code>&lt;input type=&quot;time&quot;&gt;</code></td>
            <td>Native browser time picker gives <code>HH:MM</code> format directly</td>
          </tr>
          <tr>
            <td>Timezone</td>
            <td><code>&lt;select&gt;</code> with IANA zones</td>
            <td>Pre-select from <code>Intl.DateTimeFormat().resolvedOptions().timeZone</code></td>
          </tr>
        </tbody>
      </table>
      <div className="callout callout-tip">
        <strong>Auto-detect timezone.</strong> On first visit, read the
        browser&apos;s timezone via{" "}
        <code>Intl.DateTimeFormat().resolvedOptions().timeZone</code> and
        pre-fill the selector. Users rarely know their IANA zone name — but
        their browser does.
      </div>

      <h2>Building the settings UI</h2>
      <p>
        Most apps offer quiet hours as a simple toggle with time pickers.
        Here&apos;s a complete form component that handles the common
        UX patterns — presets, auto-detected timezone, and a clear visual
        of the active window:
      </p>
      <Code
        filename="components/quiet-hours-form.tsx"
        code={`"use client"
import { useState, useEffect } from "react"
import { updateQuietHours } from "@/app/actions/quiet-hours"

const PRESETS = [
  { label: "Night owl (10 PM – 8 AM)", start: "22:00", end: "08:00" },
  { label: "Sleep only (11 PM – 7 AM)", start: "23:00", end: "07:00" },
  { label: "Work focus (9 AM – 5 PM)", start: "09:00", end: "17:00" },
] as const

export function QuietHoursForm({ current }: {
  current: { start: string; end: string; timezone: string } | null
}) {
  const [enabled, setEnabled] = useState(!!current)
  const [start, setStart] = useState(current?.start ?? "22:00")
  const [end, setEnd] = useState(current?.end ?? "08:00")
  const [timezone, setTimezone] = useState(
    current?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone
  )

  return (
    <form action={updateQuietHours}>
      <label className="toggle-row">
        <input
          type="checkbox"
          name="enabled"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
        />
        <strong>Enable quiet hours</strong>
        <span className="hint">Pause email & SMS during this window</span>
      </label>

      <fieldset disabled={!enabled}>
        {/* Presets */}
        <div className="presets" role="group" aria-label="Quick presets">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              className={start === p.start && end === p.end ? "active" : ""}
              onClick={() => { setStart(p.start); setEnd(p.end) }}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Custom time pickers */}
        <div className="time-row">
          <label>
            From
            <input type="time" name="start" value={start} onChange={e => setStart(e.target.value)} />
          </label>
          <label>
            Until
            <input type="time" name="end" value={end} onChange={e => setEnd(e.target.value)} />
          </label>
        </div>

        {/* Timezone */}
        <label>
          Timezone
          <select name="timezone" value={timezone} onChange={e => setTimezone(e.target.value)}>
            {Intl.supportedValuesOf("timeZone").map(tz => (
              <option key={tz} value={tz}>{tz.replace(/_/g, " ")}</option>
            ))}
          </select>
        </label>
      </fieldset>

      <button type="submit">Save</button>
    </form>
  )
}`}
      />
      <table>
        <thead>
          <tr><th>UX pattern</th><th>Why</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Presets first, custom below</strong></td>
            <td>Most users pick &quot;Night owl&quot; and never touch the time pickers. One click vs four inputs.</td>
          </tr>
          <tr>
            <td><strong>Auto-detect timezone</strong></td>
            <td>Users don&apos;t know their IANA zone. <code>Intl.DateTimeFormat()</code> gets it from the browser.</td>
          </tr>
          <tr>
            <td><strong>Disable fieldset when off</strong></td>
            <td>Grey out all inputs when quiet hours are toggled off — clear visual that nothing applies.</td>
          </tr>
          <tr>
            <td><strong>&quot;Email &amp; SMS&quot; hint</strong></td>
            <td>Users need to know inbox notifications still arrive. Without this, they expect total silence.</td>
          </tr>
        </tbody>
      </table>
      <div className="callout callout-tip">
        <strong>Offer presets, not just raw pickers.</strong> In user research,
        most people choose one of 2–3 common patterns. A preset row with one-click
        options has higher adoption than a bare time input — and fewer support
        tickets from users who accidentally set 10 AM instead of 10 PM.
      </div>

      <h2>Timezone edge cases</h2>
      <p>
        Quiet hours use wall-clock time in the recipient&apos;s timezone.
        This means DST transitions, travel, and missing timezones can cause
        unexpected behavior:
      </p>
      <table>
        <thead>
          <tr><th>Scenario</th><th>What happens</th><th>Recommendation</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Spring forward</strong> (clock skips 2:00→3:00)</td>
            <td>If quiet hours end at 2:30, the window ends at 3:00 — the 2:30 wall-clock never exists</td>
            <td>Use round hours (e.g. 22:00–08:00) to avoid landing in the skipped gap</td>
          </tr>
          <tr>
            <td><strong>Fall back</strong> (clock repeats 1:00–2:00)</td>
            <td>NotifyKit uses the first occurrence — quiet hours end on time, not an hour late</td>
            <td>No action needed. The window resolves correctly.</td>
          </tr>
          <tr>
            <td><strong>User travels</strong> (timezone changes)</td>
            <td>Quiet hours fire in the stored timezone, not the user&apos;s current location</td>
            <td>Prompt users to update timezone in settings, or auto-detect on each session</td>
          </tr>
          <tr>
            <td><strong>No timezone stored</strong></td>
            <td>Falls back to UTC — quiet hours may be completely wrong for the user</td>
            <td>Always set <code>timezone</code>. If unknown, detect from the browser before enabling.</td>
          </tr>
          <tr>
            <td><strong>Server in different timezone</strong></td>
            <td>No effect — NotifyKit uses the stored IANA zone, not the server&apos;s local time</td>
            <td>No action needed. Deploy anywhere.</td>
          </tr>
        </tbody>
      </table>
      <Code
        filename="lib/sync-timezone.ts"
        code={`async function syncTimezone() {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
  await fetch("/api/notifykit-actions/update-timezone", {
    method: "POST",
    body: JSON.stringify({ timezone: tz }),
  })
}`}
      />
      <Code
        filename="app/actions/update-timezone.ts"
        code={`export async function updateTimezone(timezone: string) {
  const recipient = await notify.getRecipient(session.userId)
  if (recipient?.quietHours && recipient.quietHours.timezone !== timezone) {
    await notify.upsertRecipient({
      id: session.userId,
      quietHours: { ...recipient.quietHours, timezone },
    })
  }
}`}
      />
      <div className="callout callout-warn">
        <strong>Don&apos;t use fixed UTC offsets.</strong> Storing{" "}
        <code>&quot;UTC-5&quot;</code> instead of{" "}
        <code>&quot;America/New_York&quot;</code> means quiet hours won&apos;t
        adjust when DST changes. Always use IANA zone names — they encode
        the full history of a region&apos;s UTC offset transitions.
      </div>

      <h2>Testing quiet hours in development</h2>
      <p>
        You can&apos;t wait until 10pm to verify your quiet hours work. Use
        these patterns to test deterministically:
      </p>
      <table>
        <thead>
          <tr><th>Approach</th><th>How</th><th>Best for</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Set a window that&apos;s always active</strong></td>
            <td><code>start: &quot;00:00&quot;, end: &quot;23:59&quot;</code></td>
            <td>Quick manual testing — every send is deferred</td>
          </tr>
          <tr>
            <td><strong>Use a far-away timezone</strong></td>
            <td>Set timezone to one where it&apos;s currently nighttime</td>
            <td>Testing timezone resolution without changing your system clock</td>
          </tr>
          <tr>
            <td><strong>Use explain() to check</strong></td>
            <td><code>explanation.quietHours.active</code> tells you without side effects</td>
            <td>Automated tests — assert on the explanation without triggering delivery</td>
          </tr>
          <tr>
            <td><strong>Send then flush immediately</strong></td>
            <td><code>send()</code> → <code>flushScheduledSends()</code></td>
            <td>Integration tests — verify the full defer→flush→deliver cycle</td>
          </tr>
        </tbody>
      </table>
      <Code
        filename="tests/quiet-hours.test.ts"
        code={`import { describe, it, expect } from "vitest"

describe("quiet hours", () => {
  it("defers email during quiet window", async () => {
    // Set up a recipient with an always-active quiet window
    await testNotify.upsertRecipient({
      id: "user_1",
      email: "test@example.com",
      quietHours: { start: "00:00", end: "23:59", timezone: "UTC" },
    })

    const result = await testNotify.send({
      recipientId: "user_1",
      notificationId: "comment_mentioned",
      payload: { actorName: "Rey", postUrl: "/p/1" },
    })

    // Email was deferred, not delivered
    expect(result.deferredChannels).toContain("email")
    expect(result.deliveries.filter(d => d.channel === "email")).toHaveLength(0)

    // Inbox still delivered immediately (pull channel)
    expect(result.inboxItems).toHaveLength(1)
  })

  it("flushes deferred sends", async () => {
    // After the window "ends" (or in tests, just flush manually)
    const flushed = await testNotify.flushScheduledSends()

    expect(flushed).toHaveLength(1)
    expect(flushed[0].deliveries[0].channel).toBe("email")
    expect(flushed[0].deliveries[0].status).toBe("sent")
  })

  it("explain() reports quiet hours without side effects", async () => {
    const explanation = await testNotify.explain({
      recipientId: "user_1",
      notificationId: "comment_mentioned",
      payload: { actorName: "Rey", postUrl: "/p/1" },
    })

    expect(explanation.quietHours.active).toBe(true)
    // No records written, no deliveries queued
  })
})`}
      />
      <div className="callout callout-tip">
        <strong>Pro tip: use <code>start: &quot;00:00&quot;, end: &quot;23:59&quot;</code> in test fixtures.</strong>{" "}
        This creates an always-active window regardless of when your CI runs.
        For the inverse (never active), simply omit <code>quietHours</code> or
        set it to <code>null</code>.
      </div>

      <h2>Monitoring scheduled sends</h2>
      <p>
        The most dangerous quiet-hours bug isn&apos;t a wrong window — it&apos;s
        a flush that stops running. Deferred notifications pile up silently,
        and users never receive them. Detect this before they file a ticket.
      </p>
      <table>
        <thead>
          <tr><th>Failure mode</th><th>How it happens</th><th>User impact</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Cron stops firing</strong></td>
            <td>Vercel cron limit exceeded, Lambda disabled, server restarted without cron re-registration</td>
            <td>All deferred emails/SMS stuck indefinitely — users never get them</td>
          </tr>
          <tr>
            <td><strong>Flush errors silently</strong></td>
            <td>Database connection fails inside <code>flushScheduledSends()</code>, no error reporting configured</td>
            <td>Same as above — sends claimed but not delivered</td>
          </tr>
          <tr>
            <td><strong>Clock skew across workers</strong></td>
            <td>Multi-instance deploy where one worker&apos;s clock drifts &gt;1 minute</td>
            <td>Some sends flush early or late — subtle timing issues</td>
          </tr>
        </tbody>
      </table>

      <h3>Health check pattern</h3>
      <p>
        Query the scheduled sends table directly. If rows exist with a{" "}
        <code>scheduledFor</code> in the past (more than a few minutes ago),
        the flush isn&apos;t keeping up:
      </p>
      <Code
        filename="app/api/health/quiet-hours/route.ts"
        code={`import { notifyKitSchema } from "@notifykitjs/drizzle"
import { lt, count } from "drizzle-orm"
import { db } from "@/lib/db"

export async function GET() {
  const fiveMinAgo = new Date(Date.now() - 5 * 60_000)

  const [{ stale }] = await db
    .select({ stale: count() })
    .from(notifyKitSchema.scheduledSends)
    .where(lt(notifyKitSchema.scheduledSends.scheduledFor, fiveMinAgo))

  if (stale > 0) {
    return Response.json(
      { status: "unhealthy", staleSends: stale, message: "Flush cron may have stopped" },
      { status: 503 }
    )
  }

  return Response.json({ status: "healthy", staleSends: 0 })
}`}
      />
      <table>
        <thead>
          <tr><th>Alert condition</th><th>Severity</th><th>Action</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><code>staleSends &gt; 0</code> for &gt; 5 min</td>
            <td>Warning</td>
            <td>Check cron job status — might be delayed, not dead</td>
          </tr>
          <tr>
            <td><code>staleSends &gt; 0</code> for &gt; 30 min</td>
            <td>Critical</td>
            <td>Flush is dead. Manually call <code>flushScheduledSends()</code> and fix the cron.</td>
          </tr>
          <tr>
            <td><code>staleSends &gt; 100</code></td>
            <td>Critical</td>
            <td>Large backlog — flush may be running but failing. Check error logs.</td>
          </tr>
        </tbody>
      </table>
      <div className="callout callout-tip">
        <strong>Wire the health check into your uptime monitor.</strong> Point
        Datadog, Better Uptime, or a simple cron at{" "}
        <code>/api/health/quiet-hours</code>. Alert when it returns 503. This
        catches the silent failure that no other test will — a broken cron
        produces no errors, just absence of delivery.
      </div>

      <h3>Flush observability hook</h3>
      <p>
        Track every flush invocation so you can confirm it&apos;s running and
        measure how many sends it processes:
      </p>
      <Code
        filename="app/api/cron/flush-sends/route.ts"
        code={`export async function GET() {
  const start = Date.now()
  const flushed = await notify.flushScheduledSends()
  const durationMs = Date.now() - start

  metrics.gauge("notifykit.flush.duration_ms", durationMs)
  metrics.gauge("notifykit.flush.count", flushed.length)

  if (durationMs > 5000) {
    logger.warn("Quiet hours flush took >5s", { durationMs, count: flushed.length })
  }

  const failed = flushed.filter(r => r.deliveries.some(d => d.status === "failed"))
  if (failed.length > 0) {
    metrics.inc("notifykit.flush.failures", failed.length)
  }

  return Response.json({ flushed: flushed.length, durationMs })
}`}
      />
      <div className="callout callout-warn">
        <strong>A flush that returns zero isn&apos;t broken.</strong> Zero means
        no sends were due — normal outside quiet-hours windows. Only alert on
        the health check (stale rows exist) — not on the flush count being zero.
      </div>

      <h2>Quiet hours vs digests</h2>
      <p>
        Both reduce notification noise, but they solve different problems.
        Understanding the distinction prevents choosing the wrong tool:
      </p>
      <table>
        <thead>
          <tr><th></th><th>Quiet hours</th><th>Digests</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Problem solved</strong></td>
            <td>Don&apos;t interrupt during sleep/focus time</td>
            <td>Collapse many events into one notification</td>
          </tr>
          <tr>
            <td><strong>Controlled by</strong></td>
            <td>Recipient (their schedule)</td>
            <td>Developer (notification config)</td>
          </tr>
          <tr>
            <td><strong>Notification count</strong></td>
            <td>Same number, just delayed</td>
            <td>Fewer — many become one</td>
          </tr>
          <tr>
            <td><strong>Content</strong></td>
            <td>Original notification, unchanged</td>
            <td>Combined via <code>render()</code> function</td>
          </tr>
          <tr>
            <td><strong>Timing</strong></td>
            <td>Sends at window end (e.g. 8am)</td>
            <td>Sends after window expires (e.g. after 5 min of quiet)</td>
          </tr>
          <tr>
            <td><strong>Channels affected</strong></td>
            <td>Push only (email, SMS, webhook). Inbox unaffected.</td>
            <td>All channels (the digest <em>is</em> the notification)</td>
          </tr>
        </tbody>
      </table>

      <div className="features">
        <div className="feature-card">
          <h3>Use quiet hours when...</h3>
          <p>The notification is time-sensitive during waking hours but shouldn&apos;t wake someone up. Each event is individually important.</p>
        </div>
        <div className="feature-card">
          <h3>Use digests when...</h3>
          <p>Individual events are low-value but a summary is useful. &quot;5 new comments&quot; is better than 5 separate emails.</p>
        </div>
        <div className="feature-card">
          <h3>Use both when...</h3>
          <p>High-frequency events that also shouldn&apos;t interrupt sleep. Digest collapses them, quiet hours delays delivery of the digest.</p>
        </div>
      </div>

      <table>
        <thead>
          <tr><th>Scenario</th><th>Right tool</th><th>Why</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>Team invite at 2am</td>
            <td>Quiet hours</td>
            <td>One important notification — just delay it until morning</td>
          </tr>
          <tr>
            <td>15 likes on a post in 10 minutes</td>
            <td>Digest</td>
            <td>Collapse into &quot;15 people liked your post&quot; — the individual events don&apos;t matter</td>
          </tr>
          <tr>
            <td>Comment thread exploding while user sleeps</td>
            <td>Both</td>
            <td>Digest collapses &quot;42 comments&quot; into one email, quiet hours holds it until 8am</td>
          </tr>
          <tr>
            <td>Security alert at 3am</td>
            <td>Neither</td>
            <td>Don&apos;t configure quiet hours for these recipients — <code>required: true</code> prevents opt-out but doesn&apos;t bypass the quiet window</td>
          </tr>
        </tbody>
      </table>
      <div className="callout callout-warn">
        <strong>Quiet hours defer even <code>required: true</code> notifications.</strong>{" "}
        The <code>required</code> flag only prevents users from opting out via
        preferences — it does not bypass the quiet window. Required notifications
        are still held until the window ends. For instant delivery regardless
        of time (security alerts, 2FA codes), don&apos;t configure quiet hours
        on those recipients.
      </div>

      <div className="button-row">
        <Link href="/docs/digests" className="primary">Digests & rate limits</Link>
        <Link href="/docs/preferences">Preferences</Link>
        <Link href="/docs/explain">Explain & dry run</Link>
      </div>

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

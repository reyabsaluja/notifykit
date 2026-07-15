import type { Metadata } from "next";
import Link from "next/link";
import { Code } from "../../_components/code";

export const metadata: Metadata = { title: "Realtime" };

export default function RealtimePage() {
  return (
    <article>
      <h1>Realtime</h1>
      <p>
        NotifyKit supports real-time updates so inbox items and unread counts
        appear instantly in the client. Three adapters are available — pick based
        on your deployment.
      </p>

      <div className="features">
        <div className="feature-card">
          <h3>Instant inbox updates</h3>
          <p>New items appear in the client the moment they&apos;re created — no polling, no manual refresh.</p>
        </div>
        <div className="feature-card">
          <h3>Live unread counts</h3>
          <p>Badge counts update instantly when items are read, archived, or created across tabs and devices.</p>
        </div>
        <div className="feature-card">
          <h3>Automatic reconnection</h3>
          <p>Built-in exponential backoff with gap-fill on reconnect. No events lost during network drops.</p>
        </div>
        <div className="feature-card">
          <h3>Tenant-scoped events</h3>
          <p>Events are isolated by identity and scope. Cross-tenant data never leaks through the event stream.</p>
        </div>
      </div>

      <table>
        <thead>
          <tr><th>Adapter</th><th>Best for</th><th>Trade-off</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>In-memory</strong></td>
            <td>Local dev, single-server deploys</td>
            <td>Events don&apos;t cross process boundaries</td>
          </tr>
          <tr>
            <td><strong>PostgreSQL NOTIFY</strong></td>
            <td>Multi-instance with shared Postgres</td>
            <td>8KB payload limit, needs a dedicated connection</td>
          </tr>
          <tr>
            <td><strong>WebSocket</strong></td>
            <td>Custom transports, high connection counts</td>
            <td>More setup — you manage the WS server</td>
          </tr>
        </tbody>
      </table>

      <div className="callout callout-tip">
        <strong>Start with in-memory.</strong> It works out of the box with zero
        config. Upgrade to Postgres NOTIFY when you add a second server instance,
        or WebSocket when you need full control.
      </div>

      <h2>In-memory adapter</h2>
      <p>
        For single-process deployments (one Next.js server, no horizontal
        scaling):
      </p>
      <Code
        filename="lib/notifykit.ts"
        code={`import { memoryRealtimeAdapter } from "@notifykitjs/core"

const notify = createNotifyKit({
  // ...
  realtime: memoryRealtimeAdapter(),
})`}
      />
      <p>
        Events are dispatched in-process. If you have multiple server
        instances, each only sees events from its own sends.
      </p>

      <h2>PostgreSQL NOTIFY adapter</h2>
      <p>
        For multi-process deployments sharing a Postgres database. Uses
        <code> LISTEN/NOTIFY</code> — no additional infrastructure needed.
      </p>
      <Code
        lang="bash"
        code={`npm install @notifykitjs/realtime-pg`}
      />
      <Code
        filename="lib/notifykit.ts"
        code={`import { pgRealtimeAdapter } from "@notifykitjs/realtime-pg"
import { Pool } from "pg"

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

// The adapter needs a dedicated connection for LISTEN
const listenClient = await pool.connect()

const realtime = pgRealtimeAdapter({
  connection: {
    listen: (channel, handler) => {
      listenClient.on("notification", (msg) => {
        if (msg.channel === channel) handler(msg.payload!)
      })
      return listenClient.query(\`LISTEN \${channel}\`)
    },
    unlisten: (channel) => listenClient.query(\`UNLISTEN \${channel}\`),
    notify: (channel, payload) =>
      pool.query("SELECT pg_notify($1, $2)", [channel, payload]),
  },
  heartbeatMs: 60_000, // detect dead connections
  onError: (err) => console.error("realtime error:", err),
})

await realtime.start()

const notify = createNotifyKit({
  // ...
  realtime,
})`}
      />
      <div className="callout callout-warn">
        <strong>8KB limit.</strong> PostgreSQL NOTIFY payloads are limited to
        ~8KB. If an event exceeds this (e.g. a large inbox item body), the
        adapter automatically falls back to sending an{" "}
        <code>inbox.refetch</code> event that tells clients to re-fetch.
      </div>

      <h2>WebSocket adapter</h2>
      <p>
        For custom transports or when you need fine-grained control over
        connections:
      </p>
      <Code
        lang="bash"
        code={`npm install @notifykitjs/realtime-ws`}
      />
      <Code
        filename="lib/realtime.ts"
        code={`import { webSocketRealtimeAdapter } from "@notifykitjs/realtime-ws"

const realtime = webSocketRealtimeAdapter({
  authenticate: async (request) => {
    const token = new URL(request.url).searchParams.get("token")
    const session = await verifyToken(token)
    if (!session) return null
    return {
      recipientId: session.userId,
      tenantId: session.orgId,
    }
  },
  allowedOrigins: ["https://app.example.com"],
  heartbeatMs: 30_000,
  maxConnections: 10_000,
})`}
      />

      <h3>Handling connections</h3>
      <Code
        filename="server.ts"
        code={`server.on("upgrade", async (request, ws) => {
  const identity = await realtime.handleUpgrade(request, ws)
  if (!identity) {
    ws.close(4001, "Unauthorized")
    return
  }

  ws.on("message", (data) => realtime.handleMessage(ws, data.toString()))
  ws.on("close", () => realtime.handleClose(ws))
})`}
      />

      <h2>How it works</h2>
      <div className="overview-flow">
        <div className="overview-flow-step">
          <span className="overview-flow-number">1</span>
          <div>
            <strong>Mutation</strong>
            <p>An inbox event occurs (create, read, archive, delete). The engine calls <code>realtime.publish()</code>.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">2</span>
          <div>
            <strong>Adapter</strong>
            <p>The adapter delivers the event to all listeners subscribed to that (recipientId, scope) pair.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">3</span>
          <div>
            <strong>SSE stream</strong>
            <p>The handler&apos;s <code>GET /api/notifykit/inbox/stream</code> route subscribes on behalf of the authenticated user and streams events to the browser.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">4</span>
          <div>
            <strong>React</strong>
            <p><code>useInbox()</code> connects to the SSE endpoint and updates state as events arrive — no polling, no manual refresh.</p>
          </div>
        </div>
      </div>

      <h2>Event types</h2>
      <table>
        <thead>
          <tr>
            <th>Event</th>
            <th>Payload</th>
            <th>React SDK action</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>inbox.created</code></td>
            <td>The new <code>InboxItem</code></td>
            <td>Prepends to <code>items</code>, increments <code>unreadCount</code></td>
          </tr>
          <tr>
            <td><code>inbox.updated</code></td>
            <td>The updated <code>InboxItem</code></td>
            <td>Replaces item in place, recalculates <code>unreadCount</code></td>
          </tr>
          <tr>
            <td><code>inbox.deleted</code></td>
            <td><code>{`{ itemId }`}</code></td>
            <td>Removes from <code>items</code></td>
          </tr>
          <tr>
            <td><code>inbox.all_read</code></td>
            <td><code>{`{ count }`}</code></td>
            <td>Sets all items&apos; <code>readAt</code>, zeros <code>unreadCount</code></td>
          </tr>
          <tr>
            <td><code>inbox.refetch</code></td>
            <td>Empty</td>
            <td>Re-fetches entire inbox from server</td>
          </tr>
        </tbody>
      </table>

      <h2>Scaling path</h2>
      <p>
        Start simple and upgrade as your deployment grows:
      </p>
      <div className="overview-flow">
        <div className="overview-flow-step">
          <span className="overview-flow-number">1</span>
          <div>
            <strong>Single server → In-memory</strong>
            <p>Zero config. Works immediately. Upgrade when you add a second instance.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">2</span>
          <div>
            <strong>Multi-instance → PostgreSQL NOTIFY</strong>
            <p>Events cross process boundaries via your existing Postgres. Upgrade when you hit the 8KB limit or need 10k+ connections.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">3</span>
          <div>
            <strong>High scale → WebSocket</strong>
            <p>Full control over connections, auth, and transport. You manage the WS server.</p>
          </div>
        </div>
      </div>
      <div className="callout callout-tip">
        <strong>Swapping adapters is a one-line change.</strong> The{" "}
        <code>realtime</code> option in <code>createNotifyKit()</code> is the
        only thing that changes — no client code, no schema migrations, no
        redeployment of the React app.
      </div>

      <h2>When to upgrade</h2>
      <p>
        Watch for these signals — they tell you when your current adapter
        has hit its ceiling and what to move to:
      </p>
      <table>
        <thead>
          <tr><th>Signal</th><th>You&apos;re on</th><th>Move to</th><th>Why</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>Second server instance deployed</td>
            <td>In-memory</td>
            <td>PG NOTIFY</td>
            <td>In-memory events are process-local — instance B never sees instance A&apos;s sends</td>
          </tr>
          <tr>
            <td>Inbox items contain large HTML/JSON (&gt;8KB)</td>
            <td>PG NOTIFY</td>
            <td>WebSocket</td>
            <td>Postgres NOTIFY truncates at 8KB; WebSocket has no payload limit</td>
          </tr>
          <tr>
            <td>More than ~5,000 concurrent SSE connections per instance</td>
            <td>PG NOTIFY</td>
            <td>WebSocket</td>
            <td>Each PG listener shares one connection; WS gives per-client control and backpressure</td>
          </tr>
          <tr>
            <td>Need binary frames, compression, or custom protocols</td>
            <td>Any</td>
            <td>WebSocket</td>
            <td>SSE is text-only, one-direction; WS supports binary, bidirectional, and per-message deflate</td>
          </tr>
          <tr>
            <td>Serverless / edge functions (no persistent process)</td>
            <td>Any SSE-based</td>
            <td>Polling fallback</td>
            <td>SSE requires a long-lived process; serverless functions timeout after seconds</td>
          </tr>
        </tbody>
      </table>
      <div className="callout callout-tip">
        <strong>Don&apos;t pre-optimize.</strong> Most apps run fine on PG NOTIFY
        up to thousands of concurrent users. The upgrade path exists for when
        you need it — not before. Measure <code>active connections</code> and{" "}
        <code>event delivery lag</code> before switching adapters.
      </div>

      <h2>Connection lifecycle</h2>
      <p>
        SSE connections are long-lived and will inevitably break — network
        changes, token expiry, server deploys. Understanding the lifecycle
        helps you build reliable UIs:
      </p>
      <div className="overview-flow">
        <div className="overview-flow-step">
          <span className="overview-flow-number">1</span>
          <div>
            <strong>Connect</strong>
            <p>Client opens SSE to <code>/inbox/stream</code>. Server authenticates via <code>identify()</code> and subscribes.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">2</span>
          <div>
            <strong>Stream</strong>
            <p>Events flow. Heartbeats keep the connection alive through proxies and load balancers.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">3</span>
          <div>
            <strong>Disconnect</strong>
            <p>Network drops, deploy restarts server, or token expires. Client detects via <code>onerror</code>.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">4</span>
          <div>
            <strong>Reconnect + re-fetch</strong>
            <p>Client reconnects and fetches full inbox to catch events missed during the gap.</p>
          </div>
        </div>
      </div>
      <table>
        <thead>
          <tr><th>Event</th><th>React SDK behavior</th><th>Custom client action</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Connection opens</strong></td>
            <td><code>realtimeStatus → &quot;connected&quot;</code></td>
            <td>Hide any &quot;reconnecting&quot; UI</td>
          </tr>
          <tr>
            <td><strong>Connection drops</strong></td>
            <td>Auto-reconnects with exponential backoff (1s, 2s, 4s...)</td>
            <td>Show subtle indicator; attempt reconnect after delay</td>
          </tr>
          <tr>
            <td><strong>401 on reconnect</strong></td>
            <td>Stops retrying, sets <code>realtimeStatus → &quot;disconnected&quot;</code></td>
            <td>Token expired — redirect to login or refresh the token</td>
          </tr>
          <tr>
            <td><strong>Reconnect succeeds</strong></td>
            <td>Calls <code>refresh()</code> to re-fetch inbox (fills the gap)</td>
            <td>Fetch <code>/inbox</code> to catch any missed events</td>
          </tr>
          <tr>
            <td><strong>Component unmounts</strong></td>
            <td>Closes the EventSource, cancels reconnect timers</td>
            <td>Call <code>eventSource.close()</code> in cleanup</td>
          </tr>
        </tbody>
      </table>
      <Code
        filename="lib/connect-sse.ts"
        code={`function connectSSE(baseUrl, { onEvent, onStatusChange }) {
  let retryDelay = 1000
  let es = null

  function connect() {
    onStatusChange("connecting")
    es = new EventSource(\`\${baseUrl}/inbox/stream\`, { withCredentials: true })

    es.onopen = () => {
      retryDelay = 1000 // reset backoff
      onStatusChange("connected")
    }

    es.onmessage = (e) => {
      onEvent(JSON.parse(e.data))
    }

    es.onerror = () => {
      es.close()
      onStatusChange("disconnected")
      // Exponential backoff: 1s, 2s, 4s, 8s... max 30s
      setTimeout(connect, retryDelay)
      retryDelay = Math.min(retryDelay * 2, 30_000)
    }
  }

  connect()
  return () => { es?.close() } // cleanup function
}`}
      />
      <div className="callout callout-tip">
        <strong>The React SDK handles all of this.</strong> If you&apos;re
        using <code>useInbox()</code>, reconnection, backoff, gap-filling,
        and cleanup are built in. You only need custom lifecycle management
        when building non-React clients or custom transports.
      </div>

      <h2>Troubleshooting</h2>
      <table>
        <thead>
          <tr><th>Symptom</th><th>Cause</th><th>Fix</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><code>realtimeStatus</code> stuck on <code>&quot;connecting&quot;</code></td>
            <td>SSE endpoint blocked by proxy, CDN, or buffering middleware</td>
            <td>Disable response buffering for <code>/api/notifykit/inbox/stream</code> and confirm your function duration allows a useful connection lifetime.</td>
          </tr>
          <tr>
            <td><code>realtimeStatus</code> is <code>&quot;disconnected&quot;</code></td>
            <td>No <code>realtime</code> adapter configured server-side</td>
            <td>Add <code>realtime: memoryRealtimeAdapter()</code> to your <code>createNotifyKit()</code> config.</td>
          </tr>
          <tr>
            <td>Events arrive on one server but not another</td>
            <td>Using in-memory adapter across multiple instances</td>
            <td>Switch to <code>pgRealtimeAdapter</code> or WebSocket — events must cross process boundaries.</td>
          </tr>
          <tr>
            <td>SSE connects then drops after 30s</td>
            <td>Load balancer idle timeout</td>
            <td>The HTTP stream sends a heartbeat every 30 seconds; configure the load balancer idle timeout above that interval.</td>
          </tr>
          <tr>
            <td>New inbox items don&apos;t appear until refresh</td>
            <td>Send and SSE listener on different NotifyKit instances</td>
            <td>Ensure both share the same adapter instance (same import path for the <code>notify</code> singleton).</td>
          </tr>
        </tbody>
      </table>
      <div className="callout callout-tip">
        <strong>Debug in DevTools.</strong> Open the Network tab, filter by
        &quot;EventStream&quot;, and look for the <code>/inbox/stream</code> request.
        If it&apos;s connected, you&apos;ll see heartbeat pings. Send a test
        notification and verify an <code>inbox.created</code> event appears in
        the stream.
      </div>

      <h2>Performance tuning</h2>
      <p>
        SSE connections are cheap individually but add up at scale. Each open
        connection holds a file descriptor and a small memory allocation on the
        server. Here&apos;s how to plan for growth:
      </p>
      <table>
        <thead>
          <tr><th>Metric</th><th>Baseline</th><th>Warning sign</th><th>Action</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Active connections</strong></td>
            <td>&lt; 80% of your server&apos;s max FDs</td>
            <td>&gt; 90% — new connections will fail</td>
            <td>Scale horizontally + move to pg/WS adapter</td>
          </tr>
          <tr>
            <td><strong>Heartbeat latency</strong></td>
            <td>Measure under normal traffic</td>
            <td>Sustained regression from your baseline</td>
            <td>Reduce work on the main thread, increase instances</td>
          </tr>
          <tr>
            <td><strong>Reconnect rate</strong></td>
            <td>Measure by client, region, and deploy</td>
            <td>Sudden increase or reconnect loops</td>
            <td>Check LB timeouts, deploy stability, heartbeat interval</td>
          </tr>
          <tr>
            <td><strong>Event delivery lag</strong></td>
            <td>Set from your product freshness requirement</td>
            <td>Lag exceeds your own SLO</td>
            <td>Check Postgres NOTIFY backlog or WS broadcast queue</td>
          </tr>
        </tbody>
      </table>
      <Code
        filename="lib/notifykit-client.ts"
        code={`const client = createNotifyKitClient({
  realtime: true,
  onRealtimeError: (error) => {
    metrics.increment("notifykit.realtime.errors")
    reportError(error)
  },
})`}
      />

      <h3>SSE heartbeat behavior</h3>
      <p>
        The HTTP handler emits an SSE comment heartbeat every 30 seconds. That
        interval is fixed; configure proxy idle timeouts above 30 seconds. The
        separate PostgreSQL and WebSocket adapters expose their own{" "}
        <code>heartbeatMs</code> options for transport health checks.
      </p>
      <table>
        <thead>
          <tr><th>Layer</th><th>Setting</th><th>Guidance</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>NotifyKit HTTP SSE</td>
            <td>Fixed at 30s</td>
            <td>Set the proxy idle timeout comfortably above 30 seconds</td>
          </tr>
          <tr>
            <td>PostgreSQL adapter</td>
            <td><code>heartbeatMs</code></td>
            <td>Detects a dead LISTEN connection; default is 60 seconds</td>
          </tr>
          <tr>
            <td>WebSocket adapter</td>
            <td><code>heartbeatMs</code></td>
            <td>Controls ping/pong liveness checks; default is 30 seconds</td>
          </tr>
        </tbody>
      </table>
      <div className="callout callout-warn">
        <strong>Function duration still bounds a stream.</strong> Platforms
        including Vercel support streaming responses, but a connection ends
        when that invocation reaches its configured maximum duration. The
        client reconnects automatically; use polling if frequent reconnects are
        undesirable for your deployment.
      </div>

      <h2>Polling fallback for serverless</h2>
      <p>
        When SSE isn&apos;t available or function duration limits make connections
        too short-lived, use interval-based polling as
        a drop-in replacement. The inbox stays fresh without a persistent connection.
      </p>

      <table>
        <thead>
          <tr><th>Approach</th><th>Freshness</th><th>Best for</th><th>Trade-off</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>SSE (default)</strong></td>
            <td>Event-driven; depends on network and adapter</td>
            <td>Long-running servers and streaming-capable functions</td>
            <td>Connection lifetime is bounded by hosting limits</td>
          </tr>
          <tr>
            <td><strong>Polling (interval)</strong></td>
            <td>Up to N seconds stale</td>
            <td>Short-duration functions and constrained edge runtimes</td>
            <td>More requests, slight delay</td>
          </tr>
          <tr>
            <td><strong>Hybrid</strong></td>
            <td>Event-driven when connected, polled on disconnect</td>
            <td>Apps that deploy across mixed infra</td>
            <td>Extra code, but best of both worlds</td>
          </tr>
        </tbody>
      </table>

      <h3>Basic polling with useInbox</h3>
      <p>
        The React SDK&apos;s <code>useInbox()</code> accepts a{" "}
        <code>pollInterval</code> option. When set, it fetches the inbox on a
        timer instead of relying on SSE — no other code changes needed:
      </p>
      <Code
        filename="components/notification-bell.tsx"
        code={`"use client"
import { useInbox, useUnreadCount } from "@notifykitjs/react"

function NotificationBell() {
  // Poll every 10 seconds instead of SSE
  const { items, markAsRead } = useInbox({ pollInterval: 10_000 })
  const { unreadCount } = useUnreadCount({ pollInterval: 10_000 })

  return (
    <div>
      <button>🔔 {unreadCount > 0 && <span>{unreadCount}</span>}</button>
      <ul>
        {items.map(item => (
          <li key={item.id} onClick={() => markAsRead(item.id)}>
            {item.title}
          </li>
        ))}
      </ul>
    </div>
  )
}`}
      />

      <h3>Adaptive polling: fast after activity, slow when idle</h3>
      <p>
        Fixed polling wastes requests when nothing is happening and feels slow
        during active conversations. Use adaptive polling — poll fast right
        after a new item arrives, then slow down when idle:
      </p>
      <Code
        filename="components/notification-bell.tsx"
        code={`"use client"
import { useInbox, useUnreadCount } from "@notifykitjs/react"
import { useState, useEffect, useCallback } from "react"

function useAdaptivePolling() {
  const [interval, setInterval] = useState(30_000) // start slow (30s)

  const onNewItems = useCallback(() => {
    setInterval(5_000) // speed up on activity (5s)
  }, [])

  // Slow down after 2 minutes of no new items
  useEffect(() => {
    const slowDown = setTimeout(() => setInterval(30_000), 120_000)
    return () => clearTimeout(slowDown)
  }, [interval])

  return { interval, onNewItems }
}

function NotificationBell() {
  const { interval, onNewItems } = useAdaptivePolling()
  const { items } = useInbox({
    pollInterval: interval,
    onNewItems, // called when new items appear
  })
  const { unreadCount } = useUnreadCount({ pollInterval: interval })

  // ...render
}`}
      />

      <h3>Environment-based: SSE in dev, polling in production</h3>
      <p>
        If you develop locally with a persistent server but deploy to serverless,
        switch the strategy based on the environment:
      </p>
      <Code
        filename="lib/realtime-config.ts"
        code={`export const realtimeConfig = {
  usePolling: process.env.NEXT_PUBLIC_USE_POLLING === "true",
  pollInterval: 10_000,
}`}
      />
      <Code
        filename="components/notification-bell.tsx"
        code={`import { realtimeConfig } from "@/lib/realtime-config"

function NotificationBell() {
  const inboxOptions = realtimeConfig.usePolling
    ? { pollInterval: realtimeConfig.pollInterval }
    : {} // use SSE (default)

  const { items } = useInbox(inboxOptions)
  // ...
}`}
      />
      <Code
        filename=".env.production"
        code={`# Set in your Vercel project settings (or hosting platform)
NEXT_PUBLIC_USE_POLLING=true`}
      />

      <table>
        <thead>
          <tr><th>Poll interval</th><th>Requests/user/hour</th><th>Freshness</th><th>Good for</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>5s</strong></td>
            <td>720</td>
            <td>Near real-time</td>
            <td>Chat-like apps, active collaboration — but consider upgrading to SSE</td>
          </tr>
          <tr>
            <td><strong>10s</strong></td>
            <td>360</td>
            <td>Acceptable</td>
            <td>Most apps. Users notice a 10s delay but don&apos;t complain.</td>
          </tr>
          <tr>
            <td><strong>30s</strong></td>
            <td>120</td>
            <td>Noticeable</td>
            <td>Low-traffic apps, dashboards checked periodically</td>
          </tr>
          <tr>
            <td><strong>60s</strong></td>
            <td>60</td>
            <td>Stale</td>
            <td>Background tools, admin panels — users don&apos;t expect instant</td>
          </tr>
        </tbody>
      </table>

      <div className="callout callout-tip">
        <strong>Start at 10 seconds.</strong> It&apos;s a good balance — fresh
        enough that users don&apos;t notice the delay, light enough that you
        won&apos;t overload your API. If you see performance issues, increase
        to 30s. If users complain about delays, decrease to 5s or upgrade your
        hosting to support SSE.
      </div>

      <div className="callout callout-tip">
        <strong>Polling still uses the same API.</strong> The{" "}
        <code>pollInterval</code> option makes <code>useInbox()</code> call
        <code> GET /api/notifykit/inbox</code> on a timer. No server-side changes
        needed — the same handler that serves SSE also handles REST fetches.
        Mutations (<code>markAsRead</code>, <code>archive</code>) work identically
        in both modes.
      </div>

      <h2>Verify your setup</h2>
      <p>
        Run through this checklist after configuring realtime. It takes 30
        seconds and confirms the full path works end-to-end:
      </p>
      <div className="overview-flow">
        <div className="overview-flow-step">
          <span className="overview-flow-number">1</span>
          <div>
            <strong>Connect with curl</strong>
            <p>Open a terminal and hold the connection open. You should see a heartbeat within 30–60 seconds.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">2</span>
          <div>
            <strong>Send a test notification</strong>
            <p>In a second terminal (or your app), call <code>notify.send()</code> targeting your test user.</p>
          </div>
        </div>
        <div className="overview-flow-step">
          <span className="overview-flow-number">3</span>
          <div>
            <strong>Confirm the event arrives</strong>
            <p>The curl terminal should print an <code>inbox.created</code> event with the item payload.</p>
          </div>
        </div>
      </div>
      <Code
        lang="bash"
        code={`# Terminal 1: connect to SSE (grab a session cookie from your browser)
curl -N -H "Cookie: session=..." http://localhost:3000/api/notifykit/inbox/stream

# Expected output (within 30s):
# : heartbeat
#
# After sending a notification:
# event: inbox.created
# data: {"type":"inbox.created","item":{"id":"inb_...","title":"..."}}`}
      />
      <table>
        <thead>
          <tr><th>What you see</th><th>Meaning</th><th>If you don&apos;t see it</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>Connection hangs with no output</td>
            <td>SSE connected but waiting for first event</td>
            <td>Wait up to 30 seconds — a heartbeat comment should arrive</td>
          </tr>
          <tr>
            <td><code>: heartbeat</code> appears</td>
            <td>Connection is alive and the adapter is working</td>
            <td>—</td>
          </tr>
          <tr>
            <td><code>event: inbox.created</code> after send</td>
            <td>Full pipeline works: send → adapter → SSE → client</td>
            <td>Check that send and SSE share the same <code>notify</code> instance</td>
          </tr>
          <tr>
            <td>401 Unauthorized</td>
            <td><code>identify()</code> returned null for this request</td>
            <td>Verify your cookie/token is valid — try <code>GET /inbox</code> first</td>
          </tr>
          <tr>
            <td>Connection closes immediately</td>
            <td>Response buffering or proxy timeout</td>
            <td>Disable buffering for this route (see troubleshooting above)</td>
          </tr>
        </tbody>
      </table>
      <div className="callout callout-tip">
        <strong>This replaces guessing.</strong> If curl shows heartbeats and
        events but your React UI doesn&apos;t update, the issue is client-side
        (provider wiring, component mount). If curl shows nothing, the issue is
        server-side (adapter config, auth, proxy).
      </div>

      <h2>Testing realtime</h2>
      <p>
        Realtime events are easy to verify manually with curl, but you need
        automated assertions to prevent regressions. The memory adapter runs
        in-process — no WebSocket server, no Postgres — so events fire
        synchronously after <code>send()</code> resolves.
      </p>

      <table>
        <thead>
          <tr><th>What to test</th><th>Assertion</th><th>Catches</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>Event fires on send</td>
            <td>Subscriber receives <code>inbox.created</code> with correct item</td>
            <td>Broken adapter wiring, missing <code>realtime</code> config</td>
          </tr>
          <tr>
            <td>Scoped delivery</td>
            <td>Subscriber for org B does <strong>not</strong> receive org A&apos;s event</td>
            <td>Cross-tenant event leaks in pub/sub layer</td>
          </tr>
          <tr>
            <td>Mark-read propagates</td>
            <td>Subscriber receives <code>inbox.updated</code> with <code>readAt</code> set</td>
            <td>Mutation hooks not calling <code>realtime.publish()</code></td>
          </tr>
          <tr>
            <td>Bulk mark-all-read</td>
            <td>Subscriber receives <code>inbox.all_read</code> with correct count</td>
            <td>Bulk operation bypassing realtime publish</td>
          </tr>
          <tr>
            <td>Delete propagates</td>
            <td>Subscriber receives <code>inbox.deleted</code> with item ID</td>
            <td>Delete path missing realtime call</td>
          </tr>
        </tbody>
      </table>

      <h3>Pattern: subscribe before send</h3>
      <Code
        filename="tests/realtime.test.ts"
        code={`import { describe, it, expect, vi } from "vitest"
import { createNotifyKit, memoryAdapter, memoryRealtimeAdapter, fakeEmailProvider } from "@notifykitjs/core"
import { commentMentioned } from "./notifications"

describe("realtime events", () => {
  function setup() {
    const realtime = memoryRealtimeAdapter()
    const notify = createNotifyKit({
      notifications: [commentMentioned] as const,
      database: memoryAdapter(),
      providers: { email: fakeEmailProvider() },
      realtime,
    })
    return { notify, realtime }
  }

  it("fires inbox.created when a notification is sent", async () => {
    const { notify, realtime } = setup()
    const received = vi.fn()

    await notify.upsertRecipient({ id: "alice", email: "a@test.com" })

    // Subscribe BEFORE sending — mimics an open SSE connection
    realtime.subscribe("alice", {}, (event) => received(event))

    await notify.send({
      recipientId: "alice",
      notificationId: "comment_mentioned",
      payload: { actorName: "Rey", postUrl: "/p/1" },
    })

    expect(received).toHaveBeenCalledTimes(1)
    expect(received).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "inbox.created",
        payload: expect.objectContaining({ title: expect.any(String) }),
      })
    )
  })

  it("scopes events by tenant — no cross-org leaks", async () => {
    const { notify, realtime } = setup()
    const orgAEvents = vi.fn()
    const orgBEvents = vi.fn()

    await notify.upsertRecipient({ id: "alice", tenantId: "org_a", email: "a@test.com" })
    await notify.upsertRecipient({ id: "alice", tenantId: "org_b", email: "a@test.com" })

    realtime.subscribe("alice", { tenantId: "org_a" }, orgAEvents)
    realtime.subscribe("alice", { tenantId: "org_b" }, orgBEvents)

    await notify.send({
      recipientId: "alice",
      tenantId: "org_a",
      notificationId: "comment_mentioned",
      payload: { actorName: "Rey", postUrl: "/p/1" },
    })

    expect(orgAEvents).toHaveBeenCalledTimes(1)
    expect(orgBEvents).toHaveBeenCalledTimes(0) // ✓ isolated
  })

  it("fires inbox.updated on mark-read", async () => {
    const { notify, realtime } = setup()
    const received = vi.fn()

    await notify.upsertRecipient({ id: "alice", email: "a@test.com" })
    const result = await notify.send({
      recipientId: "alice",
      notificationId: "comment_mentioned",
      payload: { actorName: "Rey", postUrl: "/p/1" },
    })

    realtime.subscribe("alice", {}, received)
    await notify.inbox.markReadForRecipient(result.inboxItems[0].id, "alice")

    expect(received).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "inbox.updated",
        payload: expect.objectContaining({ readAt: expect.any(Date) }),
      })
    )
  })
})`}
      />

      <h3>Testing reconnection gaps</h3>
      <p>
        The hardest realtime bug to catch: events missed during a disconnect
        window. Verify that a client re-fetching after reconnect sees items
        created during the gap:
      </p>
      <Code
        code={`it("gap-fill: items created while disconnected appear on re-fetch", async () => {
  const { notify } = setup()
  await notify.upsertRecipient({ id: "alice", email: "a@test.com" })

  // Simulate: client was connected, then disconnected
  // (no subscriber active during this send)
  await notify.send({
    recipientId: "alice",
    notificationId: "comment_mentioned",
    payload: { actorName: "Sam", postUrl: "/p/2" },
  })

  // Client reconnects and re-fetches inbox (gap-fill strategy)
  const items = await notify.inbox.list("alice")
  expect(items).toHaveLength(1)
  expect(items[0].title).toContain("Sam")
})`}
      />

      <div className="callout callout-tip">
        <strong>Memory adapter makes tests instant.</strong> No WebSocket
        server to start, no Postgres LISTEN to set up, no timers to
        advance. Events fire synchronously in the same process —
        subscribe, send, assert. Use integration tests against Postgres
        NOTIFY only when you&apos;re specifically testing the adapter swap.
      </div>

      <table>
        <thead>
          <tr><th>Test level</th><th>Adapter</th><th>What it proves</th><th>External dependencies</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Unit</strong></td>
            <td>Memory</td>
            <td>Events fire, scoping works, mutations publish</td>
            <td>None</td>
          </tr>
          <tr>
            <td><strong>Integration</strong></td>
            <td>PG NOTIFY / WebSocket</td>
            <td>Events cross process boundaries, reconnection works</td>
            <td>Postgres or WebSocket server</td>
          </tr>
          <tr>
            <td><strong>E2E</strong></td>
            <td>Full stack (browser + SSE)</td>
            <td>React hook updates, unread badge decrements in real UI</td>
            <td>Browser, application server, and adapter</td>
          </tr>
        </tbody>
      </table>

      <div className="callout callout-warn">
        <strong>Don&apos;t skip the scoping test.</strong> Cross-tenant event
        leaks are silent — the feature &quot;works&quot; in single-tenant
        testing but leaks data in production. Always test with two tenants
        subscribed simultaneously and verify isolation.
      </div>

      <div className="button-row">
        <Link href="/docs/react" className="primary">React hooks &amp; components</Link>
        <Link href="/docs/database">Database adapters</Link>
        <Link href="/docs/security">Security model</Link>
      </div>

      <div className="page-nav">
        <Link href="/docs/react">
          <span className="page-nav-label">Previous</span>
          <span className="page-nav-title">React hooks & components</span>
        </Link>
        <Link href="/docs/production-readiness">
          <span className="page-nav-label">Next</span>
          <span className="page-nav-title">Production readiness</span>
        </Link>
      </div>
    </article>
  );
}

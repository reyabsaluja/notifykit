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
        on your deployment:
      </p>

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
        code={`// In your WebSocket server (e.g. with Bun, Node ws, or Deno):
server.on("upgrade", async (request, ws) => {
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
            <p>The handler&apos;s <code>GET /api/notifykit/events</code> route subscribes on behalf of the authenticated user and streams events to the browser.</p>
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
      <div className="callout">
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
            <p>Client opens SSE to <code>/events</code>. Server authenticates via <code>identify()</code> and subscribes.</p>
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
        code={`// Custom client: robust SSE with reconnection
function connectSSE(baseUrl, { onEvent, onStatusChange }) {
  let retryDelay = 1000
  let es = null

  function connect() {
    onStatusChange("connecting")
    es = new EventSource(\`\${baseUrl}/events\`, { withCredentials: true })

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
            <td>Disable response buffering for <code>/api/notifykit/events</code>. On Vercel, SSE works on Functions (not Edge).</td>
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
            <td>Set <code>heartbeatMs</code> below your LB&apos;s idle timeout (e.g. <code>25_000</code> for a 30s timeout).</td>
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
        &quot;EventStream&quot;, and look for the <code>/events</code> request.
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
          <tr><th>Metric</th><th>Healthy range</th><th>Warning sign</th><th>Action</th></tr>
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
            <td>&lt; 100ms</td>
            <td>&gt; 500ms — event loop is congested</td>
            <td>Reduce work on the main thread, increase instances</td>
          </tr>
          <tr>
            <td><strong>Reconnect rate</strong></td>
            <td>&lt; 5% of connections/min</td>
            <td>&gt; 20% — infra instability</td>
            <td>Check LB timeouts, deploy stability, heartbeat interval</td>
          </tr>
          <tr>
            <td><strong>Event delivery lag</strong></td>
            <td>&lt; 50ms from publish to client</td>
            <td>&gt; 500ms — adapter or network bottleneck</td>
            <td>Check Postgres NOTIFY backlog or WS broadcast queue</td>
          </tr>
        </tbody>
      </table>
      <Code
        code={`// Monitoring connections with hooks
createNotifyKit({
  // ...
  on: {
    "realtime.connected": ({ recipientId }) => {
      metrics.inc("notifykit.sse.connections")
      metrics.gauge("notifykit.sse.active", activeConnections.size)
    },
    "realtime.disconnected": ({ recipientId, reason }) => {
      metrics.dec("notifykit.sse.connections")
      if (reason === "error") metrics.inc("notifykit.sse.errors")
    },
  },
})`}
      />

      <h3>Heartbeat tuning</h3>
      <p>
        The heartbeat keeps connections alive through proxies and load
        balancers. Too infrequent and connections drop; too frequent and
        you waste bandwidth:
      </p>
      <table>
        <thead>
          <tr><th>LB idle timeout</th><th>Set <code>heartbeatMs</code> to</th><th>Why</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>30s (AWS ALB default)</td>
            <td><code>25_000</code></td>
            <td>Heartbeat must arrive before the LB kills the connection</td>
          </tr>
          <tr>
            <td>60s (nginx default)</td>
            <td><code>50_000</code></td>
            <td>Leave a 10s buffer for network jitter</td>
          </tr>
          <tr>
            <td>120s (Cloudflare)</td>
            <td><code>60_000</code></td>
            <td>No need to go faster than 60s even with generous timeouts</td>
          </tr>
          <tr>
            <td>Unknown</td>
            <td><code>25_000</code></td>
            <td>Safe default — works with most infrastructure</td>
          </tr>
        </tbody>
      </table>
      <div className="callout callout-warn">
        <strong>Vercel has a 25s streaming timeout on Hobby.</strong> SSE works
        on Vercel Pro/Enterprise with streaming functions, but Hobby plans will
        terminate the connection after ~25 seconds. For Hobby deployments, fall
        back to polling via <code>refresh()</code> on an interval instead of
        relying on realtime.
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
curl -N -H "Cookie: session=..." http://localhost:3000/api/notifykit/events

# Expected output (within 30s):
# event: heartbeat
# data: {}
#
# After sending a notification:
# event: inbox.created
# data: {"id":"inb_...","title":"...","readAt":null,...}`}
      />
      <table>
        <thead>
          <tr><th>What you see</th><th>Meaning</th><th>If you don&apos;t see it</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>Connection hangs with no output</td>
            <td>SSE connected but waiting for first event</td>
            <td>Wait up to <code>heartbeatMs</code> — a heartbeat should arrive</td>
          </tr>
          <tr>
            <td><code>event: heartbeat</code> appears</td>
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

      <div className="page-nav">
        <Link href="/docs/react">
          <span className="page-nav-label">Previous</span>
          <span className="page-nav-title">React hooks & components</span>
        </Link>
        <Link href="/docs/database">
          <span className="page-nav-label">Next</span>
          <span className="page-nav-title">Database adapters</span>
        </Link>
      </div>
    </article>
  );
}

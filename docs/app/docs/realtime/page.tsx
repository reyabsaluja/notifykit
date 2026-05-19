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
        appear instantly in the client. Three adapters are available: in-memory
        (single process), PostgreSQL NOTIFY (multi-process), and WebSocket
        (custom transport).
      </p>

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
      <ol>
        <li>
          When an inbox mutation occurs (create, read, archive, delete), the
          engine calls <code>realtime.publish(recipientId, scope, event)</code>.
        </li>
        <li>
          The adapter delivers the event to all listeners subscribed to that
          (recipientId, scope) pair.
        </li>
        <li>
          The handler&apos;s SSE route (<code>GET /api/notifykit/events</code>)
          subscribes on behalf of the authenticated user and streams events
          to the browser.
        </li>
        <li>
          The React client (<code>useInbox()</code>) connects to this SSE
          endpoint and updates state as events arrive.
        </li>
      </ol>

      <h2>Event types</h2>
      <table>
        <thead>
          <tr>
            <th>Event</th>
            <th>Payload</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>inbox.created</code></td>
            <td>The new <code>InboxItem</code></td>
          </tr>
          <tr>
            <td><code>inbox.updated</code></td>
            <td>The updated <code>InboxItem</code> (read, archived, etc.)</td>
          </tr>
          <tr>
            <td><code>inbox.deleted</code></td>
            <td><code>{`{ itemId }`}</code></td>
          </tr>
          <tr>
            <td><code>inbox.all_read</code></td>
            <td><code>{`{ count }`}</code></td>
          </tr>
          <tr>
            <td><code>inbox.refetch</code></td>
            <td>Empty — client should re-fetch the full list</td>
          </tr>
        </tbody>
      </table>

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

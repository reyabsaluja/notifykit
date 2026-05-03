import type {
  RealtimeAdapter,
  RealtimeEvent,
  RealtimeListener,
  SecurityScope,
} from "notifykit";
import { normalizeScope } from "notifykit";

export type WebSocketRealtimeAdapterOptions = {
  /**
   * Authenticate the WebSocket upgrade request. Return the recipient ID and
   * scope if valid, or `null` to reject. Receives the raw request or its
   * URL search params — use whichever your auth layer supports.
   */
  authenticate: (
    request: Request,
  ) => Promise<WebSocketIdentity | null> | WebSocketIdentity | null;
  /**
   * Allowed origins for WebSocket upgrade requests. When set, the adapter
   * rejects connections whose `Origin` header does not match any entry.
   * Mitigates cross-site WebSocket hijacking (CSWSH).
   */
  allowedOrigins?: string[];
  /**
   * Interval in milliseconds between server-sent ping frames. Clients that
   * don't respond within one interval are considered dead. Defaults to 30000.
   */
  heartbeatMs?: number;
  /**
   * Maximum number of concurrent WebSocket connections. New connections are
   * rejected when this limit is reached. Defaults to 10000.
   */
  maxConnections?: number;
};

export type WebSocketIdentity = {
  recipientId: string;
  tenantId?: string;
  workspaceId?: string;
};

type WsConnection = {
  recipientId: string;
  scope: SecurityScope;
  send: (data: string) => void;
  close: () => void;
};

function scopeKey(recipientId: string, scope: SecurityScope): string {
  const s = normalizeScope(scope);
  return `${recipientId}:${s.tenantId ?? ""}:${s.workspaceId ?? ""}`;
}

export type WebSocketRealtimeAdapter = RealtimeAdapter & {
  /**
   * Handle a WebSocket upgrade. Call this from your server's upgrade path
   * (e.g., Bun.serve websocket handler, Deno.upgradeWebSocket, etc.).
   * Returns `null` if authentication fails.
   */
  handleUpgrade(
    request: Request,
    ws: WebSocketLike,
  ): Promise<{ recipientId: string; scope: SecurityScope } | null>;
  /**
   * Handle a WebSocket close event. Must be called when the socket closes to
   * clean up subscriptions.
   */
  handleClose(ws: WebSocketLike): void;
  /**
   * Number of active WebSocket connections. Useful for monitoring.
   */
  connectionCount(): number;
};

export type WebSocketLike = {
  send(data: string): void;
  close(): void;
};

export function webSocketRealtimeAdapter(
  options: WebSocketRealtimeAdapterOptions,
): WebSocketRealtimeAdapter {
  const heartbeatMs = options.heartbeatMs ?? 30_000;
  const maxConnections = options.maxConnections ?? 10_000;
  const subs = new Map<string, Set<RealtimeListener>>();
  const connections = new Map<WebSocketLike, WsConnection>();
  const heartbeats = new Map<WebSocketLike, ReturnType<typeof setInterval>>();

  function getOrCreateSubs(key: string): Set<RealtimeListener> {
    let set = subs.get(key);
    if (!set) {
      set = new Set();
      subs.set(key, set);
    }
    return set;
  }

  function publish(
    recipientId: string,
    scope: SecurityScope,
    event: RealtimeEvent,
  ) {
    const k = scopeKey(recipientId, scope);
    const set = subs.get(k);
    if (!set) return;
    for (const fn of set) fn(event);
  }

  function subscribe(
    recipientId: string,
    scope: SecurityScope,
    listener: RealtimeListener,
  ): () => void {
    const k = scopeKey(recipientId, scope);
    const set = getOrCreateSubs(k);
    set.add(listener);
    return () => {
      set.delete(listener);
      if (set.size === 0) subs.delete(k);
    };
  }

  async function handleUpgrade(
    request: Request,
    ws: WebSocketLike,
  ): Promise<{ recipientId: string; scope: SecurityScope } | null> {
    if (connections.size >= maxConnections) return null;
    if (options.allowedOrigins && options.allowedOrigins.length > 0) {
      const origin = request.headers.get("origin");
      if (!origin || !options.allowedOrigins.includes(origin)) return null;
    }
    const identity = await options.authenticate(request);
    if (!identity) return null;

    const scope = normalizeScope(identity);
    const k = scopeKey(identity.recipientId, scope);

    const listener: RealtimeListener = (event) => {
      try {
        ws.send(JSON.stringify(event));
      } catch {
        // socket may have closed
      }
    };

    const set = getOrCreateSubs(k);
    set.add(listener);

    const conn: WsConnection = {
      recipientId: identity.recipientId,
      scope,
      send: (data) => ws.send(data),
      close: () => {
        set.delete(listener);
        if (set.size === 0) subs.delete(k);
      },
    };

    connections.set(ws, conn);

    if (heartbeatMs > 0) {
      const interval = setInterval(() => {
        try {
          ws.send(JSON.stringify({ type: "heartbeat" }));
        } catch {
          handleClose(ws);
        }
      }, heartbeatMs);
      heartbeats.set(ws, interval);
    }

    return { recipientId: identity.recipientId, scope };
  }

  function handleClose(ws: WebSocketLike) {
    const conn = connections.get(ws);
    if (conn) {
      conn.close();
      connections.delete(ws);
    }
    const interval = heartbeats.get(ws);
    if (interval) {
      clearInterval(interval);
      heartbeats.delete(ws);
    }
  }

  return {
    publish,
    subscribe,
    handleUpgrade,
    handleClose,
    connectionCount() {
      return connections.size;
    },
  };
}

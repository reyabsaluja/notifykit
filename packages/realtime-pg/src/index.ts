import type {
  RealtimeAdapter,
  RealtimeEvent,
  RealtimeListener,
  SecurityScope,
} from "@notifykitjs/core";
import { normalizeScope } from "@notifykitjs/core";

const DEFAULT_CHANNEL = "notifykit_realtime";

export type PgNotifyConnection = {
  listen(channel: string, handler: (payload: string) => void): Promise<void> | void;
  unlisten(channel: string): Promise<void> | void;
  notify(channel: string, payload: string): Promise<void> | void;
};

export type PgRealtimeAdapterOptions = {
  connection: PgNotifyConnection;
  channel?: string;
  reconnectMs?: number;
  /** Interval in ms to send a self-notify heartbeat to detect dead connections. 0 disables. Default: 60000. */
  heartbeatMs?: number;
  onError?: (err: unknown) => void;
};

function scopeKey(recipientId: string, scope: SecurityScope): string {
  const s = normalizeScope(scope);
  return JSON.stringify([recipientId, s.tenantId ?? "", s.workspaceId ?? ""]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isRealtimeEvent(value: unknown): value is RealtimeEvent {
  if (!isRecord(value) || typeof value.type !== "string") return false;
  switch (value.type) {
    case "inbox.created":
    case "inbox.updated":
    case "inbox.archived":
    case "inbox.unarchived":
      return isRecord(value.item) && typeof value.item.id === "string";
    case "inbox.deleted":
      return typeof value.itemId === "string";
    case "inbox.all_read":
      return (
        typeof value.count === "number" &&
        Number.isSafeInteger(value.count) &&
        value.count >= 0
      );
    case "inbox.refetch":
      return (
        value.dropped === undefined ||
        (typeof value.dropped === "number" &&
          Number.isSafeInteger(value.dropped) &&
          value.dropped >= 0)
      );
    default:
      return false;
  }
}

export type PgRealtimeAdapter = RealtimeAdapter & {
  start(): Promise<void>;
  stop(): Promise<void>;
};

export function pgRealtimeAdapter(
  options: PgRealtimeAdapterOptions,
): PgRealtimeAdapter {
  const conn = options.connection;
  const pgChannel = options.channel ?? DEFAULT_CHANNEL;
  const reconnectMs = options.reconnectMs ?? 5_000;
  const heartbeatMs = options.heartbeatMs ?? 60_000;
  if (!Number.isFinite(reconnectMs) || reconnectMs <= 0) {
    throw new Error("pgRealtimeAdapter: reconnectMs must be a positive number.");
  }
  if (!Number.isFinite(heartbeatMs) || heartbeatMs < 0) {
    throw new Error("pgRealtimeAdapter: heartbeatMs must be a non-negative number.");
  }
  const subs = new Map<string, Set<RealtimeListener>>();
  let listening = false;
  let stopped = false;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let lastHeartbeatAt = 0;

  const HEARTBEAT_PAYLOAD = JSON.stringify({ key: "__heartbeat__", event: { type: "heartbeat" } });

  function handleNotification(raw: string) {
    if (raw === HEARTBEAT_PAYLOAD) {
      lastHeartbeatAt = Date.now();
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }
    if (!isRecord(parsed)) return;
    if (typeof parsed.key !== "string") return;
    if (!isRealtimeEvent(parsed.event)) return;
    const set = subs.get(parsed.key);
    if (!set) return;
    for (const fn of [...set]) {
      try {
        fn(parsed.event);
      } catch (err) {
        options.onError?.(err);
      }
    }
  }

  function startHeartbeat() {
    stopHeartbeat();
    if (heartbeatMs <= 0) return;
    lastHeartbeatAt = Date.now();
    heartbeatTimer = setInterval(() => {
      if (!listening || stopped) return;
      const elapsed = Date.now() - lastHeartbeatAt;
      if (elapsed > heartbeatMs * 3) {
        listening = false;
        options.onError?.(new Error("PG realtime heartbeat timeout — connection appears dead. Reconnecting."));
        stopHeartbeat();
        scheduleReconnect();
        return;
      }
      void Promise.resolve(conn.notify(pgChannel, HEARTBEAT_PAYLOAD)).catch(() => {
        listening = false;
        options.onError?.(new Error("PG realtime heartbeat notify failed. Reconnecting."));
        stopHeartbeat();
        scheduleReconnect();
      });
    }, heartbeatMs);
  }

  function stopHeartbeat() {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  }

  async function tryListen() {
    try {
      await conn.listen(pgChannel, handleNotification);
      listening = true;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      startHeartbeat();
    } catch (err) {
      listening = false;
      options.onError?.(err);
      scheduleReconnect();
    }
  }

  function scheduleReconnect() {
    if (stopped || reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      if (!stopped) void tryListen();
    }, reconnectMs);
  }

  return {
    async start() {
      stopped = false;
      if (listening) return;
      await tryListen();
    },

    async stop() {
      stopped = true;
      stopHeartbeat();
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      subs.clear();
      if (!listening) return;
      try {
        await conn.unlisten(pgChannel);
      } catch {
        // Connection may already be closed during shutdown
      }
      listening = false;
    },

    publish(recipientId, scope, event) {
      const key = scopeKey(recipientId, scope);
      const payload = JSON.stringify({ key, event });
      if (Buffer.byteLength(payload, "utf8") > 7999) {
        options.onError?.(
          new Error(`PG NOTIFY payload exceeds 8KB limit (event: ${event.type}). Sending inbox.refetch instead.`),
        );
        const trimmed = JSON.stringify({
          key,
          event: { type: "inbox.refetch" },
        });
        void Promise.resolve(conn.notify(pgChannel, trimmed)).catch((err: unknown) => {
          options.onError?.(err);
        });
        return;
      }
      void Promise.resolve(conn.notify(pgChannel, payload)).catch((err: unknown) => {
        options.onError?.(err);
      });
    },

    subscribe(recipientId, scope, listener) {
      const k = scopeKey(recipientId, scope);
      let set = subs.get(k);
      if (!set) {
        set = new Set();
        subs.set(k, set);
      }
      set.add(listener);
      return () => {
        set!.delete(listener);
        if (set!.size === 0) subs.delete(k);
      };
    },
  };
}

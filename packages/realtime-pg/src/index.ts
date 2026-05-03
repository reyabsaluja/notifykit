import type {
  RealtimeAdapter,
  RealtimeEvent,
  RealtimeListener,
  SecurityScope,
} from "notifykit";
import { normalizeScope } from "notifykit";

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
  onError?: (err: unknown) => void;
};

function scopeKey(recipientId: string, scope: SecurityScope): string {
  const s = normalizeScope(scope);
  return `${recipientId}:${s.tenantId ?? ""}:${s.workspaceId ?? ""}`;
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
  const subs = new Map<string, Set<RealtimeListener>>();
  let listening = false;
  let stopped = false;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  function handleNotification(raw: string) {
    let parsed: {
      key: string;
      event: RealtimeEvent;
    };
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }
    const set = subs.get(parsed.key);
    if (!set) return;
    for (const fn of set) fn(parsed.event);
  }

  async function tryListen() {
    try {
      await conn.listen(pgChannel, handleNotification);
      listening = true;
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
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      if (!listening) return;
      await conn.unlisten(pgChannel);
      listening = false;
    },

    publish(recipientId, scope, event) {
      const key = scopeKey(recipientId, scope);
      const payload = JSON.stringify({ key, event });
      if (payload.length > 7999) {
        const trimmed = JSON.stringify({
          key,
          event: { type: "inbox.refetch" },
        });
        void Promise.resolve(conn.notify(pgChannel, trimmed)).catch((err: unknown) => {
          console.error("[notifykit:realtime-pg] publish failed:", err);
        });
        return;
      }
      void Promise.resolve(conn.notify(pgChannel, payload)).catch((err: unknown) => {
        console.error("[notifykit:realtime-pg] publish failed:", err);
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

import type { InboxItem, SecurityScope } from "./types.js";

export type RealtimeEvent =
  | { type: "inbox.created"; item: InboxItem }
  | { type: "inbox.updated"; item: InboxItem }
  | { type: "inbox.deleted"; itemId: string }
  | { type: "inbox.all_read"; count: number };

export type RealtimeListener = (event: RealtimeEvent) => void;

export type RealtimeAdapter = {
  publish(recipientId: string, scope: SecurityScope, event: RealtimeEvent): void;
  subscribe(
    recipientId: string,
    scope: SecurityScope,
    listener: RealtimeListener,
  ): () => void;
};

export function memoryRealtimeAdapter(): RealtimeAdapter {
  const subs = new Map<string, Set<RealtimeListener>>();

  function key(recipientId: string, scope: SecurityScope): string {
    return `${recipientId}:${scope.tenantId ?? ""}:${scope.workspaceId ?? ""}`;
  }

  return {
    publish(recipientId, scope, event) {
      const k = key(recipientId, scope);
      const set = subs.get(k);
      if (!set) return;
      for (const fn of set) fn(event);
    },
    subscribe(recipientId, scope, listener) {
      const k = key(recipientId, scope);
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

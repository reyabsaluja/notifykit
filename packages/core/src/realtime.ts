import type { InboxItem, SecurityScope } from "./types.js";

export type RealtimeEvent =
  | { type: "inbox.created"; item: InboxItem }
  | { type: "inbox.updated"; item: InboxItem }
  | { type: "inbox.archived"; item: InboxItem }
  | { type: "inbox.unarchived"; item: InboxItem }
  | { type: "inbox.deleted"; itemId: string }
  | { type: "inbox.all_read"; count: number }
  | { type: "inbox.refetch"; dropped?: number };

export type RealtimeListener = (event: RealtimeEvent) => void;

export type RealtimeAdapter = {
  publish(recipientId: string, scope: SecurityScope, event: RealtimeEvent): void | Promise<void>;
  subscribe(
    recipientId: string,
    scope: SecurityScope,
    listener: RealtimeListener,
  ): () => void;
};

export function normalizeScope(scope: SecurityScope): SecurityScope {
  const tenantId = scope.tenantId ?? scope.organizationId;
  return {
    ...(tenantId ? { tenantId } : {}),
    ...(scope.workspaceId ? { workspaceId: scope.workspaceId } : {}),
  };
}

function scopeKey(recipientId: string, scope: SecurityScope): string {
  const s = normalizeScope(scope);
  return `${recipientId}\0${s.tenantId ?? ""}\0${s.workspaceId ?? ""}`;
}

export function memoryRealtimeAdapter(): RealtimeAdapter {
  const subs = new Map<string, Set<RealtimeListener>>();

  return {
    publish(recipientId, scope, event) {
      const k = scopeKey(recipientId, scope);
      const set = subs.get(k);
      if (!set) return;
      for (const fn of set) fn(event);
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

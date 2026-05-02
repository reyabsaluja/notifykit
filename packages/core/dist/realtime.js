export function normalizeScope(scope) {
    return {
        ...(scope.tenantId ? { tenantId: scope.tenantId } : {}),
        ...(scope.workspaceId ? { workspaceId: scope.workspaceId } : {}),
    };
}
function scopeKey(recipientId, scope) {
    const s = normalizeScope(scope);
    return `${recipientId}:${s.tenantId ?? ""}:${s.workspaceId ?? ""}`;
}
export function memoryRealtimeAdapter() {
    const subs = new Map();
    return {
        publish(recipientId, scope, event) {
            const k = scopeKey(recipientId, scope);
            const set = subs.get(k);
            if (!set)
                return;
            for (const fn of set)
                fn(event);
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
                set.delete(listener);
                if (set.size === 0)
                    subs.delete(k);
            };
        },
    };
}
//# sourceMappingURL=realtime.js.map
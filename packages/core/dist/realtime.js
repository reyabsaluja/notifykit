export function memoryRealtimeAdapter() {
    const subs = new Map();
    function key(recipientId, scope) {
        return `${recipientId}:${scope.tenantId ?? ""}:${scope.workspaceId ?? ""}`;
    }
    return {
        publish(recipientId, scope, event) {
            const k = key(recipientId, scope);
            const set = subs.get(k);
            if (!set)
                return;
            for (const fn of set)
                fn(event);
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
                set.delete(listener);
                if (set.size === 0)
                    subs.delete(k);
            };
        },
    };
}
//# sourceMappingURL=realtime.js.map
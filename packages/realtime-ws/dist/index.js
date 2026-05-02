import { normalizeScope } from "notifykit";
function scopeKey(recipientId, scope) {
    const s = normalizeScope(scope);
    return `${recipientId}:${s.tenantId ?? ""}:${s.workspaceId ?? ""}`;
}
export function webSocketRealtimeAdapter(options) {
    const heartbeatMs = options.heartbeatMs ?? 30_000;
    const subs = new Map();
    const connections = new Map();
    const heartbeats = new Map();
    function getOrCreateSubs(key) {
        let set = subs.get(key);
        if (!set) {
            set = new Set();
            subs.set(key, set);
        }
        return set;
    }
    function publish(recipientId, scope, event) {
        const k = scopeKey(recipientId, scope);
        const set = subs.get(k);
        if (!set)
            return;
        for (const fn of set)
            fn(event);
    }
    function subscribe(recipientId, scope, listener) {
        const k = scopeKey(recipientId, scope);
        const set = getOrCreateSubs(k);
        set.add(listener);
        return () => {
            set.delete(listener);
            if (set.size === 0)
                subs.delete(k);
        };
    }
    async function handleUpgrade(request, ws) {
        const identity = await options.authenticate(request);
        if (!identity)
            return null;
        const scope = normalizeScope(identity);
        const k = scopeKey(identity.recipientId, scope);
        const listener = (event) => {
            try {
                ws.send(JSON.stringify(event));
            }
            catch {
                // socket may have closed
            }
        };
        const set = getOrCreateSubs(k);
        set.add(listener);
        const conn = {
            recipientId: identity.recipientId,
            scope,
            send: (data) => ws.send(data),
            close: () => {
                set.delete(listener);
                if (set.size === 0)
                    subs.delete(k);
            },
        };
        connections.set(ws, conn);
        if (heartbeatMs > 0) {
            const interval = setInterval(() => {
                try {
                    ws.send(JSON.stringify({ type: "heartbeat" }));
                }
                catch {
                    handleClose(ws);
                }
            }, heartbeatMs);
            heartbeats.set(ws, interval);
        }
        return { recipientId: identity.recipientId, scope };
    }
    function handleClose(ws) {
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
//# sourceMappingURL=index.js.map
import { normalizeScope } from "notifykit";
const DEFAULT_CHANNEL = "notifykit_realtime";
function scopeKey(recipientId, scope) {
    const s = normalizeScope(scope);
    return `${recipientId}:${s.tenantId ?? ""}:${s.workspaceId ?? ""}`;
}
export function pgRealtimeAdapter(options) {
    const conn = options.connection;
    const pgChannel = options.channel ?? DEFAULT_CHANNEL;
    const subs = new Map();
    let listening = false;
    function handleNotification(raw) {
        let parsed;
        try {
            parsed = JSON.parse(raw);
        }
        catch {
            return;
        }
        const set = subs.get(parsed.key);
        if (!set)
            return;
        for (const fn of set)
            fn(parsed.event);
    }
    return {
        async start() {
            if (listening)
                return;
            await conn.listen(pgChannel, handleNotification);
            listening = true;
        },
        async stop() {
            if (!listening)
                return;
            await conn.unlisten(pgChannel);
            listening = false;
        },
        publish(recipientId, scope, event) {
            const key = scopeKey(recipientId, scope);
            const payload = JSON.stringify({ key, event });
            void Promise.resolve(conn.notify(pgChannel, payload));
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
//# sourceMappingURL=index.js.map
export function createNotifyKitClient(options = {}) {
    const baseUrl = (options.baseUrl ?? "/api/notifykit").replace(/\/+$/, "");
    const fetchImpl = options.fetch ?? globalThis.fetch;
    if (!fetchImpl) {
        throw new Error("createNotifyKitClient: no fetch implementation available. Pass `fetch` in options.");
    }
    const credentials = options.credentials ?? "same-origin";
    const extraHeaders = options.headers ?? {};
    let state = {
        inbox: { items: [], status: "idle", error: null },
        preferences: { items: [], status: "idle", error: null },
    };
    const listeners = new Set();
    function setState(next) {
        state = next;
        for (const l of listeners)
            l();
    }
    async function request(method, path, body) {
        const res = await fetchImpl(`${baseUrl}${path}`, {
            method,
            credentials,
            headers: {
                accept: "application/json",
                ...(body !== undefined ? { "content-type": "application/json" } : {}),
                ...extraHeaders,
            },
            body: body !== undefined ? JSON.stringify(body) : undefined,
        });
        const json = (await res.json().catch(() => null));
        if (!res.ok) {
            const message = json?.error ?? `NotifyKit request failed: ${res.status} ${res.statusText}`;
            throw new Error(message);
        }
        return json?.data;
    }
    function reviveInbox(raw) {
        if (!Array.isArray(raw))
            return [];
        return raw.map(reviveInboxItem);
    }
    function reviveInboxItem(raw) {
        const r = raw;
        return {
            id: String(r.id),
            notificationRecordId: String(r.notificationRecordId),
            recipientId: String(r.recipientId),
            notificationId: String(r.notificationId),
            title: String(r.title),
            body: typeof r.body === "string" ? r.body : undefined,
            actionUrl: typeof r.actionUrl === "string" ? r.actionUrl : undefined,
            readAt: typeof r.readAt === "string"
                ? new Date(r.readAt)
                : r.readAt === null
                    ? null
                    : null,
            createdAt: new Date(String(r.createdAt)),
        };
    }
    function revivePreferences(raw) {
        if (!Array.isArray(raw))
            return [];
        return raw.map(revivePreference);
    }
    function revivePreference(raw) {
        const r = raw;
        return {
            recipientId: String(r.recipientId),
            notificationId: String(r.notificationId),
            channels: (r.channels ?? {}),
            updatedAt: new Date(String(r.updatedAt)),
        };
    }
    return {
        getState() {
            return state;
        },
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        inbox: {
            async list() {
                setState({
                    ...state,
                    inbox: { ...state.inbox, status: "loading", error: null },
                });
                try {
                    const items = reviveInbox(await request("GET", "/inbox"));
                    setState({
                        ...state,
                        inbox: { items, status: "ready", error: null },
                    });
                    return items;
                }
                catch (err) {
                    const message = err instanceof Error ? err.message : String(err);
                    setState({
                        ...state,
                        inbox: { ...state.inbox, status: "error", error: message },
                    });
                    throw err;
                }
            },
            async markRead(inboxItemId) {
                // Optimistic: mark locally, then request; revert on failure.
                const prev = state.inbox.items;
                const optimistic = prev.map((it) => it.id === inboxItemId && !it.readAt
                    ? { ...it, readAt: new Date() }
                    : it);
                setState({
                    ...state,
                    inbox: { ...state.inbox, items: optimistic },
                });
                try {
                    const raw = await request("POST", `/inbox/${encodeURIComponent(inboxItemId)}/read`);
                    const updated = raw ? reviveInboxItem(raw) : null;
                    if (updated) {
                        const items = state.inbox.items.map((it) => it.id === updated.id ? updated : it);
                        setState({
                            ...state,
                            inbox: { ...state.inbox, items },
                        });
                    }
                    return updated;
                }
                catch (err) {
                    setState({
                        ...state,
                        inbox: {
                            ...state.inbox,
                            items: prev,
                            error: err instanceof Error ? err.message : String(err),
                        },
                    });
                    throw err;
                }
            },
        },
        preferences: {
            async list() {
                setState({
                    ...state,
                    preferences: { ...state.preferences, status: "loading", error: null },
                });
                try {
                    const items = revivePreferences(await request("GET", "/preferences"));
                    setState({
                        ...state,
                        preferences: { items, status: "ready", error: null },
                    });
                    return items;
                }
                catch (err) {
                    const message = err instanceof Error ? err.message : String(err);
                    setState({
                        ...state,
                        preferences: {
                            ...state.preferences,
                            status: "error",
                            error: message,
                        },
                    });
                    throw err;
                }
            },
            async update(input) {
                const prev = state.preferences.items;
                const existing = prev.find((p) => p.notificationId === input.notificationId);
                const optimistic = {
                    recipientId: existing?.recipientId ?? "",
                    notificationId: input.notificationId,
                    channels: { ...(existing?.channels ?? {}), ...input.channels },
                    updatedAt: new Date(),
                };
                const nextItems = existing
                    ? prev.map((p) => p.notificationId === input.notificationId ? optimistic : p)
                    : [...prev, optimistic];
                setState({
                    ...state,
                    preferences: { ...state.preferences, items: nextItems },
                });
                try {
                    const raw = await request("POST", "/preferences", input);
                    const updated = revivePreference(raw);
                    const items = state.preferences.items.map((p) => p.notificationId === updated.notificationId ? updated : p);
                    setState({
                        ...state,
                        preferences: {
                            ...state.preferences,
                            items,
                            status: "ready",
                            error: null,
                        },
                    });
                    return updated;
                }
                catch (err) {
                    setState({
                        ...state,
                        preferences: {
                            ...state.preferences,
                            items: prev,
                            error: err instanceof Error ? err.message : String(err),
                        },
                    });
                    throw err;
                }
            },
        },
        notifications: {
            async list() {
                const raw = await request("GET", "/notifications");
                if (!Array.isArray(raw))
                    return [];
                return raw;
            },
        },
    };
}
//# sourceMappingURL=client.js.map
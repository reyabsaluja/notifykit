export function createNotifyKitClient(options = {}) {
    const baseUrl = (options.baseUrl ?? "/api/notifykit").replace(/\/+$/, "");
    const fetchImpl = options.fetch ?? globalThis.fetch;
    if (!fetchImpl) {
        throw new Error("createNotifyKitClient: no fetch implementation available. Pass `fetch` in options.");
    }
    const credentials = options.credentials ?? "same-origin";
    const extraHeaders = options.headers ?? {};
    let state = {
        inbox: { items: [], unreadCount: 0, status: "idle", error: null },
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
            tenantId: typeof r.tenantId === "string" ? r.tenantId : undefined,
            workspaceId: typeof r.workspaceId === "string" ? r.workspaceId : undefined,
            notificationId: String(r.notificationId),
            title: String(r.title),
            body: typeof r.body === "string" ? r.body : undefined,
            actionUrl: typeof r.actionUrl === "string" ? r.actionUrl : undefined,
            readAt: typeof r.readAt === "string"
                ? new Date(r.readAt)
                : r.readAt === null
                    ? null
                    : null,
            archivedAt: typeof r.archivedAt === "string"
                ? new Date(r.archivedAt)
                : r.archivedAt === null
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
            tenantId: typeof r.tenantId === "string" ? r.tenantId : undefined,
            workspaceId: typeof r.workspaceId === "string" ? r.workspaceId : undefined,
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
            async list(options) {
                setState({
                    ...state,
                    inbox: { ...state.inbox, status: "loading", error: null },
                });
                try {
                    const qs = options?.archived ? "?archived=true" : "";
                    const items = reviveInbox(await request("GET", `/inbox${qs}`));
                    const unreadCount = options?.archived
                        ? state.inbox.unreadCount
                        : items.filter((it) => !it.readAt).length;
                    setState({
                        ...state,
                        inbox: { items, unreadCount, status: "ready", error: null },
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
                const prev = state.inbox;
                const target = prev.items.find((it) => it.id === inboxItemId);
                const wasUnread = target && !target.readAt && !target.archivedAt;
                const optimistic = prev.items.map((it) => it.id === inboxItemId && !it.readAt
                    ? { ...it, readAt: new Date() }
                    : it);
                setState({
                    ...state,
                    inbox: {
                        ...state.inbox,
                        items: optimistic,
                        unreadCount: wasUnread ? prev.unreadCount - 1 : prev.unreadCount,
                    },
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
                            ...prev,
                            error: err instanceof Error ? err.message : String(err),
                        },
                    });
                    throw err;
                }
            },
            async unreadCount() {
                const raw = (await request("GET", "/inbox/unread-count"));
                const count = raw?.count ?? 0;
                setState({
                    ...state,
                    inbox: { ...state.inbox, unreadCount: count },
                });
                return count;
            },
            async markAllRead() {
                const prev = state.inbox;
                const now = new Date();
                const optimistic = prev.items.map((it) => !it.readAt && !it.archivedAt ? { ...it, readAt: now } : it);
                setState({
                    ...state,
                    inbox: { ...state.inbox, items: optimistic, unreadCount: 0 },
                });
                try {
                    const raw = (await request("POST", "/inbox/mark-all-read"));
                    return raw?.count ?? 0;
                }
                catch (err) {
                    setState({
                        ...state,
                        inbox: {
                            ...prev,
                            error: err instanceof Error ? err.message : String(err),
                        },
                    });
                    throw err;
                }
            },
            async archive(inboxItemId) {
                const prev = state.inbox;
                const target = prev.items.find((it) => it.id === inboxItemId);
                const alreadyArchived = target?.archivedAt != null;
                const shouldDecrementCount = target && !target.readAt && !alreadyArchived;
                const optimistic = alreadyArchived
                    ? prev.items
                    : prev.items.filter((it) => it.id !== inboxItemId);
                setState({
                    ...state,
                    inbox: {
                        ...state.inbox,
                        items: optimistic,
                        unreadCount: shouldDecrementCount
                            ? prev.unreadCount - 1
                            : prev.unreadCount,
                    },
                });
                try {
                    const raw = await request("POST", `/inbox/${encodeURIComponent(inboxItemId)}/archive`);
                    return raw ? reviveInboxItem(raw) : null;
                }
                catch (err) {
                    setState({
                        ...state,
                        inbox: {
                            ...prev,
                            error: err instanceof Error ? err.message : String(err),
                        },
                    });
                    throw err;
                }
            },
            async unarchive(inboxItemId) {
                const prev = state.inbox;
                const target = prev.items.find((it) => it.id === inboxItemId);
                const alreadyUnarchived = target != null && target.archivedAt == null;
                const shouldIncrementCount = target && !target.readAt && !alreadyUnarchived;
                const optimistic = alreadyUnarchived
                    ? prev.items
                    : prev.items.filter((it) => it.id !== inboxItemId);
                setState({
                    ...state,
                    inbox: {
                        ...state.inbox,
                        items: optimistic,
                        unreadCount: shouldIncrementCount
                            ? prev.unreadCount + 1
                            : prev.unreadCount,
                    },
                });
                try {
                    const raw = await request("POST", `/inbox/${encodeURIComponent(inboxItemId)}/unarchive`);
                    return raw ? reviveInboxItem(raw) : null;
                }
                catch (err) {
                    setState({
                        ...state,
                        inbox: {
                            ...prev,
                            error: err instanceof Error ? err.message : String(err),
                        },
                    });
                    throw err;
                }
            },
            async deleteItem(inboxItemId) {
                const prev = state.inbox;
                const target = prev.items.find((it) => it.id === inboxItemId);
                const wasUnread = target && !target.readAt && !target.archivedAt;
                const optimistic = prev.items.filter((it) => it.id !== inboxItemId);
                setState({
                    ...state,
                    inbox: {
                        ...state.inbox,
                        items: optimistic,
                        unreadCount: wasUnread ? prev.unreadCount - 1 : prev.unreadCount,
                    },
                });
                try {
                    await request("DELETE", `/inbox/${encodeURIComponent(inboxItemId)}`);
                }
                catch (err) {
                    setState({
                        ...state,
                        inbox: {
                            ...prev,
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
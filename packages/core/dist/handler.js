import { NotifyKitError, PayloadValidationError } from "./utils.js";
export function createHandler(notify, options) {
    const basePath = normalizeBasePath(options.basePath ?? "/api/notifykit");
    return async function handler(request) {
        const url = new URL(request.url);
        const path = url.pathname;
        if (!path.startsWith(basePath)) {
            return json({ error: "Not found" }, 404);
        }
        const sub = path.slice(basePath.length) || "/";
        const route = matchRoute(request.method, sub);
        if (route.kind === "not_found") {
            return json({ error: "Not found" }, 404);
        }
        // notifications.list is public metadata — no auth required
        if (route.kind === "notifications.list") {
            return json({ data: buildNotificationsIndex(notify) });
        }
        const recipientId = await options.identify(request);
        if (!recipientId) {
            return json({ error: "Unauthenticated" }, 401);
        }
        try {
            switch (route.kind) {
                case "inbox.list": {
                    const items = await notify.inbox.list(recipientId);
                    return json({ data: items });
                }
                case "inbox.markRead": {
                    const item = await notify.inbox.markRead(route.id);
                    if (!item)
                        return json({ error: "Inbox item not found" }, 404);
                    if (item.recipientId !== recipientId) {
                        return json({ error: "Forbidden" }, 403);
                    }
                    return json({ data: item });
                }
                case "preferences.list": {
                    const prefs = await notify.preferences.list(recipientId);
                    return json({ data: prefs });
                }
                case "preferences.update": {
                    const body = await readJson(request);
                    if (!body || typeof body !== "object") {
                        return json({ error: "Invalid JSON body" }, 400);
                    }
                    const { notificationId, channels } = body;
                    if (typeof notificationId !== "string") {
                        return json({ error: "Missing or invalid 'notificationId'" }, 400);
                    }
                    const validChannels = toChannelPreferenceMap(channels);
                    if (!validChannels) {
                        return json({ error: "'channels' must be an object of { channel: boolean }" }, 400);
                    }
                    const updated = await notify.preferences.update({
                        recipientId,
                        notificationId,
                        channels: validChannels,
                    });
                    return json({ data: updated });
                }
            }
        }
        catch (err) {
            if (err instanceof PayloadValidationError) {
                return json({ error: err.message }, 400);
            }
            if (err instanceof NotifyKitError) {
                return json({ error: err.message }, 400);
            }
            const message = err instanceof Error ? err.message : "Internal error";
            return json({ error: message }, 500);
        }
    };
}
function buildNotificationsIndex(notify) {
    return notify.definitions.map((def) => ({
        id: def.id,
        channels: def.channels.map((c) => c.type),
        payload: { ...def.payload },
    }));
}
function matchRoute(method, sub) {
    const trimmed = sub.endsWith("/") && sub.length > 1 ? sub.slice(0, -1) : sub;
    if (trimmed === "/inbox" || trimmed === "/inbox/") {
        if (method === "GET")
            return { kind: "inbox.list" };
        return { kind: "not_found" };
    }
    const markRead = trimmed.match(/^\/inbox\/([^/]+)\/read$/);
    if (markRead && markRead[1]) {
        if (method === "POST") {
            return { kind: "inbox.markRead", id: decodeURIComponent(markRead[1]) };
        }
        return { kind: "not_found" };
    }
    if (trimmed === "/preferences") {
        if (method === "GET")
            return { kind: "preferences.list" };
        if (method === "POST")
            return { kind: "preferences.update" };
        return { kind: "not_found" };
    }
    if (trimmed === "/notifications") {
        if (method === "GET")
            return { kind: "notifications.list" };
        return { kind: "not_found" };
    }
    return { kind: "not_found" };
}
function normalizeBasePath(input) {
    let p = input.startsWith("/") ? input : `/${input}`;
    if (p.length > 1 && p.endsWith("/"))
        p = p.slice(0, -1);
    return p;
}
function toChannelPreferenceMap(input) {
    if (!input || typeof input !== "object" || Array.isArray(input))
        return null;
    const out = {};
    for (const [key, value] of Object.entries(input)) {
        if (typeof value !== "boolean")
            return null;
        if (key !== "inbox" && key !== "email")
            return null;
        out[key] = value;
    }
    return out;
}
async function readJson(request) {
    try {
        return await request.json();
    }
    catch {
        return null;
    }
}
function json(body, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
    });
}
//# sourceMappingURL=handler.js.map
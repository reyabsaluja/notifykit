import { verifyUnsubscribeToken } from "./unsubscribe.js";
import { NotifyKitError, PayloadValidationError } from "./utils.js";
export function createHandler(notify, options) {
    const basePath = normalizeBasePath(options.basePath ?? "/api/notifykit");
    const unsubscribeSecret = options.unsubscribeSecret;
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
        // Unsubscribe routes use HMAC token as auth — bypass identify().
        if (route.kind === "unsubscribe.get" || route.kind === "unsubscribe.post") {
            if (!unsubscribeSecret) {
                return json({ error: "Not found" }, 404);
            }
            const token = await extractUnsubscribeToken(request, url);
            if (!token) {
                return unsubscribeHtml("This unsubscribe link is missing its token.", 400);
            }
            const claims = verifyUnsubscribeToken(token, unsubscribeSecret);
            if (!claims) {
                return unsubscribeHtml("This unsubscribe link is invalid or has been tampered with.", 400);
            }
            try {
                await notify.preferences.update({
                    recipientId: claims.recipientId,
                    notificationId: claims.notificationId,
                    channels: { email: false },
                });
            }
            catch (err) {
                if (err instanceof NotifyKitError) {
                    return unsubscribeHtml("This unsubscribe link refers to a notification or account that no longer exists.", 404);
                }
                throw err;
            }
            if (route.kind === "unsubscribe.post") {
                // RFC 8058 one-click: return 200 with empty body. 204 is fine too
                // but some mail-provider crawlers insist on 2xx text, so 200/"" is
                // the safest choice.
                return new Response("", { status: 200 });
            }
            return unsubscribeHtml(`You've been unsubscribed from "${escapeHtml(claims.notificationId)}" emails.`, 200);
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
                    const result = await notify.inbox.markReadForRecipient(route.id, recipientId);
                    if (result.status === "not_found") {
                        return json({ error: "Inbox item not found" }, 404);
                    }
                    if (result.status === "forbidden") {
                        return json({ error: "Forbidden" }, 403);
                    }
                    return json({ data: result.item });
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
    if (trimmed === "/unsubscribe") {
        if (method === "GET")
            return { kind: "unsubscribe.get" };
        if (method === "POST")
            return { kind: "unsubscribe.post" };
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
        if (key !== "inbox" && key !== "email" && key !== "webhook")
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
async function extractUnsubscribeToken(request, url) {
    const fromQuery = url.searchParams.get("token");
    if (fromQuery)
        return fromQuery;
    if (request.method === "POST") {
        const contentType = request.headers.get("content-type") ?? "";
        if (contentType.includes("application/x-www-form-urlencoded")) {
            try {
                const body = await request.text();
                const params = new URLSearchParams(body);
                const fromForm = params.get("token");
                if (fromForm)
                    return fromForm;
            }
            catch {
                return null;
            }
        }
        else if (contentType.includes("application/json")) {
            try {
                const body = (await request.json());
                if (body && typeof body.token === "string")
                    return body.token;
            }
            catch {
                return null;
            }
        }
        // RFC 8058: List-Unsubscribe-Post header with "List-Unsubscribe=One-Click"
        // uses no body and no query — the signed token lives in the URL the
        // sender built. Callers who omit the token on POST fail here as expected.
    }
    return null;
}
function unsubscribeHtml(message, status) {
    const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Unsubscribe</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
  </head>
  <body style="font-family: system-ui, sans-serif; max-width: 36rem; margin: 4rem auto; padding: 0 1rem; line-height: 1.5;">
    <p>${message}</p>
  </body>
</html>`;
    return new Response(html, {
        status,
        headers: { "content-type": "text/html; charset=utf-8" },
    });
}
function escapeHtml(s) {
    return s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}
//# sourceMappingURL=handler.js.map
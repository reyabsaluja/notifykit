import type {
  ChannelPreferenceMap,
  NotificationDefinition,
  PayloadSchema,
} from "./types.js";
import type { NotifyKit } from "./create-notifykit.js";
import { NotifyKitError, PayloadValidationError } from "./utils.js";

export type HandlerContext = {
  recipientId: string;
  request: Request;
};

export type Identify = (
  request: Request,
) => Promise<string | null> | string | null;

export type CreateHandlerOptions = {
  /**
   * Resolves the recipient for an incoming request. Return `null` to reject as
   * unauthenticated (401). This is the only thing tying handler routes to a
   * specific user — NotifyKit never trusts a client-sent recipientId.
   */
  identify: Identify;
  /**
   * Path prefix for handler routes. Defaults to "/api/notifykit".
   * Everything outside this prefix returns 404.
   */
  basePath?: string;
};

export type Handler = (request: Request) => Promise<Response>;

type Route =
  | { kind: "inbox.list" }
  | { kind: "inbox.markRead"; id: string }
  | { kind: "preferences.list" }
  | { kind: "preferences.update" }
  | { kind: "notifications.list" }
  | { kind: "not_found" };

export function createHandler<
  T extends readonly NotificationDefinition<string, PayloadSchema>[],
>(notify: NotifyKit<T>, options: CreateHandlerOptions): Handler {
  const basePath = normalizeBasePath(options.basePath ?? "/api/notifykit");

  return async function handler(request: Request): Promise<Response> {
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
          if (!item) return json({ error: "Inbox item not found" }, 404);
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
          const { notificationId, channels } = body as {
            notificationId?: unknown;
            channels?: unknown;
          };
          if (typeof notificationId !== "string") {
            return json(
              { error: "Missing or invalid 'notificationId'" },
              400,
            );
          }
          const validChannels = toChannelPreferenceMap(channels);
          if (!validChannels) {
            return json(
              { error: "'channels' must be an object of { channel: boolean }" },
              400,
            );
          }
          const updated = await notify.preferences.update({
            recipientId,
            notificationId,
            channels: validChannels,
          } as Parameters<typeof notify.preferences.update>[0]);
          return json({ data: updated });
        }
      }
    } catch (err) {
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

function buildNotificationsIndex<
  T extends readonly NotificationDefinition<string, PayloadSchema>[],
>(notify: NotifyKit<T>): Array<{
  id: string;
  channels: string[];
  payload: Record<string, string>;
}> {
  return notify.definitions.map((def) => ({
    id: def.id,
    channels: def.channels.map((c) => c.type),
    payload: { ...def.payload },
  }));
}

function matchRoute(method: string, sub: string): Route {
  const trimmed = sub.endsWith("/") && sub.length > 1 ? sub.slice(0, -1) : sub;

  if (trimmed === "/inbox" || trimmed === "/inbox/") {
    if (method === "GET") return { kind: "inbox.list" };
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
    if (method === "GET") return { kind: "preferences.list" };
    if (method === "POST") return { kind: "preferences.update" };
    return { kind: "not_found" };
  }
  if (trimmed === "/notifications") {
    if (method === "GET") return { kind: "notifications.list" };
    return { kind: "not_found" };
  }
  return { kind: "not_found" };
}

function normalizeBasePath(input: string): string {
  let p = input.startsWith("/") ? input : `/${input}`;
  if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
  return p;
}

function toChannelPreferenceMap(input: unknown): ChannelPreferenceMap | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const out: ChannelPreferenceMap = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (typeof value !== "boolean") return null;
    if (key !== "inbox" && key !== "email") return null;
    out[key] = value;
  }
  return out;
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

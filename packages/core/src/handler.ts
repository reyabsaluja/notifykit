import type {
  ChannelPreferenceMap,
  ChannelType,
  NotificationClassification,
  NotificationDefinition,
  PayloadSchema,
  SecurityScope,
} from "./types.js";
import type { NotifyKit } from "./create-notifykit.js";
import type { RealtimeEvent } from "./realtime.js";
import { normalizeScope } from "./realtime.js";
import { verifyUnsubscribeToken } from "./unsubscribe.js";
import { NotifyKitError, PayloadValidationError } from "./utils.js";

export type HandlerPermission = "deliveries.list" | "admin";

export type HandlerIdentity = SecurityScope & {
  recipientId: string;
  permissions?: readonly HandlerPermission[];
};

export type HandlerContext = SecurityScope & {
  recipientId: string;
  identity: HandlerIdentity;
  request: Request;
};

export type Identify = (
  request: Request,
) => Promise<string | HandlerIdentity | null> | string | HandlerIdentity | null;

export type Authorize = (
  context: HandlerContext,
  permission: HandlerPermission,
) => Promise<boolean> | boolean;

/**
 * Verifies an inbound provider webhook request's signature. Return `true` if
 * the request is authentic, `false` to reject with 401. The raw body string
 * is provided so the verifier can re-compute the HMAC. Headers are passed
 * separately because the request body has already been consumed.
 */
export type WebhookVerifier = (
  headers: Headers,
  rawBody: string,
) => Promise<boolean> | boolean;

/**
 * Callback to handle a verified inbound provider webhook payload. Use this
 * to update delivery statuses, trigger follow-up workflows, etc.
 */
export type WebhookEventHandler = (
  provider: string,
  payload: unknown,
) => Promise<void> | void;

export type CreateHandlerOptions = {
  /**
   * Resolves the recipient for an incoming request. Return `null` to reject as
   * unauthenticated (401). This is the only thing tying handler routes to a
   * specific user — NotifyKit never trusts a client-sent recipientId.
   */
  identify: Identify;
  /**
   * Permission hook for admin/support/studio routes. Client-safe routes never
   * call this because they are already bound to `identify()`.
   */
  authorize?: Authorize;
  /**
   * Path prefix for handler routes. Defaults to "/api/notifykit".
   * Everything outside this prefix returns 404.
   */
  basePath?: string;
  /**
   * HMAC secret used to verify signed unsubscribe tokens. Required to expose
   * the `/unsubscribe` route; must match `createNotifyKit({ unsubscribe.secret })`.
   * When omitted, the route returns 404.
   */
  unsubscribeSecret?: string;
  /**
   * When `true`, the `GET /notifications` route requires authentication via
   * `identify()`. Defaults to `false` (public metadata). Set this when
   * notification IDs or categories are considered internal.
   */
  protectNotifications?: boolean;
  /**
   * CORS origin to allow. When set, every response includes
   * `Access-Control-Allow-Origin` and related headers. Accepts a single
   * origin string (e.g. `"https://app.example.com"`) or `"*"`.
   * When omitted, no CORS headers are sent.
   *
   * When the origin is not `"*"`, `Access-Control-Allow-Credentials: true`
   * is included so that cross-origin requests with cookies or custom auth
   * headers work. The preflight reflects the request's
   * `Access-Control-Request-Headers` so that custom headers passed via
   * `createNotifyKitClient({ headers })` are permitted.
   */
  cors?: string;
  /**
   * Per-identity sliding-window rate limit for authenticated handler routes.
   * When set, each `recipientId` is allowed at most `max` requests within
   * `windowMs` milliseconds. Exceeding the limit returns `429 Too Many
   * Requests`. Unauthenticated routes (`/notifications`, `/unsubscribe`)
   * are not rate-limited — apply IP-based throttling at your proxy layer
   * for those.
   *
   * NOTE: This is an in-memory, per-instance limiter. In horizontally-scaled
   * deployments, the effective limit is `max * instanceCount`. Use a shared
   * store (e.g. Redis) at your proxy layer for strict global limits.
   */
  requestRateLimit?: {
    max: number;
    windowMs: number;
  };
  /**
   * When `true`, error responses include a `fix` field with actionable
   * guidance. Disable in production to avoid leaking internal identifiers
   * (recipient IDs, item IDs, permission names) to HTTP clients.
   * Defaults to `false`.
   */
  debug?: boolean;
  /**
   * Inbound provider webhook configuration. Maps provider names to a verifier
   * function. When set, a `POST /webhooks/:provider` route is exposed. The
   * verifier receives the request headers and raw body and must return `true` for
   * authentic requests. Verified payloads are passed to `onWebhookEvent`.
   *
   * ```ts
   * createHandler(notify, {
   *   identify: getIdentity,
   *   webhooks: {
   *     resend: (headers, body) => verifyResendSignature(headers, body, secret),
   *   },
   *   onWebhookEvent: async (provider, payload) => {
   *     // update delivery status, etc.
   *   },
   * })
   * ```
   */
  webhooks?: Record<string, WebhookVerifier>;
  /**
   * Called after an inbound provider webhook is verified. Receives the
   * provider name and the parsed JSON payload. Only invoked when
   * `webhooks` is configured and the verifier returns `true`.
   */
  onWebhookEvent?: WebhookEventHandler;
};

export type Handler = (request: Request) => Promise<Response>;

type Route =
  | { kind: "inbox.list" }
  | { kind: "inbox.stream" }
  | { kind: "inbox.markRead"; id: string }
  | { kind: "inbox.unreadCount" }
  | { kind: "inbox.markAllRead" }
  | { kind: "inbox.archive"; id: string }
  | { kind: "inbox.unarchive"; id: string }
  | { kind: "inbox.delete"; id: string }
  | { kind: "preferences.list" }
  | { kind: "preferences.update" }
  | { kind: "preferences.getGlobal" }
  | { kind: "preferences.updateGlobal" }
  | { kind: "preferences.getCategory" }
  | { kind: "preferences.listCategories" }
  | { kind: "preferences.updateCategory" }
  | { kind: "preferences.explain" }
  | { kind: "explain" }
  | { kind: "deliveries.list" }
  | { kind: "notifications.list" }
  | { kind: "unsubscribe.get" }
  | { kind: "unsubscribe.post" }
  | { kind: "webhooks.post"; provider: string }
  | { kind: "not_found" };

export function createHandler<
  T extends readonly NotificationDefinition<string, PayloadSchema>[],
>(notify: NotifyKit<T>, options: CreateHandlerOptions): Handler {
  const basePath = normalizeBasePath(options.basePath ?? "/api/notifykit");
  const unsubscribeSecret = options.unsubscribeSecret;
  const corsOrigin = options.cors ?? null;
  const requestRateLimit = options.requestRateLimit ?? null;
  const debug = options.debug ?? false;
  const rateLimitBuckets = new Map<string, number[]>();
  let lastSweep = Date.now();
  const SWEEP_INTERVAL = 60_000;
  const MAX_BUCKETS = 10_000;

  function errorJson(body: { error: string; code: string; fix?: string }, status: number): Response {
    const out: { error: string; code: string; fix?: string } = { error: body.error, code: body.code };
    if (debug && body.fix) out.fix = body.fix;
    return json(out, status);
  }

  /** Returns true when the caller should be rejected with 429. */
  function checkRateLimit(recipientId: string): boolean {
    if (!requestRateLimit) return false;
    const now = Date.now();
    const cutoff = now - requestRateLimit.windowMs;

    if (now - lastSweep > SWEEP_INTERVAL || rateLimitBuckets.size >= MAX_BUCKETS) {
      lastSweep = now;
      for (const [key, ts] of rateLimitBuckets) {
        if (ts.length === 0 || ts[ts.length - 1]! < cutoff) {
          rateLimitBuckets.delete(key);
        }
      }
    }

    let timestamps = rateLimitBuckets.get(recipientId);
    if (timestamps) {
      let pruneCount = 0;
      while (pruneCount < timestamps.length && timestamps[pruneCount]! < cutoff) {
        pruneCount++;
      }
      if (pruneCount > 0) {
        timestamps = timestamps.slice(pruneCount);
        if (timestamps.length === 0) {
          rateLimitBuckets.delete(recipientId);
          timestamps = undefined;
        } else {
          rateLimitBuckets.set(recipientId, timestamps);
        }
      }
    }
    if (timestamps && timestamps.length >= requestRateLimit.max) {
      return true;
    }
    if (rateLimitBuckets.size >= MAX_BUCKETS && !rateLimitBuckets.has(recipientId)) {
      let oldestKey: string | null = null;
      let oldestTime = Infinity;
      for (const [key, ts] of rateLimitBuckets) {
        const last = ts.length > 0 ? ts[ts.length - 1]! : 0;
        if (last < oldestTime) {
          oldestTime = last;
          oldestKey = key;
        }
      }
      if (oldestKey) rateLimitBuckets.delete(oldestKey);
    }
    if (!timestamps) {
      timestamps = [];
      rateLimitBuckets.set(recipientId, timestamps);
    }
    timestamps.push(now);
    return false;
  }

  function withCors(response: Response, request?: Request): Response {
    if (!corsOrigin) return response;
    const headers = new Headers(response.headers);
    headers.set("Access-Control-Allow-Origin", corsOrigin);
    headers.set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    const requestedHeaders = request?.headers.get("Access-Control-Request-Headers");
    headers.set(
      "Access-Control-Allow-Headers",
      requestedHeaders || "Content-Type, Authorization",
    );
    headers.set("Access-Control-Max-Age", "86400");
    if (corsOrigin !== "*") {
      headers.set("Access-Control-Allow-Credentials", "true");
      headers.set("Vary", "Origin");
    }
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }

  return async function handler(request: Request): Promise<Response> {
    if (corsOrigin && request.method === "OPTIONS") {
      return withCors(new Response(null, { status: 204 }), request);
    }

    const url = new URL(request.url);
    const path = url.pathname;

    if (!path.startsWith(basePath)) {
      return withCors(json({ error: "Not found" }, 404));
    }
    const sub = path.slice(basePath.length) || "/";

    const route = matchRoute(request.method, sub);
    if (route.kind === "not_found") {
      return withCors(json({ error: "Not found" }, 404));
    }

    if (route.kind === "notifications.list") {
      if (options.protectNotifications) {
        const identity = normalizeIdentity(await options.identify(request));
        if (!identity) {
          return withCors(errorJson({
            error: "Unauthenticated",
            code: "UNAUTHENTICATED",
            fix: "The /notifications route is protected. Ensure the request includes valid authentication.",
          }, 401));
        }
        if (requestRateLimit) {
          if (checkRateLimit(identity.recipientId)) {
            return withCors(errorJson({
              error: "Too many requests",
              code: "RATE_LIMITED",
              fix: `Rate limit exceeded for recipient "${identity.recipientId}".`,
            }, 429));
          }
        }
      }
      return withCors(json({ data: buildNotificationsIndex(notify) }));
    }

    // Unsubscribe routes use HMAC token as auth — bypass identify().
    // The Origin check only fires when the header is present. Requests without
    // Origin (e.g., RFC 8058 one-click from mail clients) are allowed because
    // the HMAC token itself is the primary authentication.
    if (route.kind === "unsubscribe.get" || route.kind === "unsubscribe.post") {
      if (!unsubscribeSecret) {
        return withCors(json({ error: "Not found" }, 404));
      }
      if (route.kind === "unsubscribe.post") {
        const origin = request.headers.get("origin");
        if (origin) {
          const expected = new URL(url.href).origin;
          if (origin !== expected) {
            return withCors(errorJson({
              error: "Forbidden",
              code: "ORIGIN_MISMATCH",
              fix: `Unsubscribe POST origin "${origin}" does not match expected "${expected}". The request must originate from the same host.`,
            }, 403));
          }
        }
      }
      const token = await extractUnsubscribeToken(request, url);
      if (!token) {
        return withCors(unsubscribeHtml(
          "This unsubscribe link is missing its token.",
          400,
        ));
      }
      const claims = verifyUnsubscribeToken(token, unsubscribeSecret);
      if (!claims) {
        return withCors(unsubscribeHtml(
          "This unsubscribe link is invalid or has been tampered with.",
          400,
        ));
      }
      if (route.kind === "unsubscribe.get") {
        return withCors(unsubscribeConfirmHtml(claims.notificationId, token));
      }
      try {
        await notify.preferences.update({
          recipientId: claims.recipientId,
          tenantId: claims.tenantId,
          workspaceId: claims.workspaceId,
          notificationId: claims.notificationId,
          channels: { email: false },
        } as Parameters<typeof notify.preferences.update>[0]);
      } catch (err) {
        if (err instanceof NotifyKitError) {
          return withCors(unsubscribeHtml(
            "This unsubscribe link refers to a notification or account that no longer exists.",
            404,
          ));
        }
        throw err;
      }
      return withCors(unsubscribeHtml(
        `You've been unsubscribed from "${claims.notificationId}" emails.`,
        200,
      ));
    }

    if (route.kind === "webhooks.post") {
      const verifier = options.webhooks?.[route.provider];
      if (!verifier) {
        return withCors(json({ error: "Not found" }, 404));
      }
      const rawBody = await readBody(request);
      if (rawBody === null) {
        return withCors(json({ error: "Payload too large" }, 413));
      }
      let verified: boolean;
      try {
        verified = await verifier(request.headers, rawBody);
      } catch {
        verified = false;
      }
      if (!verified) {
        return withCors(errorJson({
          error: "Unauthorized",
          code: "WEBHOOK_VERIFICATION_FAILED",
          fix: `Webhook signature verification failed for provider "${route.provider}". Ensure the signing secret matches the one configured in your provider dashboard.`,
        }, 401));
      }
      let payload: unknown;
      try {
        payload = JSON.parse(rawBody);
      } catch {
        payload = rawBody;
      }
      if (options.onWebhookEvent) {
        try {
          await options.onWebhookEvent(route.provider, payload);
        } catch {
          return withCors(json({ error: "Internal error" }, 500));
        }
      }
      return withCors(json({ ok: true }));
    }

    const identity = normalizeIdentity(await options.identify(request));
    if (!identity) {
      return withCors(errorJson({
        error: "Unauthenticated",
        code: "UNAUTHENTICATED",
        fix: "The identify() function returned null. Ensure the request includes valid authentication (e.g. session cookie, Bearer token) and that identify() returns a recipientId.",
      }, 401));
    }

    if (requestRateLimit) {
      if (checkRateLimit(identity.recipientId)) {
        return withCors(errorJson({
          error: "Too many requests",
          code: "RATE_LIMITED",
          fix: `Rate limit exceeded for recipient "${identity.recipientId}". Wait before retrying. Limit: ${requestRateLimit.max} requests per ${requestRateLimit.windowMs}ms.`,
        }, 429));
      }
    }

    const context: HandlerContext = {
      recipientId: identity.recipientId,
      tenantId: identity.tenantId,
      workspaceId: identity.workspaceId,
      identity,
      request,
    };

    if (route.kind === "inbox.stream") {
      if (!notify.realtime) {
        return withCors(json({ error: "Realtime not configured" }, 404));
      }
      const scope = normalizeScope(context);
      let cleanup: (() => void) | null = null;
      const stream = new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder();
          let eventId = 0;
          const push = (data: string) => {
            try {
              controller.enqueue(encoder.encode(data));
            } catch {
              // stream closed
            }
          };
          push(": connected\n\n");
          const unsub = notify.realtime!.subscribe(
            context.recipientId,
            scope,
            (event: RealtimeEvent) => {
              eventId++;
              push(`id: ${eventId}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
            },
          );
          const heartbeat = setInterval(() => push(": heartbeat\n\n"), 30_000);
          cleanup = () => {
            unsub();
            clearInterval(heartbeat);
            try { controller.close(); } catch {}
          };
          request.signal.addEventListener("abort", cleanup);
        },
        cancel() {
          cleanup?.();
        },
      });
      const sseHeaders = new Headers({
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
      });
      if (corsOrigin) {
        sseHeaders.set("Access-Control-Allow-Origin", corsOrigin);
        if (corsOrigin !== "*") {
          sseHeaders.set("Access-Control-Allow-Credentials", "true");
          sseHeaders.set("Vary", "Origin");
        }
      }
      return new Response(stream, { status: 200, headers: sseHeaders });
    }

    try {
      switch (route.kind) {
        case "inbox.list": {
          const archivedParam = url.searchParams.get("archived");
          const filter = archivedParam === "true"
            ? { archived: true as const }
            : undefined;
          const limit = parseLimit(url.searchParams.get("limit"));
          const items = await notify.inbox.list(
            context.recipientId,
            context,
            filter,
            limit,
          );
          return withCors(json({ data: items }));
        }
        case "inbox.markRead": {
          const result = await notify.inbox.markReadForRecipient(
            route.id,
            context.recipientId,
            context,
          );
          if (result.status === "not_found") {
            return withCors(errorJson({ error: "Inbox item not found", code: "NOT_FOUND", fix: `No inbox item with id "${route.id}" exists. It may have been deleted.` }, 404));
          }
          if (result.status === "forbidden") {
            return withCors(errorJson({ error: "Forbidden", code: "FORBIDDEN", fix: `Inbox item "${route.id}" does not belong to recipient "${context.recipientId}".` }, 403));
          }
          return withCors(json({ data: result.item }));
        }
        case "inbox.unreadCount": {
          const count = await notify.inbox.unreadCount(
            context.recipientId,
            context,
          );
          return withCors(json({ data: { count } }));
        }
        case "inbox.markAllRead": {
          const count = await notify.inbox.markAllRead(
            context.recipientId,
            context,
          );
          return withCors(json({ data: { count } }));
        }
        case "inbox.archive": {
          const result = await notify.inbox.archiveForRecipient(
            route.id,
            context.recipientId,
            context,
          );
          if (result.status === "not_found") {
            return withCors(errorJson({ error: "Inbox item not found", code: "NOT_FOUND", fix: `No inbox item with id "${route.id}" exists.` }, 404));
          }
          if (result.status === "forbidden") {
            return withCors(errorJson({ error: "Forbidden", code: "FORBIDDEN", fix: `Inbox item "${route.id}" does not belong to recipient "${context.recipientId}".` }, 403));
          }
          return withCors(json({ data: result.item }));
        }
        case "inbox.unarchive": {
          const result = await notify.inbox.unarchiveForRecipient(
            route.id,
            context.recipientId,
            context,
          );
          if (result.status === "not_found") {
            return withCors(errorJson({ error: "Inbox item not found", code: "NOT_FOUND", fix: `No inbox item with id "${route.id}" exists.` }, 404));
          }
          if (result.status === "forbidden") {
            return withCors(errorJson({ error: "Forbidden", code: "FORBIDDEN", fix: `Inbox item "${route.id}" does not belong to recipient "${context.recipientId}".` }, 403));
          }
          return withCors(json({ data: result.item }));
        }
        case "inbox.delete": {
          const result = await notify.inbox.deleteForRecipient(
            route.id,
            context.recipientId,
            context,
          );
          if (result.status === "not_found") {
            return withCors(errorJson({ error: "Inbox item not found", code: "NOT_FOUND", fix: `No inbox item with id "${route.id}" exists.` }, 404));
          }
          if (result.status === "forbidden") {
            return withCors(errorJson({ error: "Forbidden", code: "FORBIDDEN", fix: `Inbox item "${route.id}" does not belong to recipient "${context.recipientId}".` }, 403));
          }
          return withCors(json({ data: { deleted: true } }));
        }
        case "preferences.list": {
          const prefs = await notify.preferences.list(
            context.recipientId,
            context,
          );
          return withCors(json({ data: prefs }));
        }
        case "preferences.update": {
          const body = await readJson(request);
          if (!body || typeof body !== "object") {
            return withCors(json({ error: "Invalid JSON body" }, 400));
          }
          const { notificationId, channels } = body as {
            notificationId?: unknown;
            channels?: unknown;
          };
          if (typeof notificationId !== "string") {
            return withCors(json(
              { error: "Missing or invalid 'notificationId'" },
              400,
            ));
          }
          const validChannels = toChannelPreferenceMap(channels);
          if (!validChannels) {
            return withCors(json(
              { error: "'channels' must be an object of { channel: boolean }" },
              400,
            ));
          }
          const updated = await notify.preferences.update({
            recipientId: context.recipientId,
            tenantId: context.tenantId,
            workspaceId: context.workspaceId,
            notificationId,
            channels: validChannels,
          } as Parameters<typeof notify.preferences.update>[0]);
          return withCors(json({ data: updated }));
        }
        case "preferences.getGlobal": {
          const result = await notify.preferences.getGlobal({
            recipientId: context.recipientId,
            tenantId: context.tenantId,
            workspaceId: context.workspaceId,
          });
          return withCors(json({ data: result }));
        }
        case "preferences.updateGlobal": {
          const body = await readJson(request);
          if (!body || typeof body !== "object") {
            return withCors(json({ error: "Invalid JSON body" }, 400));
          }
          const { channels } = body as { channels?: unknown };
          const validChannels = toChannelPreferenceMap(channels);
          if (!validChannels) {
            return withCors(json(
              { error: "'channels' must be an object of { channel: boolean }" },
              400,
            ));
          }
          const result = await notify.preferences.updateGlobal({
            recipientId: context.recipientId,
            tenantId: context.tenantId,
            workspaceId: context.workspaceId,
            channels: validChannels,
          });
          return withCors(json({ data: result }));
        }
        case "preferences.getCategory": {
          const category = url.searchParams.get("category");
          if (!category) {
            return withCors(json(
              { error: "Missing 'category' query parameter" },
              400,
            ));
          }
          const result = await notify.preferences.getCategory({
            recipientId: context.recipientId,
            tenantId: context.tenantId,
            workspaceId: context.workspaceId,
            category,
          });
          return withCors(json({ data: result }));
        }
        case "preferences.listCategories": {
          const prefs = await notify.preferences.listCategories(
            context.recipientId,
            context,
          );
          return withCors(json({ data: prefs }));
        }
        case "preferences.updateCategory": {
          const body = await readJson(request);
          if (!body || typeof body !== "object") {
            return withCors(json({ error: "Invalid JSON body" }, 400));
          }
          const { category, channels } = body as {
            category?: unknown;
            channels?: unknown;
          };
          if (typeof category !== "string") {
            return withCors(json(
              { error: "Missing or invalid 'category'" },
              400,
            ));
          }
          const validChannels = toChannelPreferenceMap(channels);
          if (!validChannels) {
            return withCors(json(
              { error: "'channels' must be an object of { channel: boolean }" },
              400,
            ));
          }
          const result = await notify.preferences.updateCategory({
            recipientId: context.recipientId,
            tenantId: context.tenantId,
            workspaceId: context.workspaceId,
            category,
            channels: validChannels,
          });
          return withCors(json({ data: result }));
        }
        case "preferences.explain": {
          const notificationId = url.searchParams.get("notificationId");
          if (!notificationId) {
            return withCors(json(
              { error: "Missing 'notificationId' query parameter" },
              400,
            ));
          }
          const explanation = await notify.preferences.explain({
            recipientId: context.recipientId,
            tenantId: context.tenantId,
            workspaceId: context.workspaceId,
            notificationId,
          });
          return withCors(json({ data: explanation }));
        }
        case "explain": {
          const notificationId = url.searchParams.get("notificationId");
          if (!notificationId) {
            return withCors(json(
              { error: "Missing 'notificationId' query parameter" },
              400,
            ));
          }
          const payload: Record<string, unknown> = {};
          for (const [key, value] of url.searchParams.entries()) {
            if (key !== "notificationId") payload[key] = value;
          }
          const result = await notify.explain({
            recipientId: context.recipientId,
            tenantId: context.tenantId,
            workspaceId: context.workspaceId,
            notificationId,
            payload,
          } as Parameters<typeof notify.explain>[0]);
          return withCors(json({ data: result }));
        }
        case "deliveries.list": {
          const allowed = await isAuthorized(
            options,
            context,
            "deliveries.list",
          );
          if (!allowed) {
            return withCors(errorJson({
              error: "Forbidden",
              code: "FORBIDDEN",
              fix: `Recipient "${context.recipientId}" lacks the "deliveries.list" or "admin" permission. Grant it via identify() permissions or the authorize() hook.`,
            }, 403));
          }
          const isAdmin = await isAdminIdentity(options, context);
          const recipientId = isAdmin
            ? (url.searchParams.get("recipientId") ?? undefined)
            : context.recipientId;
          const dlvLimit = parseLimit(url.searchParams.get("limit"));
          const deliveries = await notify.deliveries.list(recipientId, context, dlvLimit);
          return withCors(json({ data: deliveries.map(redactDelivery) }));
        }
      }
    } catch (err) {
      if (err instanceof PayloadValidationError) {
        return withCors(errorJson({
          error: err.message,
          code: err.code,
          fix: err.fix,
        }, 400));
      }
      if (err instanceof NotifyKitError) {
        return withCors(errorJson({
          error: err.message,
          code: err.code,
          fix: err.fix,
        }, 400));
      }
      return withCors(json({ error: "Internal error" }, 500));
    }
  };
}

export type RedactedDeliveryRecord = Omit<
  import("./types.js").DeliveryRecord,
  "body" | "subject" | "to"
>;

function redactDelivery(
  record: import("./types.js").DeliveryRecord,
): RedactedDeliveryRecord {
  const { body: _body, subject: _subject, to: _to, ...safe } = record;
  return safe;
}

function buildNotificationsIndex<
  T extends readonly NotificationDefinition<string, PayloadSchema>[],
>(notify: NotifyKit<T>): Array<{
  id: string;
  channels: string[];
  payload: Record<string, string>;
  description?: string;
  category?: string;
  version?: number;
  required?: boolean;
  defaultChannels?: import("./types.js").ChannelPreferenceMap;
  classification?: NotificationClassification;
}> {
  return notify.definitions.map((def) => {
    const entry: {
      id: string;
      channels: string[];
      payload: Record<string, string>;
      description?: string;
      category?: string;
      version?: number;
      required?: boolean;
      defaultChannels?: import("./types.js").ChannelPreferenceMap;
      classification?: NotificationClassification;
    } = {
      id: def.id,
      channels: def.channels.map((c) => c.type),
      payload: { ...def.payload },
    };
    if (def.description !== undefined) entry.description = def.description;
    if (def.category !== undefined) entry.category = def.category;
    if (def.version !== undefined) entry.version = def.version;
    if (def.required !== undefined) entry.required = def.required;
    if (def.defaultChannels !== undefined) entry.defaultChannels = def.defaultChannels;
    if (def.classification !== undefined) entry.classification = def.classification;
    return entry;
  });
}

function decodeParam(raw: string): string | null {
  const decoded = decodeURIComponent(raw);
  return decoded.length <= MAX_ID_LENGTH ? decoded : null;
}

function matchRoute(method: string, sub: string): Route {
  const trimmed = sub.endsWith("/") && sub.length > 1 ? sub.slice(0, -1) : sub;

  if (trimmed === "/inbox" || trimmed === "/inbox/") {
    if (method === "GET") return { kind: "inbox.list" };
    return { kind: "not_found" };
  }
  if (trimmed === "/inbox/stream") {
    if (method === "GET") return { kind: "inbox.stream" };
    return { kind: "not_found" };
  }
  if (trimmed === "/inbox/unread-count") {
    if (method === "GET") return { kind: "inbox.unreadCount" };
    return { kind: "not_found" };
  }
  if (trimmed === "/inbox/mark-all-read") {
    if (method === "POST") return { kind: "inbox.markAllRead" };
    return { kind: "not_found" };
  }
  const markRead = trimmed.match(/^\/inbox\/([^/]+)\/read$/);
  if (markRead && markRead[1]) {
    if (method === "POST") {
      const id = decodeParam(markRead[1]);
      return id ? { kind: "inbox.markRead", id } : { kind: "not_found" };
    }
    return { kind: "not_found" };
  }
  const archive = trimmed.match(/^\/inbox\/([^/]+)\/archive$/);
  if (archive && archive[1]) {
    if (method === "POST") {
      const id = decodeParam(archive[1]);
      return id ? { kind: "inbox.archive", id } : { kind: "not_found" };
    }
    return { kind: "not_found" };
  }
  const unarchive = trimmed.match(/^\/inbox\/([^/]+)\/unarchive$/);
  if (unarchive && unarchive[1]) {
    if (method === "POST") {
      const id = decodeParam(unarchive[1]);
      return id ? { kind: "inbox.unarchive", id } : { kind: "not_found" };
    }
    return { kind: "not_found" };
  }
  const deleteItem = trimmed.match(/^\/inbox\/([^/]+)$/);
  if (deleteItem && deleteItem[1]) {
    if (method === "DELETE") {
      const id = decodeParam(deleteItem[1]);
      return id ? { kind: "inbox.delete", id } : { kind: "not_found" };
    }
    return { kind: "not_found" };
  }
  if (trimmed === "/explain") {
    if (method === "GET") return { kind: "explain" };
    return { kind: "not_found" };
  }
  if (trimmed === "/preferences/explain") {
    if (method === "GET") return { kind: "preferences.explain" };
    return { kind: "not_found" };
  }
  if (trimmed === "/preferences/global") {
    if (method === "GET") return { kind: "preferences.getGlobal" };
    if (method === "POST") return { kind: "preferences.updateGlobal" };
    return { kind: "not_found" };
  }
  if (trimmed === "/preferences/categories") {
    if (method === "GET") return { kind: "preferences.listCategories" };
    return { kind: "not_found" };
  }
  if (trimmed === "/preferences/category") {
    if (method === "GET") return { kind: "preferences.getCategory" };
    if (method === "POST") return { kind: "preferences.updateCategory" };
    return { kind: "not_found" };
  }
  if (trimmed === "/preferences") {
    if (method === "GET") return { kind: "preferences.list" };
    if (method === "POST") return { kind: "preferences.update" };
    return { kind: "not_found" };
  }
  if (trimmed === "/deliveries") {
    if (method === "GET") return { kind: "deliveries.list" };
    return { kind: "not_found" };
  }
  if (trimmed === "/notifications") {
    if (method === "GET") return { kind: "notifications.list" };
    return { kind: "not_found" };
  }
  if (trimmed === "/unsubscribe") {
    if (method === "GET") return { kind: "unsubscribe.get" };
    if (method === "POST") return { kind: "unsubscribe.post" };
    return { kind: "not_found" };
  }
  const webhookMatch = trimmed.match(/^\/webhooks\/([^/]+)$/);
  if (webhookMatch && webhookMatch[1]) {
    if (method === "POST") {
      const provider = decodeParam(webhookMatch[1]);
      if (!provider) return { kind: "not_found" };
      return { kind: "webhooks.post", provider };
    }
    return { kind: "not_found" };
  }
  return { kind: "not_found" };
}

const MAX_ID_LENGTH = 512;

function normalizeIdentity(
  value: Awaited<ReturnType<Identify>>,
): HandlerIdentity | null {
  if (!value) return null;
  if (typeof value === "string") {
    if (!value || value.length > MAX_ID_LENGTH) return null;
    return { recipientId: value };
  }
  if (!value.recipientId || value.recipientId.length > MAX_ID_LENGTH) return null;
  const tenantId = value.tenantId ?? value.organizationId;
  if (tenantId && tenantId.length > MAX_ID_LENGTH) return null;
  if (value.workspaceId && value.workspaceId.length > MAX_ID_LENGTH) return null;
  if (value.organizationId && !value.tenantId) {
    return { ...value, tenantId, organizationId: undefined };
  }
  return value;
}

async function isAuthorized(
  options: CreateHandlerOptions,
  context: HandlerContext,
  permission: HandlerPermission,
): Promise<boolean> {
  if (options.authorize) {
    return await options.authorize(context, permission);
  }
  const permissions = context.identity.permissions ?? [];
  return permissions.includes("admin") || permissions.includes(permission);
}

async function isAdminIdentity(
  options: CreateHandlerOptions,
  context: HandlerContext,
): Promise<boolean> {
  if (options.authorize) {
    return await options.authorize(context, "admin");
  }
  const permissions = context.identity.permissions ?? [];
  return permissions.includes("admin");
}

function parseLimit(value: string | null): number | undefined {
  if (!value) return undefined;
  const n = parseInt(value, 10);
  if (!Number.isFinite(n) || n < 1) return undefined;
  return Math.min(n, 200);
}

function normalizeBasePath(input: string): string {
  let p = input.startsWith("/") ? input : `/${input}`;
  if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
  return p;
}

const VALID_CHANNEL_TYPES = new Set<string>(["inbox", "email", "webhook", "sms"]);

function toChannelPreferenceMap(input: unknown): ChannelPreferenceMap | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const out: ChannelPreferenceMap = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (typeof value !== "boolean") return null;
    if (!VALID_CHANNEL_TYPES.has(key)) return null;
    out[key as ChannelType] = value;
  }
  return out;
}

const MAX_BODY_BYTES = 1_048_576; // 1 MB

async function readBody(request: Request): Promise<string | null> {
  const contentLength = request.headers.get("content-length");
  if (contentLength && parseInt(contentLength, 10) > MAX_BODY_BYTES) {
    return null;
  }
  try {
    const reader = request.body?.getReader();
    if (!reader) return null;
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BODY_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
    const merged = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return new TextDecoder().decode(merged);
  } catch {
    return null;
  }
}

async function readJson(request: Request): Promise<unknown> {
  const text = await readBody(request);
  if (text === null) return null;
  try {
    return JSON.parse(text);
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

async function extractUnsubscribeToken(
  request: Request,
  url: URL,
): Promise<string | null> {
  const fromQuery = url.searchParams.get("token");
  if (fromQuery) return fromQuery;
  if (request.method === "POST") {
    const contentType = request.headers.get("content-type") ?? "";
    const raw = await readBody(request);
    if (raw === null) return null;
    if (contentType.includes("application/x-www-form-urlencoded")) {
      const params = new URLSearchParams(raw);
      const fromForm = params.get("token");
      if (fromForm) return fromForm;
    } else if (contentType.includes("application/json")) {
      try {
        const body = JSON.parse(raw) as { token?: unknown } | null;
        if (body && typeof body.token === "string") return body.token;
      } catch {
        return null;
      }
    }
    // RFC 8058: List-Unsubscribe-Post header with "List-Unsubscribe=One-Click"
    // uses no body and no query — the signed token lives in the URL the
    // sender built. Callers who omit the token on POST fail here as expected.
  }
  return null;
}

function unsubscribeConfirmHtml(notificationId: string, token: string): Response {
  const safeId = escapeHtml(notificationId);
  const safeToken = escapeHtml(token);
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Unsubscribe</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
  </head>
  <body style="font-family: system-ui, sans-serif; max-width: 36rem; margin: 4rem auto; padding: 0 1rem; line-height: 1.5;">
    <p>Unsubscribe from &ldquo;${safeId}&rdquo; emails?</p>
    <form method="POST">
      <input type="hidden" name="token" value="${safeToken}" />
      <button type="submit">Confirm unsubscribe</button>
    </form>
  </body>
</html>`;
  return new Response(html, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function unsubscribeHtml(message: string, status: number): Response {
  const safe = escapeHtml(message);
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Unsubscribe</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
  </head>
  <body style="font-family: system-ui, sans-serif; max-width: 36rem; margin: 4rem auto; padding: 0 1rem; line-height: 1.5;">
    <p>${safe}</p>
  </body>
</html>`;
  return new Response(html, {
    status,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

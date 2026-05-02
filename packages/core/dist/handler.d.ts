import type { NotificationDefinition, PayloadSchema, SecurityScope } from "./types.js";
import type { NotifyKit } from "./create-notifykit.js";
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
export type Identify = (request: Request) => Promise<string | HandlerIdentity | null> | string | HandlerIdentity | null;
export type Authorize = (context: HandlerContext, permission: HandlerPermission) => Promise<boolean> | boolean;
/**
 * Verifies an inbound provider webhook request's signature. Return `true` if
 * the request is authentic, `false` to reject with 401. The raw body string
 * is provided so the verifier can re-compute the HMAC. Headers are passed
 * separately because the request body has already been consumed.
 */
export type WebhookVerifier = (headers: Headers, rawBody: string) => Promise<boolean> | boolean;
/**
 * Callback to handle a verified inbound provider webhook payload. Use this
 * to update delivery statuses, trigger follow-up workflows, etc.
 */
export type WebhookEventHandler = (provider: string, payload: unknown) => Promise<void> | void;
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
     */
    requestRateLimit?: {
        max: number;
        windowMs: number;
    };
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
export declare function createHandler<T extends readonly NotificationDefinition<string, PayloadSchema>[]>(notify: NotifyKit<T>, options: CreateHandlerOptions): Handler;
export type RedactedDeliveryRecord = Omit<import("./types.js").DeliveryRecord, "body" | "subject" | "to">;
//# sourceMappingURL=handler.d.ts.map
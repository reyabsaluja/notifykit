import type { NotificationDefinition, PayloadSchema, SecurityScope } from "./types.js";
import type { NotifyKit } from "./create-notifykit.js";
export type HandlerPermission = "deliveries.list";
export type HandlerIdentity = SecurityScope & {
    recipientId: string;
    permissions?: readonly (HandlerPermission | "admin")[];
};
export type HandlerContext = SecurityScope & {
    recipientId: string;
    identity: HandlerIdentity;
    request: Request;
};
export type Identify = (request: Request) => Promise<string | HandlerIdentity | null> | string | HandlerIdentity | null;
export type Authorize = (context: HandlerContext, permission: HandlerPermission) => Promise<boolean> | boolean;
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
};
export type Handler = (request: Request) => Promise<Response>;
export declare function createHandler<T extends readonly NotificationDefinition<string, PayloadSchema>[]>(notify: NotifyKit<T>, options: CreateHandlerOptions): Handler;
//# sourceMappingURL=handler.d.ts.map
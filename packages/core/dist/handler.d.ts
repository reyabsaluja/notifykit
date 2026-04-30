import type { NotificationDefinition, PayloadSchema } from "./types.js";
import type { NotifyKit } from "./create-notifykit.js";
export type HandlerContext = {
    recipientId: string;
    request: Request;
};
export type Identify = (request: Request) => Promise<string | null> | string | null;
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
export declare function createHandler<T extends readonly NotificationDefinition<string, PayloadSchema>[]>(notify: NotifyKit<T>, options: CreateHandlerOptions): Handler;
//# sourceMappingURL=handler.d.ts.map
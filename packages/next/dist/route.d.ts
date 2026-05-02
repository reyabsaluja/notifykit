import type { CreateHandlerOptions, NotificationDefinition, PayloadSchema } from "notifykit";
import type { NotifyKit } from "notifykit";
export type RouteHandlerOptions<T extends readonly NotificationDefinition<string, PayloadSchema>[]> = {
    notifykit: NotifyKit<T>;
} & CreateHandlerOptions;
export type RouteHandlers = {
    GET: (request: Request) => Promise<Response>;
    POST: (request: Request) => Promise<Response>;
    DELETE: (request: Request) => Promise<Response>;
    OPTIONS: (request: Request) => Promise<Response>;
};
export declare function createRouteHandler<T extends readonly NotificationDefinition<string, PayloadSchema>[]>(options: RouteHandlerOptions<T>): RouteHandlers;
//# sourceMappingURL=route.d.ts.map
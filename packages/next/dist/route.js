import { createHandler } from "notifykit";
export function createRouteHandler(options) {
    const { notifykit, ...handlerOptions } = options;
    const handler = createHandler(notifykit, handlerOptions);
    return {
        GET: handler,
        POST: handler,
        DELETE: handler,
        OPTIONS: handler,
    };
}
//# sourceMappingURL=route.js.map
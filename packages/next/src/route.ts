import type {
  CreateHandlerOptions,
  Handler,
  NotificationDefinition,
  PayloadSchema,
} from "notifykit";
import { createHandler } from "notifykit";
import type { NotifyKit } from "notifykit";

export type RouteHandlerOptions<
  T extends readonly NotificationDefinition<string, PayloadSchema>[],
> = {
  notifykit: NotifyKit<T>;
} & CreateHandlerOptions;

export type RouteHandlers = {
  GET: (request: Request) => Promise<Response>;
  POST: (request: Request) => Promise<Response>;
  DELETE: (request: Request) => Promise<Response>;
  OPTIONS: (request: Request) => Promise<Response>;
};

export function createRouteHandler<
  T extends readonly NotificationDefinition<string, PayloadSchema>[],
>(options: RouteHandlerOptions<T>): RouteHandlers {
  const { notifykit, ...handlerOptions } = options;
  const handler: Handler = createHandler(notifykit, handlerOptions);

  return {
    GET: handler,
    POST: handler,
    DELETE: handler,
    OPTIONS: handler,
  };
}

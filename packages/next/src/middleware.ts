import type { NextRequest } from "next/server.js";
import { NextResponse } from "next/server.js";

export type NotifyKitMiddlewareOptions = {
  basePath?: string;
  cors?: {
    origin: string | string[];
    credentials?: boolean;
  };
};

export function createNotifyKitMiddleware(
  options: NotifyKitMiddlewareOptions = {},
) {
  const basePath = normalizeBasePath(options.basePath ?? "/api/notifykit");

  return function notifyKitMiddleware(request: NextRequest): NextResponse | null {
    const { pathname } = request.nextUrl;
    if (
      basePath !== "/" &&
      pathname !== basePath &&
      !pathname.startsWith(basePath + "/")
    ) {
      return null;
    }

    if (!options.cors) return null;

    const origin = request.headers.get("origin") ?? "";
    const { cors } = options;
    const allowedOrigins = Array.isArray(cors.origin)
      ? cors.origin
      : [cors.origin];
    const isAllowed =
      allowedOrigins.includes("*") || allowedOrigins.includes(origin);

    if (request.method === "OPTIONS") {
      const response = new NextResponse(null, { status: 204 });
      if (isAllowed) {
        response.headers.set(
          "Access-Control-Allow-Origin",
          allowedOrigins.includes("*") ? "*" : origin,
        );
        response.headers.set(
          "Access-Control-Allow-Methods",
          "GET, POST, DELETE, OPTIONS",
        );
        response.headers.set(
          "Access-Control-Allow-Headers",
          "Content-Type, Authorization, X-NotifyKit-Token",
        );
        response.headers.set("Access-Control-Max-Age", "86400");
        if (!allowedOrigins.includes("*")) {
          response.headers.set("Vary", "Origin");
        }
        if (cors.credentials !== false && !allowedOrigins.includes("*")) {
          response.headers.set("Access-Control-Allow-Credentials", "true");
        }
      }
      return response;
    }

    if (!isAllowed) return null;

    const response = NextResponse.next();
    response.headers.set(
      "Access-Control-Allow-Origin",
      allowedOrigins.includes("*") ? "*" : origin,
    );
    if (!allowedOrigins.includes("*")) {
      response.headers.set("Vary", "Origin");
    }
    if (cors.credentials !== false && !allowedOrigins.includes("*")) {
      response.headers.set("Access-Control-Allow-Credentials", "true");
    }
    return response;
  };
}

export function withNotifyKitHeaders(basePath = "/api/notifykit") {
  const normalizedBasePath = normalizeBasePath(basePath);
  return {
    source: normalizedBasePath === "/" ? "/:path*" : `${normalizedBasePath}/:path*`,
    headers: [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Cache-Control", value: "no-store" },
    ],
  };
}

function normalizeBasePath(input: string): string {
  let path = input.startsWith("/") ? input : `/${input}`;
  if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
  return path;
}

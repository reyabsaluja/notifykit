import { describe, expect, test } from "bun:test";
import {
  createNotifyKitMiddleware,
  withNotifyKitHeaders,
} from "../src/middleware.js";

function mockNextRequest(
  url: string,
  method = "GET",
  headers?: Record<string, string>,
) {
  const parsed = new URL(url);
  return {
    nextUrl: parsed,
    method,
    headers: new Headers(headers),
  } as unknown as import("next/server.js").NextRequest;
}

describe("createNotifyKitMiddleware", () => {
  test("returns null for non-matching paths", () => {
    const middleware = createNotifyKitMiddleware();
    const request = mockNextRequest("http://localhost/other/path");
    const result = middleware(request);
    expect(result).toBeNull();
  });

  test("does not match sibling routes that share a prefix", () => {
    const middleware = createNotifyKitMiddleware({
      cors: { origin: "*" },
    });

    const admin = mockNextRequest(
      "http://localhost/api/notifykit-admin/users",
      "GET",
      { origin: "http://app.com" },
    );
    const suffixed = mockNextRequest(
      "http://localhost/api/notifykitfoo",
      "GET",
      { origin: "http://app.com" },
    );
    const exact = mockNextRequest(
      "http://localhost/api/notifykit",
      "GET",
      { origin: "http://app.com" },
    );

    expect(middleware(admin)).toBeNull();
    expect(middleware(suffixed)).toBeNull();
    expect(middleware(exact)).not.toBeNull();
  });

  test("returns null for matching path without cors config", () => {
    const middleware = createNotifyKitMiddleware();
    const request = mockNextRequest("http://localhost/api/notifykit/inbox");
    const result = middleware(request);
    expect(result).toBeNull();
  });

  test("handles custom basePath", () => {
    const middleware = createNotifyKitMiddleware({
      basePath: "/custom/api",
    });

    const match = mockNextRequest("http://localhost/custom/api/inbox");
    const noMatch = mockNextRequest("http://localhost/api/notifykit/inbox");

    expect(middleware(match)).toBeNull();
    expect(middleware(noMatch)).toBeNull();
  });

  test("handles OPTIONS preflight with cors", () => {
    const middleware = createNotifyKitMiddleware({
      cors: { origin: "http://app.example.com" },
    });

    const request = mockNextRequest(
      "http://localhost/api/notifykit/inbox",
      "OPTIONS",
      { origin: "http://app.example.com" },
    );

    const result = middleware(request);
    expect(result).not.toBeNull();
    expect(result!.status).toBe(204);
    expect(result!.headers.get("Access-Control-Allow-Origin")).toBe(
      "http://app.example.com",
    );
    expect(result!.headers.get("Access-Control-Allow-Credentials")).toBe("true");
  });

  test("reflects requested headers on CORS preflight", () => {
    const middleware = createNotifyKitMiddleware({
      cors: { origin: "http://app.example.com" },
    });

    const request = mockNextRequest(
      "http://localhost/api/notifykit/inbox",
      "OPTIONS",
      {
        origin: "http://app.example.com",
        "access-control-request-headers": "x-session-id, x-tenant-id",
      },
    );

    const result = middleware(request);
    expect(result).not.toBeNull();
    expect(result!.headers.get("Access-Control-Allow-Headers")).toBe(
      "x-session-id, x-tenant-id",
    );
  });

  test("rejects disallowed origins on preflight", () => {
    const middleware = createNotifyKitMiddleware({
      cors: { origin: "http://app.example.com" },
    });

    const request = mockNextRequest(
      "http://localhost/api/notifykit/inbox",
      "OPTIONS",
      { origin: "http://evil.com" },
    );

    const result = middleware(request);
    expect(result).not.toBeNull();
    expect(result!.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  test("wildcard origin on preflight", () => {
    const middleware = createNotifyKitMiddleware({
      cors: { origin: "*" },
    });

    const request = mockNextRequest(
      "http://localhost/api/notifykit/inbox",
      "OPTIONS",
      { origin: "http://anything.com" },
    );

    const result = middleware(request);
    expect(result).not.toBeNull();
    expect(result!.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(result!.headers.get("Access-Control-Allow-Credentials")).toBeNull();
  });

  test("array of allowed origins", () => {
    const middleware = createNotifyKitMiddleware({
      cors: { origin: ["http://a.com", "http://b.com"] },
    });

    const reqA = mockNextRequest(
      "http://localhost/api/notifykit/inbox",
      "OPTIONS",
      { origin: "http://a.com" },
    );
    const reqB = mockNextRequest(
      "http://localhost/api/notifykit/inbox",
      "OPTIONS",
      { origin: "http://b.com" },
    );
    const reqC = mockNextRequest(
      "http://localhost/api/notifykit/inbox",
      "OPTIONS",
      { origin: "http://c.com" },
    );

    expect(middleware(reqA)!.headers.get("Access-Control-Allow-Origin")).toBe(
      "http://a.com",
    );
    expect(middleware(reqB)!.headers.get("Access-Control-Allow-Origin")).toBe(
      "http://b.com",
    );
    expect(middleware(reqC)!.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });
});

describe("withNotifyKitHeaders", () => {
  test("returns security headers config with default basePath", () => {
    const config = withNotifyKitHeaders();
    expect(config.source).toBe("/api/notifykit/:path*");
    expect(config.headers).toHaveLength(3);

    const names = config.headers.map((h) => h.key);
    expect(names).toContain("X-Content-Type-Options");
    expect(names).toContain("X-Frame-Options");
    expect(names).toContain("Cache-Control");
  });

  test("respects custom basePath", () => {
    const config = withNotifyKitHeaders("/custom");
    expect(config.source).toBe("/custom/:path*");
  });
});

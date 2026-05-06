import { describe, expect, test } from "bun:test";
import { createNotifyKitClient } from "../src/client.js";

function mockFetch(routes: Record<string, unknown>) {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    const method = init?.method ?? "GET";
    const parsed = new URL(url, "http://localhost");
    const path = parsed.pathname.replace(/^\/api\/notifykit/, "");
    const key = `${method} ${path}`;
    const body = routes[key];
    if (body === undefined) {
      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    }
    if (typeof body === "function") {
      return (body as () => Response)();
    }
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
}

function makeItem(overrides: Record<string, unknown> = {}) {
  return {
    id: "inb_1",
    notificationRecordId: "ntf_1",
    recipientId: "u1",
    notificationId: "comment",
    title: "Hello",
    body: "World",
    readAt: null,
    archivedAt: null,
    createdAt: "2026-04-30T12:00:00.000Z",
    ...overrides,
  };
}

function sseResponse(events: Array<{ type: string; [k: string]: unknown }>) {
  const encoder = new TextEncoder();
  const chunks = events.map(
    (e) => encoder.encode(`data: ${JSON.stringify(e)}\n\n`),
  );
  let i = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i < chunks.length) {
        controller.enqueue(chunks[i++]);
      } else {
        controller.close();
      }
    },
  });
  return new Response(body, {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
}

function mockFetchWithSSE(
  routes: Record<string, unknown>,
  sseEvents: Array<{ type: string; [k: string]: unknown }>,
) {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    const method = init?.method ?? "GET";
    const parsed = new URL(url, "http://localhost");
    const path = parsed.pathname.replace(/^\/api\/notifykit/, "");

    if (path === "/inbox/stream" && init?.headers) {
      return sseResponse(sseEvents);
    }

    const key = `${method} ${path}`;
    const body = routes[key];
    if (body === undefined) {
      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
}

function waitForState(
  client: ReturnType<typeof createNotifyKitClient>,
  predicate: () => boolean,
  timeoutMs = 2000,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (predicate()) return resolve();
    const timer = setTimeout(
      () => reject(new Error("waitForState timed out")),
      timeoutMs,
    );
    const unsub = client.subscribe(() => {
      if (predicate()) {
        clearTimeout(timer);
        unsub();
        resolve();
      }
    });
  });
}

describe("SSE event ingestion", () => {
  test("inbox.created via SSE adds item and increments unread", async () => {
    const newItem = makeItem({ id: "inb_new" });
    const client = createNotifyKitClient({
      fetch: mockFetchWithSSE(
        { "GET /inbox": { data: [] } },
        [{ type: "inbox.created", item: newItem }],
      ),
      realtime: true,
    });

    await client.inbox.list();
    client.connect();

    await waitForState(client, () => client.getState().inbox.items.length === 1);
    expect(client.getState().inbox.items[0].id).toBe("inb_new");
    expect(client.getState().inbox.unreadCount).toBe(1);

    client.disconnect();
  });

  test("inbox.updated via SSE marks item read", async () => {
    const item = makeItem({ id: "inb_1" });
    const updatedItem = makeItem({ id: "inb_1", readAt: "2026-04-30T12:01:00.000Z" });
    const client = createNotifyKitClient({
      fetch: mockFetchWithSSE(
        { "GET /inbox": { data: [item] } },
        [{ type: "inbox.updated", item: updatedItem }],
      ),
      realtime: true,
    });

    await client.inbox.list();
    expect(client.getState().inbox.unreadCount).toBe(1);
    client.connect();

    await waitForState(client, () => client.getState().inbox.unreadCount === 0);
    expect(client.getState().inbox.items[0].readAt).not.toBeNull();

    client.disconnect();
  });

  test("inbox.archived via SSE removes item from list", async () => {
    const item = makeItem({ id: "inb_1" });
    const archivedItem = makeItem({ id: "inb_1", archivedAt: "2026-04-30T12:01:00.000Z" });
    const client = createNotifyKitClient({
      fetch: mockFetchWithSSE(
        { "GET /inbox": { data: [item] } },
        [{ type: "inbox.archived", item: archivedItem }],
      ),
      realtime: true,
    });

    await client.inbox.list();
    expect(client.getState().inbox.items).toHaveLength(1);
    client.connect();

    await waitForState(client, () => client.getState().inbox.items.length === 0);
    expect(client.getState().inbox.unreadCount).toBe(0);

    client.disconnect();
  });

  test("inbox.unarchived via SSE re-adds item to list", async () => {
    const unarchivedItem = makeItem({ id: "inb_1" });
    const client = createNotifyKitClient({
      fetch: mockFetchWithSSE(
        { "GET /inbox": { data: [] } },
        [{ type: "inbox.unarchived", item: unarchivedItem }],
      ),
      realtime: true,
    });

    await client.inbox.list();
    client.connect();

    await waitForState(client, () => client.getState().inbox.items.length === 1);
    expect(client.getState().inbox.items[0].id).toBe("inb_1");
    expect(client.getState().inbox.unreadCount).toBe(1);

    client.disconnect();
  });

  test("inbox.deleted via SSE removes item", async () => {
    const item = makeItem({ id: "inb_1" });
    const client = createNotifyKitClient({
      fetch: mockFetchWithSSE(
        { "GET /inbox": { data: [item] } },
        [{ type: "inbox.deleted", itemId: "inb_1" }],
      ),
      realtime: true,
    });

    await client.inbox.list();
    client.connect();

    await waitForState(client, () => client.getState().inbox.items.length === 0);
    expect(client.getState().inbox.unreadCount).toBe(0);

    client.disconnect();
  });

  test("inbox.all_read via SSE marks everything read", async () => {
    const client = createNotifyKitClient({
      fetch: mockFetchWithSSE(
        { "GET /inbox": { data: [makeItem({ id: "inb_1" }), makeItem({ id: "inb_2" })] } },
        [{ type: "inbox.all_read" }],
      ),
      realtime: true,
    });

    await client.inbox.list();
    expect(client.getState().inbox.unreadCount).toBe(2);
    client.connect();

    await waitForState(client, () => client.getState().inbox.unreadCount === 0);
    expect(client.getState().inbox.items.every((it) => it.readAt !== null)).toBe(true);

    client.disconnect();
  });

  test("SSE sends custom headers", async () => {
    let capturedHeaders: Record<string, string> = {};
    const client = createNotifyKitClient({
      fetch: (async (_input: string | URL | Request, init?: RequestInit) => {
        const hdrs = init?.headers as Record<string, string> | undefined;
        if (hdrs?.accept === "text/event-stream") {
          capturedHeaders = { ...hdrs };
          return sseResponse([]);
        }
        return new Response(JSON.stringify({ data: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }) as unknown as typeof fetch,
      realtime: true,
      headers: { Authorization: "Bearer test-token" },
    });

    await client.inbox.list();
    client.connect();

    await waitForState(
      client,
      () => capturedHeaders["Authorization"] !== undefined,
    );
    expect(capturedHeaders["Authorization"]).toBe("Bearer test-token");

    client.disconnect();
  });
});

describe("client optimistic mutations", () => {
  test("inbox.created via list loads items and counts unread", async () => {
    const client = createNotifyKitClient({
      fetch: mockFetch({
        "GET /inbox": {
          data: [makeItem({ id: "inb_1" }), makeItem({ id: "inb_2" })],
        },
      }),
    });

    const items = await client.inbox.list();
    expect(items).toHaveLength(2);
    expect(client.getState().inbox.unreadCount).toBe(2);
  });

  test("markRead decrements unread count", async () => {
    const client = createNotifyKitClient({
      fetch: mockFetch({
        "GET /inbox": {
          data: [makeItem({ id: "inb_1" }), makeItem({ id: "inb_2" })],
        },
        "POST /inbox/inb_1/read": {
          data: makeItem({
            id: "inb_1",
            readAt: "2026-04-30T12:01:00.000Z",
          }),
        },
      }),
    });

    await client.inbox.list();
    expect(client.getState().inbox.unreadCount).toBe(2);

    await client.inbox.markRead("inb_1");
    expect(client.getState().inbox.unreadCount).toBe(1);
  });

  test("markAllRead sets all items to read and count to 0", async () => {
    const client = createNotifyKitClient({
      fetch: mockFetch({
        "GET /inbox": {
          data: [makeItem({ id: "inb_1" }), makeItem({ id: "inb_2" })],
        },
        "POST /inbox/mark-all-read": { data: { count: 2 } },
      }),
    });

    await client.inbox.list();
    expect(client.getState().inbox.unreadCount).toBe(2);

    await client.inbox.markAllRead();
    expect(client.getState().inbox.unreadCount).toBe(0);
    expect(
      client.getState().inbox.items.every((it) => it.readAt !== null),
    ).toBe(true);
  });

  test("archive removes item from active list and decrements unread if applicable", async () => {
    const client = createNotifyKitClient({
      fetch: mockFetch({
        "GET /inbox": {
          data: [makeItem({ id: "inb_1" }), makeItem({ id: "inb_2" })],
        },
        "POST /inbox/inb_1/archive": {
          data: makeItem({
            id: "inb_1",
            archivedAt: "2026-04-30T12:01:00.000Z",
          }),
        },
      }),
    });

    await client.inbox.list();
    expect(client.getState().inbox.unreadCount).toBe(2);

    await client.inbox.archive("inb_1");
    expect(client.getState().inbox.items).toHaveLength(1);
    expect(client.getState().inbox.unreadCount).toBe(1);
  });

  test("deleteItem removes item and decrements unread if applicable", async () => {
    const client = createNotifyKitClient({
      fetch: mockFetch({
        "GET /inbox": {
          data: [makeItem({ id: "inb_1" })],
        },
        "DELETE /inbox/inb_1": { data: { deleted: true } },
      }),
    });

    await client.inbox.list();
    expect(client.getState().inbox.unreadCount).toBe(1);

    await client.inbox.deleteItem("inb_1");
    expect(client.getState().inbox.items).toHaveLength(0);
    expect(client.getState().inbox.unreadCount).toBe(0);
  });

  test("realtimeStatus starts as disconnected", () => {
    const client = createNotifyKitClient({
      fetch: mockFetch({}),
      realtime: true,
    });
    expect(client.realtimeStatus()).toBe("disconnected");
  });

  test("connect is no-op when realtime not enabled", () => {
    const client = createNotifyKitClient({
      fetch: mockFetch({}),
    });
    client.connect();
    expect(client.realtimeStatus()).toBe("disconnected");
  });

  test("ref-counted connect/disconnect", () => {
    let fetchCalled = 0;
    const client = createNotifyKitClient({
      fetch: (async () => {
        fetchCalled++;
        return new Response("", { status: 200 });
      }) as unknown as typeof fetch,
      realtime: true,
    });

    client.connect();
    client.connect();
    const firstFetchCount = fetchCalled;

    // Only one connection should have been opened
    expect(firstFetchCount).toBe(1);

    // First disconnect should not close (ref count still > 0)
    client.disconnect();
    expect(client.realtimeStatus()).not.toBe("disconnected");

    // Second disconnect should close
    client.disconnect();
    expect(client.realtimeStatus()).toBe("disconnected");
  });

  test("subscribe notifies on state change", async () => {
    const client = createNotifyKitClient({
      fetch: mockFetch({
        "GET /inbox": { data: [makeItem()] },
      }),
    });

    let notified = 0;
    client.subscribe(() => notified++);

    await client.inbox.list();
    expect(notified).toBeGreaterThan(0);
  });

  test("delete already-read item does not change unread count", async () => {
    const client = createNotifyKitClient({
      fetch: mockFetch({
        "GET /inbox": {
          data: [
            makeItem({ id: "inb_1", readAt: "2026-04-30T12:00:00.000Z" }),
            makeItem({ id: "inb_2" }),
          ],
        },
        "DELETE /inbox/inb_1": { data: { deleted: true } },
      }),
    });

    await client.inbox.list();
    expect(client.getState().inbox.unreadCount).toBe(1);

    await client.inbox.deleteItem("inb_1");
    expect(client.getState().inbox.unreadCount).toBe(1);
  });
});

describe("SSE reconnection", () => {
  test("reconnects after stream error and delivers events", async () => {
    let attempt = 0;
    const newItem = makeItem({ id: "inb_reconnect" });
    const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      const method = init?.method ?? "GET";
      const parsed = new URL(url, "http://localhost");
      const path = parsed.pathname.replace(/^\/api\/notifykit/, "");

      if (path === "/inbox/stream") {
        attempt++;
        if (attempt === 1) {
          return new Response(null, { status: 500 });
        }
        return sseResponse([{ type: "inbox.created", item: newItem }]);
      }

      if (`${method} ${path}` === "GET /inbox") {
        return new Response(JSON.stringify({ data: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    }) as unknown as typeof fetch;

    const client = createNotifyKitClient({
      fetch: fetchImpl,
      realtime: true,
    });

    await client.inbox.list();
    client.connect();

    await waitForState(
      client,
      () => client.getState().inbox.items.length === 1,
      5000,
    );
    expect(client.getState().inbox.items[0].id).toBe("inb_reconnect");
    expect(attempt).toBeGreaterThanOrEqual(2);

    client.disconnect();
  });

  test("tracks Last-Event-ID from server", async () => {
    let capturedHeaders: Record<string, string> = {};
    let attempt = 0;
    const encoder = new TextEncoder();

    const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      const method = init?.method ?? "GET";
      const parsed = new URL(url, "http://localhost");
      const path = parsed.pathname.replace(/^\/api\/notifykit/, "");

      if (path === "/inbox/stream") {
        attempt++;
        const hdrs = init?.headers as Record<string, string> | undefined;
        if (attempt === 2 && hdrs) {
          capturedHeaders = { ...hdrs };
        }
        const body = new ReadableStream<Uint8Array>({
          pull(controller) {
            if (attempt === 1) {
              controller.enqueue(encoder.encode("id: 42\ndata: {\"type\":\"inbox.all_read\",\"count\":0}\n\n"));
            }
            controller.close();
          },
        });
        return new Response(body, {
          status: 200,
          headers: { "content-type": "text/event-stream" },
        });
      }

      if (`${method} ${path}` === "GET /inbox") {
        return new Response(JSON.stringify({ data: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
    }) as unknown as typeof fetch;

    const client = createNotifyKitClient({
      fetch: fetchImpl,
      realtime: true,
    });

    await client.inbox.list();
    client.connect();

    await waitForState(
      client,
      () => attempt >= 2,
      5000,
    );
    expect(capturedHeaders["last-event-id"]).toBe("42");

    client.disconnect();
  });

  test("refetch reconciliation does not count archived extras as unread", async () => {
    let streamAttempts = 0;
    let activeInboxFetches = 0;
    const archivedItem = makeItem({
      id: "inb_archived",
      archivedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    });

    const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      const method = init?.method ?? "GET";
      const parsed = new URL(url, "http://localhost");
      const path = parsed.pathname.replace(/^\/api\/notifykit/, "");
      const key = `${method} ${path}${parsed.search}`;

      if (path === "/inbox/stream") {
        streamAttempts++;
        return sseResponse([]);
      }

      if (key === "GET /inbox?archived=true") {
        return new Response(JSON.stringify({ data: [archivedItem] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }

      if (key === "GET /inbox") {
        activeInboxFetches++;
        return new Response(JSON.stringify({ data: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
    }) as unknown as typeof fetch;

    const client = createNotifyKitClient({
      fetch: fetchImpl,
      realtime: true,
    });

    await client.inbox.list({ archived: true });
    expect(client.getState().inbox.unreadCount).toBe(0);

    client.connect();

    await waitForState(
      client,
      () => streamAttempts >= 2 && activeInboxFetches >= 1,
      5000,
    );
    expect(client.getState().inbox.unreadCount).toBe(0);

    client.disconnect();
  });
});

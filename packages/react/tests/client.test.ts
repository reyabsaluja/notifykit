import { describe, expect, test } from "bun:test";
import { createNotifyKitClient } from "../src/client.js";

function mockFetch(routes: Record<string, unknown>) {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const method = init?.method ?? "GET";
    const path = new URL(url, "http://localhost").pathname.replace(
      /^\/api\/notifykit/,
      "",
    );
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

describe("createNotifyKitClient", () => {
  test("inbox.list fetches and revives dates", async () => {
    const client = createNotifyKitClient({
      fetch: mockFetch({
        "GET /inbox": {
          data: [
            {
              id: "inb_1",
              notificationRecordId: "ntf_1",
              recipientId: "u1",
              notificationId: "comment",
              title: "Hello",
              body: "World",
              readAt: null,
              createdAt: "2026-04-30T12:00:00.000Z",
            },
          ],
        },
      }),
    });

    const items = await client.inbox.list();
    expect(items).toHaveLength(1);
    expect(items[0]!.title).toBe("Hello");
    expect(items[0]!.createdAt).toBeInstanceOf(Date);
    expect(items[0]!.createdAt.toISOString()).toBe("2026-04-30T12:00:00.000Z");
    expect(items[0]!.readAt).toBeNull();

    const state = client.getState();
    expect(state.inbox.status).toBe("ready");
    expect(state.inbox.items).toHaveLength(1);
  });

  test("inbox.list sets error state on failure", async () => {
    const client = createNotifyKitClient({
      fetch: (async () =>
        new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { "content-type": "application/json" },
        })) as unknown as typeof fetch,
    });

    await expect(client.inbox.list()).rejects.toThrow("Unauthorized");
    expect(client.getState().inbox.status).toBe("error");
    expect(client.getState().inbox.error).toBe("Unauthorized");
  });

  test("inbox.markRead applies optimistic update then confirms", async () => {
    const states: string[] = [];
    const client = createNotifyKitClient({
      fetch: mockFetch({
        "GET /inbox": {
          data: [
            {
              id: "inb_1",
              notificationRecordId: "ntf_1",
              recipientId: "u1",
              notificationId: "comment",
              title: "Hello",
              readAt: null,
              createdAt: "2026-04-30T12:00:00.000Z",
            },
          ],
        },
        "POST /inbox/inb_1/read": {
          data: {
            id: "inb_1",
            notificationRecordId: "ntf_1",
            recipientId: "u1",
            notificationId: "comment",
            title: "Hello",
            readAt: "2026-04-30T12:01:00.000Z",
            createdAt: "2026-04-30T12:00:00.000Z",
          },
        },
      }),
    });

    await client.inbox.list();
    expect(client.getState().inbox.items[0]!.readAt).toBeNull();

    client.subscribe(() => {
      const item = client.getState().inbox.items[0];
      if (item?.readAt) states.push("read");
    });

    const result = await client.inbox.markRead("inb_1");
    expect(result).not.toBeNull();
    expect(result!.readAt).toBeInstanceOf(Date);
    expect(states.length).toBeGreaterThanOrEqual(1);
  });

  test("inbox.markRead reverts optimistic update on failure", async () => {
    const client = createNotifyKitClient({
      fetch: mockFetch({
        "GET /inbox": {
          data: [
            {
              id: "inb_1",
              notificationRecordId: "ntf_1",
              recipientId: "u1",
              notificationId: "comment",
              title: "Hello",
              readAt: null,
              createdAt: "2026-04-30T12:00:00.000Z",
            },
          ],
        },
      }),
    });

    await client.inbox.list();
    await expect(client.inbox.markRead("inb_1")).rejects.toThrow();
    expect(client.getState().inbox.items[0]!.readAt).toBeNull();
  });

  test("preferences.list fetches and revives dates", async () => {
    const client = createNotifyKitClient({
      fetch: mockFetch({
        "GET /preferences": {
          data: [
            {
              recipientId: "u1",
              notificationId: "comment",
              channels: { inbox: true, email: false },
              updatedAt: "2026-04-30T12:00:00.000Z",
            },
          ],
        },
      }),
    });

    const prefs = await client.preferences.list();
    expect(prefs).toHaveLength(1);
    expect(prefs[0]!.channels).toEqual({ inbox: true, email: false });
    expect(prefs[0]!.updatedAt).toBeInstanceOf(Date);
    expect(client.getState().preferences.status).toBe("ready");
  });

  test("preferences.update applies optimistic state then confirms", async () => {
    const client = createNotifyKitClient({
      fetch: mockFetch({
        "GET /preferences": {
          data: [
            {
              recipientId: "u1",
              notificationId: "comment",
              channels: { inbox: true, email: true },
              updatedAt: "2026-04-30T12:00:00.000Z",
            },
          ],
        },
        "POST /preferences": {
          data: {
            recipientId: "u1",
            notificationId: "comment",
            channels: { inbox: true, email: false },
            updatedAt: "2026-04-30T12:01:00.000Z",
          },
        },
      }),
    });

    await client.preferences.list();
    const updated = await client.preferences.update({
      notificationId: "comment",
      channels: { email: false },
    });

    expect(updated.channels.email).toBe(false);
    expect(updated.channels.inbox).toBe(true);
  });

  test("preferences.update reverts on server failure", async () => {
    const client = createNotifyKitClient({
      fetch: mockFetch({
        "GET /preferences": {
          data: [
            {
              recipientId: "u1",
              notificationId: "comment",
              channels: { inbox: true, email: true },
              updatedAt: "2026-04-30T12:00:00.000Z",
            },
          ],
        },
      }),
    });

    await client.preferences.list();
    await expect(
      client.preferences.update({
        notificationId: "comment",
        channels: { email: false },
      }),
    ).rejects.toThrow();

    expect(client.getState().preferences.items[0]!.channels.email).toBe(true);
  });

  test("notifications.list returns metadata", async () => {
    const client = createNotifyKitClient({
      fetch: mockFetch({
        "GET /notifications": {
          data: [
            {
              id: "comment",
              channels: ["inbox", "email"],
              payload: { msg: "string" },
              description: "A comment",
              category: "social",
              version: 2,
            },
          ],
        },
      }),
    });

    const notifs = await client.notifications.list();
    expect(notifs).toHaveLength(1);
    expect(notifs[0]!.description).toBe("A comment");
    expect(notifs[0]!.category).toBe("social");
    expect(notifs[0]!.version).toBe(2);
  });

  test("subscribe notifies on state changes", async () => {
    let callCount = 0;
    const client = createNotifyKitClient({
      fetch: mockFetch({
        "GET /inbox": { data: [] },
      }),
    });

    const unsub = client.subscribe(() => callCount++);
    await client.inbox.list();
    unsub();

    expect(callCount).toBeGreaterThanOrEqual(2);

    const before = callCount;
    await client.inbox.list();
    expect(callCount).toBe(before);
  });

  test("custom headers and baseUrl are used", async () => {
    let capturedHeaders: Record<string, string> = {};
    let capturedUrl = "";
    const client = createNotifyKitClient({
      baseUrl: "/custom/path",
      headers: { "x-token": "secret123" },
      fetch: (async (input: string | URL | Request, init?: RequestInit) => {
        capturedUrl = typeof input === "string" ? input : input.toString();
        capturedHeaders = (init?.headers ?? {}) as Record<string, string>;
        return new Response(JSON.stringify({ data: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }) as unknown as typeof fetch,
    });

    await client.inbox.list();
    expect(capturedUrl).toContain("/custom/path/inbox");
    expect(capturedHeaders["x-token"]).toBe("secret123");
  });
});

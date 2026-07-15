import { describe, expect, test } from "bun:test";
import { createNotifyKitClient } from "../src/client.js";
import { getClientSnapshot } from "../src/store.js";

function mockFetch(routes: Record<string, unknown>) {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const method = init?.method ?? "GET";
    const parsed = new URL(url, "http://localhost");
    const path = parsed.pathname.replace(/^\/api\/notifykit/, "");
    const search = parsed.search;
    const key = `${method} ${path}${search}`;
    const body = routes[key] ?? routes[`${method} ${path}`];
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

  test("public state and inbox results are defensive copies", async () => {
    const client = createNotifyKitClient({
      fetch: mockFetch({
        "GET /inbox": {
          data: [
            {
              id: "inb_1",
              notificationRecordId: "ntf_1",
              recipientId: "u1",
              notificationId: "comment",
              title: "Original",
              readAt: null,
              createdAt: "2026-04-30T12:00:00.000Z",
            },
          ],
        },
      }),
    });

    const items = await client.inbox.list();
    items[0]!.title = "mutated return";
    items[0]!.createdAt.setFullYear(2000);

    const snapshot = client.getState();
    snapshot.inbox.items[0]!.title = "mutated snapshot";
    snapshot.inbox.items[0]!.createdAt.setFullYear(2001);

    const next = client.getState();
    expect(next.inbox.items[0]!.title).toBe("Original");
    expect(next.inbox.items[0]!.createdAt.getFullYear()).toBe(2026);
  });

  test("React store snapshots stay stable until client state changes", async () => {
    const client = createNotifyKitClient({
      fetch: mockFetch({ "GET /inbox": { data: [] } }),
    });

    const initial = getClientSnapshot(client);
    expect(getClientSnapshot(client)).toBe(initial);

    await client.inbox.list();
    const updated = getClientSnapshot(client);
    expect(updated).not.toBe(initial);
    expect(getClientSnapshot(client)).toBe(updated);

    // The public API remains defensive even though React gets a stable snapshot.
    expect(client.getState()).not.toBe(updated);
  });

  test("active inbox refresh does not retain recent archived items", async () => {
    const archivedCreatedAt = new Date().toISOString();
    const client = createNotifyKitClient({
      fetch: mockFetch({
        "GET /inbox?archived=true": {
          data: [
            {
              id: "inb_archived",
              notificationRecordId: "ntf_1",
              recipientId: "u1",
              notificationId: "comment",
              title: "Archived",
              readAt: null,
              archivedAt: new Date().toISOString(),
              createdAt: archivedCreatedAt,
            },
          ],
        },
        "GET /inbox": { data: [] },
      }),
    });

    await client.inbox.list({ archived: true });
    expect(client.getState().inbox.items).toHaveLength(1);

    const active = await client.inbox.list();
    expect(active).toEqual([]);
    expect(client.getState().inbox.items).toEqual([]);
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

  test("public state and preference results are defensive copies", async () => {
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
    prefs[0]!.channels.email = true;
    prefs[0]!.updatedAt.setFullYear(2000);

    const snapshot = client.getState();
    snapshot.preferences.items[0]!.channels.email = true;
    snapshot.preferences.items[0]!.updatedAt.setFullYear(2001);

    const next = client.getState();
    expect(next.preferences.items[0]!.channels.email).toBe(false);
    expect(next.preferences.items[0]!.updatedAt.getFullYear()).toBe(2026);
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
              required: true,
              defaultChannels: { email: false },
              classification: "transactional",
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
    expect(notifs[0]!.required).toBe(true);
    expect(notifs[0]!.defaultChannels).toEqual({ email: false });
    expect(notifs[0]!.classification).toBe("transactional");
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

  test("throwing subscribers do not block later listeners", async () => {
    let callCount = 0;
    const errors: unknown[] = [];
    const originalError = console.error;
    console.error = (...args: unknown[]) => {
      errors.push(args);
    };
    try {
      const client = createNotifyKitClient({
        fetch: mockFetch({
          "GET /inbox": { data: [] },
        }),
      });

      client.subscribe(() => {
        throw new Error("listener failed");
      });
      client.subscribe(() => callCount++);

      await client.inbox.list();

      expect(callCount).toBeGreaterThanOrEqual(2);
      expect(errors.length).toBeGreaterThanOrEqual(2);
    } finally {
      console.error = originalError;
    }
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

  test("inbox.unreadCount fetches from server and updates state", async () => {
    const client = createNotifyKitClient({
      fetch: mockFetch({
        "GET /inbox/unread-count": { data: { count: 5 } },
      }),
    });

    const count = await client.inbox.unreadCount();
    expect(count).toBe(5);
    expect(client.getState().inbox.unreadCount).toBe(5);
  });

  test("inbox.unreadCount exposes loading failures through inbox state", async () => {
    const client = createNotifyKitClient({
      fetch: (async () =>
        new Response(JSON.stringify({ error: "Count unavailable" }), {
          status: 503,
          headers: { "content-type": "application/json" },
        })) as unknown as typeof fetch,
    });

    await expect(client.inbox.unreadCount()).rejects.toThrow(
      "Count unavailable",
    );
    expect(client.getState().inbox.status).toBe("error");
    expect(client.getState().inbox.error).toBe("Count unavailable");
  });

  test("inbox.markAllRead optimistically zeroes count and reverts on failure", async () => {
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
              archivedAt: null,
              createdAt: "2026-04-30T12:00:00.000Z",
            },
            {
              id: "inb_2",
              notificationRecordId: "ntf_2",
              recipientId: "u1",
              notificationId: "comment",
              title: "World",
              readAt: null,
              archivedAt: null,
              createdAt: "2026-04-30T12:01:00.000Z",
            },
          ],
        },
        "POST /inbox/mark-all-read": { data: { count: 2 } },
      }),
    });

    await client.inbox.list();
    expect(client.getState().inbox.unreadCount).toBe(2);

    const count = await client.inbox.markAllRead();
    expect(count).toBe(2);
    expect(client.getState().inbox.unreadCount).toBe(0);
  });

  test("inbox.markAllRead reverts on failure", async () => {
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
              archivedAt: null,
              createdAt: "2026-04-30T12:00:00.000Z",
            },
          ],
        },
      }),
    });

    await client.inbox.list();
    expect(client.getState().inbox.unreadCount).toBe(1);

    await expect(client.inbox.markAllRead()).rejects.toThrow();
    expect(client.getState().inbox.unreadCount).toBe(1);
  });

  test("inbox.archive optimistically removes item and decrements count", async () => {
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
              archivedAt: null,
              createdAt: "2026-04-30T12:00:00.000Z",
            },
          ],
        },
        "POST /inbox/inb_1/archive": {
          data: {
            id: "inb_1",
            notificationRecordId: "ntf_1",
            recipientId: "u1",
            notificationId: "comment",
            title: "Hello",
            readAt: null,
            archivedAt: "2026-04-30T12:05:00.000Z",
            createdAt: "2026-04-30T12:00:00.000Z",
          },
        },
      }),
    });

    await client.inbox.list();
    expect(client.getState().inbox.unreadCount).toBe(1);

    const result = await client.inbox.archive("inb_1");
    expect(result).not.toBeNull();
    expect(result!.archivedAt).toBeInstanceOf(Date);
    expect(client.getState().inbox.items).toHaveLength(0);
    expect(client.getState().inbox.unreadCount).toBe(0);
  });

  test("inbox.archive reverts on failure", async () => {
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
              archivedAt: null,
              createdAt: "2026-04-30T12:00:00.000Z",
            },
          ],
        },
      }),
    });

    await client.inbox.list();
    await expect(client.inbox.archive("inb_1")).rejects.toThrow();
    expect(client.getState().inbox.items).toHaveLength(1);
    expect(client.getState().inbox.unreadCount).toBe(1);
  });

  test("inbox.archive does not decrement count for already-read items", async () => {
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
              readAt: "2026-04-30T12:01:00.000Z",
              archivedAt: null,
              createdAt: "2026-04-30T12:00:00.000Z",
            },
          ],
        },
        "POST /inbox/inb_1/archive": {
          data: {
            id: "inb_1",
            notificationRecordId: "ntf_1",
            recipientId: "u1",
            notificationId: "comment",
            title: "Hello",
            readAt: "2026-04-30T12:01:00.000Z",
            archivedAt: "2026-04-30T12:05:00.000Z",
            createdAt: "2026-04-30T12:00:00.000Z",
          },
        },
      }),
    });

    await client.inbox.list();
    expect(client.getState().inbox.unreadCount).toBe(0);

    await client.inbox.archive("inb_1");
    expect(client.getState().inbox.unreadCount).toBe(0);
  });

  test("inbox.unarchive removes item from state and increments count for unread", async () => {
    const client = createNotifyKitClient({
      fetch: mockFetch({
        "GET /inbox?archived=true": {
          data: [
            {
              id: "inb_1",
              notificationRecordId: "ntf_1",
              recipientId: "u1",
              notificationId: "comment",
              title: "Hello",
              readAt: null,
              archivedAt: "2026-04-30T12:05:00.000Z",
              createdAt: "2026-04-30T12:00:00.000Z",
            },
          ],
        },
        "POST /inbox/inb_1/unarchive": {
          data: {
            id: "inb_1",
            notificationRecordId: "ntf_1",
            recipientId: "u1",
            notificationId: "comment",
            title: "Hello",
            readAt: null,
            archivedAt: null,
            createdAt: "2026-04-30T12:00:00.000Z",
          },
        },
      }),
    });

    await client.inbox.list({ archived: true });
    const prevCount = client.getState().inbox.unreadCount;

    const result = await client.inbox.unarchive("inb_1");
    expect(result).not.toBeNull();
    expect(result!.archivedAt).toBeNull();
    expect(client.getState().inbox.items).toHaveLength(0);
    expect(client.getState().inbox.unreadCount).toBe(prevCount + 1);
  });

  test("inbox.unarchive does not increment count for read items", async () => {
    const client = createNotifyKitClient({
      fetch: mockFetch({
        "GET /inbox?archived=true": {
          data: [
            {
              id: "inb_1",
              notificationRecordId: "ntf_1",
              recipientId: "u1",
              notificationId: "comment",
              title: "Hello",
              readAt: "2026-04-30T12:01:00.000Z",
              archivedAt: "2026-04-30T12:05:00.000Z",
              createdAt: "2026-04-30T12:00:00.000Z",
            },
          ],
        },
        "POST /inbox/inb_1/unarchive": {
          data: {
            id: "inb_1",
            notificationRecordId: "ntf_1",
            recipientId: "u1",
            notificationId: "comment",
            title: "Hello",
            readAt: "2026-04-30T12:01:00.000Z",
            archivedAt: null,
            createdAt: "2026-04-30T12:00:00.000Z",
          },
        },
      }),
    });

    await client.inbox.list({ archived: true });
    const prevCount = client.getState().inbox.unreadCount;

    await client.inbox.unarchive("inb_1");
    expect(client.getState().inbox.unreadCount).toBe(prevCount);
  });

  test("inbox.archive does not decrement count for already-archived unread item", async () => {
    const client = createNotifyKitClient({
      fetch: mockFetch({
        "GET /inbox?archived=true": {
          data: [
            {
              id: "inb_1",
              notificationRecordId: "ntf_1",
              recipientId: "u1",
              notificationId: "comment",
              title: "Hello",
              readAt: null,
              archivedAt: "2026-04-30T12:05:00.000Z",
              createdAt: "2026-04-30T12:00:00.000Z",
            },
          ],
        },
        "POST /inbox/inb_1/archive": {
          data: {
            id: "inb_1",
            notificationRecordId: "ntf_1",
            recipientId: "u1",
            notificationId: "comment",
            title: "Hello",
            readAt: null,
            archivedAt: "2026-04-30T12:05:00.000Z",
            createdAt: "2026-04-30T12:00:00.000Z",
          },
        },
      }),
    });

    await client.inbox.list({ archived: true });
    const countBefore = client.getState().inbox.unreadCount;

    await client.inbox.archive("inb_1");
    expect(client.getState().inbox.unreadCount).toBe(countBefore);
    expect(client.getState().inbox.items).toHaveLength(1);
  });

  test("inbox.unarchive does not increment count for already-unarchived unread item", async () => {
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
              archivedAt: null,
              createdAt: "2026-04-30T12:00:00.000Z",
            },
          ],
        },
        "POST /inbox/inb_1/unarchive": {
          data: {
            id: "inb_1",
            notificationRecordId: "ntf_1",
            recipientId: "u1",
            notificationId: "comment",
            title: "Hello",
            readAt: null,
            archivedAt: null,
            createdAt: "2026-04-30T12:00:00.000Z",
          },
        },
      }),
    });

    await client.inbox.list();
    const countBefore = client.getState().inbox.unreadCount;

    await client.inbox.unarchive("inb_1");
    expect(client.getState().inbox.unreadCount).toBe(countBefore);
    expect(client.getState().inbox.items).toHaveLength(1);
  });

  test("inbox.unarchive reverts on failure", async () => {
    const client = createNotifyKitClient({
      fetch: mockFetch({
        "GET /inbox?archived=true": {
          data: [
            {
              id: "inb_1",
              notificationRecordId: "ntf_1",
              recipientId: "u1",
              notificationId: "comment",
              title: "Hello",
              readAt: null,
              archivedAt: "2026-04-30T12:05:00.000Z",
              createdAt: "2026-04-30T12:00:00.000Z",
            },
          ],
        },
      }),
    });

    await client.inbox.list({ archived: true });
    await expect(client.inbox.unarchive("inb_1")).rejects.toThrow();
    expect(client.getState().inbox.items).toHaveLength(1);
  });

  test("inbox.deleteItem optimistically removes and decrements count", async () => {
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
              archivedAt: null,
              createdAt: "2026-04-30T12:00:00.000Z",
            },
          ],
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

  test("inbox.deleteItem does not decrement count for archived unread items", async () => {
    const client = createNotifyKitClient({
      fetch: mockFetch({
        "GET /inbox?archived=true": {
          data: [
            {
              id: "inb_1",
              notificationRecordId: "ntf_1",
              recipientId: "u1",
              notificationId: "comment",
              title: "Hello",
              readAt: null,
              archivedAt: "2026-04-30T12:05:00.000Z",
              createdAt: "2026-04-30T12:00:00.000Z",
            },
          ],
        },
        "DELETE /inbox/inb_1": { data: { deleted: true } },
      }),
    });

    await client.inbox.list({ archived: true });
    const prevCount = client.getState().inbox.unreadCount;

    await client.inbox.deleteItem("inb_1");
    expect(client.getState().inbox.unreadCount).toBe(prevCount);
  });

  test("inbox.deleteItem reverts on failure", async () => {
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
              archivedAt: null,
              createdAt: "2026-04-30T12:00:00.000Z",
            },
          ],
        },
      }),
    });

    await client.inbox.list();
    await expect(client.inbox.deleteItem("inb_1")).rejects.toThrow();
    expect(client.getState().inbox.items).toHaveLength(1);
    expect(client.getState().inbox.unreadCount).toBe(1);
  });

  test("inbox.markRead does not decrement count for archived unread items", async () => {
    const client = createNotifyKitClient({
      fetch: mockFetch({
        "GET /inbox?archived=true": {
          data: [
            {
              id: "inb_1",
              notificationRecordId: "ntf_1",
              recipientId: "u1",
              notificationId: "comment",
              title: "Hello",
              readAt: null,
              archivedAt: "2026-04-30T12:05:00.000Z",
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
            readAt: "2026-04-30T12:06:00.000Z",
            archivedAt: "2026-04-30T12:05:00.000Z",
            createdAt: "2026-04-30T12:00:00.000Z",
          },
        },
      }),
    });

    await client.inbox.list({ archived: true });
    const prevCount = client.getState().inbox.unreadCount;

    await client.inbox.markRead("inb_1");
    expect(client.getState().inbox.unreadCount).toBe(prevCount);
  });
});

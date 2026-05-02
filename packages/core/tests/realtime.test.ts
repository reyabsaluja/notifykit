import { beforeEach, describe, expect, test } from "bun:test";
import {
  channel,
  createHandler,
  createNotifyKit,
  fakeEmailProvider,
  memoryAdapter,
  memoryRealtimeAdapter,
  notification,
} from "../src/index.js";
import type { RealtimeEvent, RealtimeAdapter } from "../src/index.js";

const inbox = channel.inbox();
const email = channel.email();

const commentMentioned = notification({
  id: "comment_mentioned",
  payload: {
    actorName: "string",
    postTitle: "string",
    postUrl: "string",
  },
  channels: [
    inbox({
      title: "{{actorName}} mentioned you",
      body: "In {{postTitle}}",
      actionUrl: "{{postUrl}}",
    }),
    email({
      subject: "{{actorName}} mentioned you in {{postTitle}}",
      body: "Open {{postUrl}} to reply.",
    }),
  ],
});

const BASE = "http://localhost/api/notifykit";

describe("memoryRealtimeAdapter", () => {
  test("publish delivers to subscriber", () => {
    const adapter = memoryRealtimeAdapter();
    const events: RealtimeEvent[] = [];

    adapter.subscribe("user_1", {}, (event) => events.push(event));
    adapter.publish("user_1", {}, {
      type: "inbox.created",
      item: { id: "inb_1" } as any,
    });

    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe("inbox.created");
  });

  test("unsubscribe stops delivery", () => {
    const adapter = memoryRealtimeAdapter();
    const events: RealtimeEvent[] = [];

    const unsub = adapter.subscribe("user_1", {}, (event) => events.push(event));
    adapter.publish("user_1", {}, {
      type: "inbox.created",
      item: { id: "inb_1" } as any,
    });
    expect(events).toHaveLength(1);

    unsub();
    adapter.publish("user_1", {}, {
      type: "inbox.created",
      item: { id: "inb_2" } as any,
    });
    expect(events).toHaveLength(1);
  });

  test("scope isolation: different tenants", () => {
    const adapter = memoryRealtimeAdapter();
    const eventsA: RealtimeEvent[] = [];
    const eventsB: RealtimeEvent[] = [];

    adapter.subscribe("user_1", { tenantId: "t_a" }, (e) => eventsA.push(e));
    adapter.subscribe("user_1", { tenantId: "t_b" }, (e) => eventsB.push(e));

    adapter.publish("user_1", { tenantId: "t_a" }, {
      type: "inbox.deleted",
      itemId: "inb_x",
    });

    expect(eventsA).toHaveLength(1);
    expect(eventsB).toHaveLength(0);
  });

  test("scope isolation: different recipients", () => {
    const adapter = memoryRealtimeAdapter();
    const events1: RealtimeEvent[] = [];
    const events2: RealtimeEvent[] = [];

    adapter.subscribe("user_1", {}, (e) => events1.push(e));
    adapter.subscribe("user_2", {}, (e) => events2.push(e));

    adapter.publish("user_1", {}, {
      type: "inbox.all_read",
      count: 5,
    });

    expect(events1).toHaveLength(1);
    expect(events2).toHaveLength(0);
  });

  test("scope normalization: undefined vs absent fields match", () => {
    const adapter = memoryRealtimeAdapter();
    const events: RealtimeEvent[] = [];

    adapter.subscribe("user_1", {}, (e) => events.push(e));
    adapter.publish("user_1", { tenantId: undefined, workspaceId: undefined } as any, {
      type: "inbox.created",
      item: { id: "inb_1" } as any,
    });

    expect(events).toHaveLength(1);
  });

  test("multiple subscribers for same key all receive events", () => {
    const adapter = memoryRealtimeAdapter();
    const events1: RealtimeEvent[] = [];
    const events2: RealtimeEvent[] = [];

    adapter.subscribe("user_1", {}, (e) => events1.push(e));
    adapter.subscribe("user_1", {}, (e) => events2.push(e));

    adapter.publish("user_1", {}, {
      type: "inbox.created",
      item: { id: "inb_1" } as any,
    });

    expect(events1).toHaveLength(1);
    expect(events2).toHaveLength(1);
  });

  test("publish to key with no subscribers is a no-op", () => {
    const adapter = memoryRealtimeAdapter();
    expect(() => {
      adapter.publish("nobody", {}, {
        type: "inbox.deleted",
        itemId: "inb_ghost",
      });
    }).not.toThrow();
  });
});

describe("handler SSE stream", () => {
  let realtime: RealtimeAdapter;
  let handler: (request: Request) => Promise<Response>;
  let notify: Awaited<ReturnType<typeof createNotifyKit<readonly [typeof commentMentioned]>>>;

  beforeEach(async () => {
    realtime = memoryRealtimeAdapter();
    const database = memoryAdapter();
    notify = createNotifyKit({
      notifications: [commentMentioned] as const,
      database,
      providers: { email: fakeEmailProvider() },
      realtime,
    });

    handler = createHandler(notify, {
      identify: (req) => {
        const url = new URL(req.url);
        const id = url.searchParams.get("as") ?? "user_1";
        const tenant = url.searchParams.get("tenant");
        return { recipientId: id, ...(tenant ? { tenantId: tenant } : {}) };
      },
    });

    await notify.upsertRecipient({
      id: "user_1",
      email: "a@example.com",
      name: "Alice",
    });
  });

  test("GET /inbox/stream returns SSE content-type", async () => {
    const controller = new AbortController();
    const req = new Request(`${BASE}/inbox/stream?as=user_1`, {
      signal: controller.signal,
    });

    const res = await handler(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/event-stream");
    expect(res.headers.get("cache-control")).toBe("no-cache");

    controller.abort();
  });

  test("GET /inbox/stream returns 404 when realtime not configured", async () => {
    const noRtNotify = createNotifyKit({
      notifications: [commentMentioned] as const,
      database: memoryAdapter(),
      providers: { email: fakeEmailProvider() },
    });
    const noRtHandler = createHandler(noRtNotify, {
      identify: () => "user_1",
    });

    const res = await noRtHandler(new Request(`${BASE}/inbox/stream`));
    expect(res.status).toBe(404);
  });

  test("GET /inbox/stream requires auth", async () => {
    const authHandler = createHandler(notify, {
      identify: () => null,
    });

    const res = await authHandler(new Request(`${BASE}/inbox/stream`));
    expect(res.status).toBe(401);
  });

  test("SSE stream receives events from publish", async () => {
    const controller = new AbortController();
    const req = new Request(`${BASE}/inbox/stream?as=user_1`, {
      signal: controller.signal,
    });

    const res = await handler(req);
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();

    // Read the initial ": connected" comment
    const first = await reader.read();
    expect(decoder.decode(first.value)).toContain(": connected");

    // Publish an event
    realtime.publish("user_1", {}, {
      type: "inbox.created",
      item: { id: "inb_1", title: "Hello" } as any,
    });

    const second = await reader.read();
    const text = decoder.decode(second.value);
    expect(text).toContain("event: inbox.created");
    expect(text).toContain('"id":"inb_1"');

    controller.abort();
  });

  test("SSE stream scoped to authenticated tenant", async () => {
    const controllerA = new AbortController();
    const controllerB = new AbortController();

    const reqA = new Request(`${BASE}/inbox/stream?as=user_1&tenant=t_a`, {
      signal: controllerA.signal,
    });
    const reqB = new Request(`${BASE}/inbox/stream?as=user_1&tenant=t_b`, {
      signal: controllerB.signal,
    });

    const resA = await handler(reqA);
    const resB = await handler(reqB);
    const readerA = resA.body!.getReader();
    const readerB = resB.body!.getReader();
    const decoder = new TextDecoder();

    // Drain initial comments
    await readerA.read();
    await readerB.read();

    // Publish to tenant_a only
    realtime.publish("user_1", { tenantId: "t_a" }, {
      type: "inbox.deleted",
      itemId: "inb_x",
    });

    const dataA = await readerA.read();
    expect(decoder.decode(dataA.value)).toContain("inbox.deleted");

    // Tenant B should not have received anything — reading would hang.
    // We verify by publishing to B and checking that's what arrives.
    realtime.publish("user_1", { tenantId: "t_b" }, {
      type: "inbox.all_read",
      count: 0,
    });

    const dataB = await readerB.read();
    expect(decoder.decode(dataB.value)).toContain("inbox.all_read");

    controllerA.abort();
    controllerB.abort();
  });

  test("handler mutations publish realtime events", async () => {
    const events: RealtimeEvent[] = [];
    realtime.subscribe("user_1", {}, (e) => events.push(e));

    // Send a notification to create an inbox item
    await notify.send({
      notificationId: "comment_mentioned",
      recipientId: "user_1",
      payload: {
        actorName: "Bob",
        postTitle: "Test Post",
        postUrl: "https://example.com/post",
      },
    });

    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0]!.type).toBe("inbox.created");

    // Get the inbox item ID
    const items = await notify.inbox.list("user_1", {});
    const itemId = items[0]!.id;

    // Mark read via handler
    const markReadRes = await handler(
      new Request(`${BASE}/inbox/${itemId}/read?as=user_1`, { method: "POST" }),
    );
    expect(markReadRes.status).toBe(200);
    expect(events.some((e) => e.type === "inbox.updated")).toBe(true);

    // Archive via handler
    const archiveRes = await handler(
      new Request(`${BASE}/inbox/${itemId}/archive?as=user_1`, { method: "POST" }),
    );
    expect(archiveRes.status).toBe(200);
    expect(events.some((e) => e.type === "inbox.archived")).toBe(true);

    // Unarchive via handler
    const unarchiveRes = await handler(
      new Request(`${BASE}/inbox/${itemId}/unarchive?as=user_1`, { method: "POST" }),
    );
    expect(unarchiveRes.status).toBe(200);
    expect(events.some((e) => e.type === "inbox.unarchived")).toBe(true);

    // Delete via handler
    const deleteRes = await handler(
      new Request(`${BASE}/inbox/${itemId}?as=user_1`, { method: "DELETE" }),
    );
    expect(deleteRes.status).toBe(200);
    expect(events.some((e) => e.type === "inbox.deleted")).toBe(true);
  });

  test("mark-all-read publishes inbox.all_read", async () => {
    const events: RealtimeEvent[] = [];
    realtime.subscribe("user_1", {}, (e) => events.push(e));

    await notify.send({
      notificationId: "comment_mentioned",
      recipientId: "user_1",
      payload: {
        actorName: "Bob",
        postTitle: "Test",
        postUrl: "https://example.com",
      },
    });

    const res = await handler(
      new Request(`${BASE}/inbox/mark-all-read?as=user_1`, { method: "POST" }),
    );
    expect(res.status).toBe(200);
    expect(events.some((e) => e.type === "inbox.all_read")).toBe(true);
  });
});

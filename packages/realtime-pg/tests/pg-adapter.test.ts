import { describe, expect, test } from "bun:test";
import {
  pgRealtimeAdapter,
  type PgNotifyConnection,
} from "../src/index.js";

function fakePgConnection(): PgNotifyConnection & {
  handlers: Map<string, (payload: string) => void>;
  notifications: Array<{ channel: string; payload: string }>;
  listeningChannels: Set<string>;
} {
  const handlers = new Map<string, (payload: string) => void>();
  const notifications: Array<{ channel: string; payload: string }> = [];
  const listeningChannels = new Set<string>();
  return {
    handlers,
    notifications,
    listeningChannels,
    listen(channel, handler) {
      handlers.set(channel, handler);
      listeningChannels.add(channel);
    },
    unlisten(channel) {
      handlers.delete(channel);
      listeningChannels.delete(channel);
    },
    notify(channel, payload) {
      notifications.push({ channel, payload });
      const handler = handlers.get(channel);
      if (handler) handler(payload);
    },
  };
}

describe("pgRealtimeAdapter", () => {
  test("start() listens on the configured channel", async () => {
    const conn = fakePgConnection();
    const adapter = pgRealtimeAdapter({ connection: conn });

    await adapter.start();
    expect(conn.listeningChannels.has("notifykit_realtime")).toBe(true);
  });

  test("stop() unlistens", async () => {
    const conn = fakePgConnection();
    const adapter = pgRealtimeAdapter({ connection: conn });

    await adapter.start();
    await adapter.stop();
    expect(conn.listeningChannels.size).toBe(0);
  });

  test("stop() clears subscribers even before start", async () => {
    const conn = fakePgConnection();
    const adapter = pgRealtimeAdapter({ connection: conn });
    const events: any[] = [];

    adapter.subscribe("user_1", {}, (event) => events.push(event));
    await adapter.stop();
    await adapter.start();

    adapter.publish("user_1", {}, {
      type: "inbox.deleted",
      itemId: "inb_1",
    });
    await new Promise((r) => setTimeout(r, 10));

    expect(events).toHaveLength(0);
  });

  test("custom channel name", async () => {
    const conn = fakePgConnection();
    const adapter = pgRealtimeAdapter({
      connection: conn,
      channel: "my_custom_channel",
    });

    await adapter.start();
    expect(conn.listeningChannels.has("my_custom_channel")).toBe(true);
  });

  test("publish sends NOTIFY and delivers to local subscribers", async () => {
    const conn = fakePgConnection();
    const adapter = pgRealtimeAdapter({ connection: conn });
    await adapter.start();

    const events: any[] = [];
    adapter.subscribe("user_1", {}, (event) => events.push(event));

    adapter.publish("user_1", {}, {
      type: "inbox.created",
      item: { id: "inb_1" } as any,
    });

    // Wait for fire-and-forget notify
    await new Promise((r) => setTimeout(r, 10));

    expect(conn.notifications).toHaveLength(1);
    expect(conn.notifications[0]!.channel).toBe("notifykit_realtime");

    // Local subscriber gets the event directly
    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe("inbox.created");
  });

  test("cross-process delivery via NOTIFY handler", async () => {
    const conn = fakePgConnection();
    const adapter = pgRealtimeAdapter({ connection: conn });
    await adapter.start();

    const events: any[] = [];
    adapter.subscribe("user_1", {}, (event) => events.push(event));

    // Simulate a NOTIFY from another process
    const foreignPayload = JSON.stringify({
      key: "user_1::",
      event: { type: "inbox.deleted", itemId: "inb_99" },
    });
    const handler = conn.handlers.get("notifykit_realtime")!;
    handler(foreignPayload);

    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe("inbox.deleted");
    expect(events[0]!.itemId).toBe("inb_99");
  });

  test("scope isolation between tenants", async () => {
    const conn = fakePgConnection();
    const adapter = pgRealtimeAdapter({ connection: conn });
    await adapter.start();

    const eventsA: any[] = [];
    const eventsB: any[] = [];
    adapter.subscribe("user_1", { tenantId: "t_a" }, (e) => eventsA.push(e));
    adapter.subscribe("user_1", { tenantId: "t_b" }, (e) => eventsB.push(e));

    adapter.publish("user_1", { tenantId: "t_a" }, {
      type: "inbox.all_read",
      count: 3,
    });

    await new Promise((r) => setTimeout(r, 10));

    expect(eventsA).toHaveLength(1);
    expect(eventsB).toHaveLength(0);
  });

  test("unsubscribe stops delivery", async () => {
    const conn = fakePgConnection();
    const adapter = pgRealtimeAdapter({ connection: conn });
    await adapter.start();

    const events: any[] = [];
    const unsub = adapter.subscribe("user_1", {}, (e) => events.push(e));

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

  test("malformed NOTIFY payloads are ignored", async () => {
    const conn = fakePgConnection();
    const adapter = pgRealtimeAdapter({ connection: conn });
    await adapter.start();

    const events: any[] = [];
    adapter.subscribe("user_1", {}, (e) => events.push(e));

    const handler = conn.handlers.get("notifykit_realtime")!;
    handler("not json");
    handler("{}");
    handler(JSON.stringify({ key: "wrong_user::", event: { type: "inbox.created" } }));

    expect(events).toHaveLength(0);
  });
});

import { describe, expect, test } from "bun:test";
import {
  webSocketRealtimeAdapter,
  type WebSocketLike,
} from "../src/index.js";

function fakeWs(): WebSocketLike & { messages: string[]; closed: boolean } {
  const ws = {
    messages: [] as string[],
    closed: false,
    send(data: string) {
      ws.messages.push(data);
    },
    close() {
      ws.closed = true;
    },
  };
  return ws;
}

function fakeRequest(recipientId: string, tenantId?: string): Request {
  const url = new URL("http://localhost/ws");
  url.searchParams.set("recipientId", recipientId);
  if (tenantId) url.searchParams.set("tenantId", tenantId);
  return new Request(url);
}

describe("webSocketRealtimeAdapter", () => {
  test("publish delivers to subscribed WebSocket", async () => {
    const adapter = webSocketRealtimeAdapter({
      authenticate: (req) => {
        const url = new URL(req.url);
        const recipientId = url.searchParams.get("recipientId");
        return recipientId ? { recipientId } : null;
      },
      heartbeatMs: 0,
    });

    const ws = fakeWs();
    const result = await adapter.handleUpgrade(fakeRequest("user_1"), ws);
    expect(result).not.toBeNull();
    expect(result!.recipientId).toBe("user_1");

    adapter.publish("user_1", {}, {
      type: "inbox.created",
      item: { id: "inb_1" } as any,
    });

    expect(ws.messages).toHaveLength(1);
    const parsed = JSON.parse(ws.messages[0]!);
    expect(parsed.type).toBe("inbox.created");
    expect(parsed.item.id).toBe("inb_1");
  });

  test("authentication failure returns null", async () => {
    const adapter = webSocketRealtimeAdapter({
      authenticate: () => null,
      heartbeatMs: 0,
    });

    const ws = fakeWs();
    const result = await adapter.handleUpgrade(fakeRequest("user_1"), ws);
    expect(result).toBeNull();
    expect(adapter.connectionCount()).toBe(0);
  });

  test("handleClose cleans up subscription", async () => {
    const adapter = webSocketRealtimeAdapter({
      authenticate: (req) => {
        const url = new URL(req.url);
        return { recipientId: url.searchParams.get("recipientId")! };
      },
      heartbeatMs: 0,
    });

    const ws = fakeWs();
    await adapter.handleUpgrade(fakeRequest("user_1"), ws);
    expect(adapter.connectionCount()).toBe(1);

    adapter.handleClose(ws);
    expect(adapter.connectionCount()).toBe(0);

    adapter.publish("user_1", {}, {
      type: "inbox.created",
      item: { id: "inb_2" } as any,
    });
    expect(ws.messages).toHaveLength(0);
  });

  test("scope isolation: tenant A does not see tenant B events", async () => {
    const adapter = webSocketRealtimeAdapter({
      authenticate: (req) => {
        const url = new URL(req.url);
        return {
          recipientId: url.searchParams.get("recipientId")!,
          tenantId: url.searchParams.get("tenantId") ?? undefined,
        };
      },
      heartbeatMs: 0,
    });

    const wsA = fakeWs();
    const wsB = fakeWs();
    await adapter.handleUpgrade(fakeRequest("user_1", "tenant_a"), wsA);
    await adapter.handleUpgrade(fakeRequest("user_1", "tenant_b"), wsB);

    adapter.publish("user_1", { tenantId: "tenant_a" }, {
      type: "inbox.created",
      item: { id: "inb_a" } as any,
    });

    expect(wsA.messages).toHaveLength(1);
    expect(wsB.messages).toHaveLength(0);
  });

  test("multiple connections for same recipient all receive events", async () => {
    const adapter = webSocketRealtimeAdapter({
      authenticate: (req) => {
        const url = new URL(req.url);
        return { recipientId: url.searchParams.get("recipientId")! };
      },
      heartbeatMs: 0,
    });

    const ws1 = fakeWs();
    const ws2 = fakeWs();
    await adapter.handleUpgrade(fakeRequest("user_1"), ws1);
    await adapter.handleUpgrade(fakeRequest("user_1"), ws2);

    adapter.publish("user_1", {}, {
      type: "inbox.deleted",
      itemId: "inb_x",
    });

    expect(ws1.messages).toHaveLength(1);
    expect(ws2.messages).toHaveLength(1);
  });

  test("subscribe() works independently of WebSocket connections", () => {
    const adapter = webSocketRealtimeAdapter({
      authenticate: () => null,
      heartbeatMs: 0,
    });

    const events: any[] = [];
    const unsub = adapter.subscribe("user_1", {}, (event) => {
      events.push(event);
    });

    adapter.publish("user_1", {}, {
      type: "inbox.all_read",
      count: 5,
    });

    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe("inbox.all_read");

    unsub();

    adapter.publish("user_1", {}, {
      type: "inbox.all_read",
      count: 0,
    });
    expect(events).toHaveLength(1);
  });
});

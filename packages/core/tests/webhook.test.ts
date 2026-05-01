import { createHmac } from "node:crypto";
import { describe, expect, test } from "bun:test";
import {
  channel,
  createNotifyKit,
  fakeWebhookProvider,
  memoryAdapter,
  notification,
  webhookProvider,
} from "../src/index.js";
import type { WebhookProvider } from "../src/index.js";

const inbox = channel.inbox();
const email = channel.email();
const webhook = channel.webhook();

const basePayload = {
  actorName: "Rey",
  postTitle: "Launch Plan",
  postUrl: "/p",
};

function buildWebhookDef(
  overrides: Partial<Parameters<typeof webhook>[0]> = {},
) {
  return notification({
    id: "comment_mentioned",
    payload: {
      actorName: "string",
      postTitle: "string",
      postUrl: "string",
    },
    channels: [
      webhook({
        url: "https://example.com/hook/{{postUrl}}",
        headers: { "x-actor": "{{actorName}}" },
        ...overrides,
      }),
    ],
  });
}

function buildKit(
  provider: WebhookProvider,
  defOverrides: Parameters<typeof buildWebhookDef>[0] = {},
) {
  const def = buildWebhookDef(defOverrides);
  const db = memoryAdapter();
  const notify = createNotifyKit({
    notifications: [def] as const,
    database: db,
    providers: { webhook: provider },
  });
  return { notify, db };
}

describe("channel.webhook()", () => {
  test("delivery record uses channel=webhook and records URL + serialized payload", async () => {
    const provider = fakeWebhookProvider();
    const { notify, db } = buildKit(provider);
    await notify.upsertRecipient({ id: "u1" });

    const result = await notify.send({
      recipientId: "u1",
      notificationId: "comment_mentioned",
      payload: basePayload,
    });

    expect(provider.sent).toHaveLength(1);
    expect(result.deliveries[0]!.channel).toBe("webhook");
    expect(result.deliveries[0]!.status).toBe("sent");
    expect(result.deliveries[0]!.to).toBe("https://example.com/hook//p");
    expect(db._state.deliveries[0]!.body).toBe(JSON.stringify(basePayload));
  });

  test("templates render in url and headers", async () => {
    const provider = fakeWebhookProvider();
    const { notify } = buildKit(provider);
    await notify.upsertRecipient({ id: "u1" });
    await notify.send({
      recipientId: "u1",
      notificationId: "comment_mentioned",
      payload: basePayload,
    });

    const call = provider.sent[0]!;
    expect(call.url).toBe("https://example.com/hook//p");
    expect(call.headers["x-actor"]).toBe("Rey");
    expect(call.payload).toEqual({
      notificationId: "comment_mentioned",
      recipientId: "u1",
      payload: basePayload,
      sentAt: expect.any(String),
    });
  });

  test("retry + eventual success", async () => {
    let attempts = 0;
    const flaky: WebhookProvider = {
      id: "flaky",
      async send() {
        attempts++;
        if (attempts < 3) throw new Error(`flaky attempt ${attempts}`);
        return { providerMessageId: `ok-${attempts}` };
      },
    };
    const def = buildWebhookDef();
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: memoryAdapter(),
      providers: { webhook: flaky },
      retry: { maxAttempts: 3, delayMs: () => 0 },
    });
    await notify.upsertRecipient({ id: "u1" });
    const result = await notify.send({
      recipientId: "u1",
      notificationId: "comment_mentioned",
      payload: basePayload,
    });
    expect(attempts).toBe(3);
    expect(result.deliveries[0]!.status).toBe("sent");
    expect(result.deliveries[0]!.attempts).toBe(3);
    expect(result.deliveries[0]!.providerMessageId).toBe("ok-3");
  });

  test("terminal failure + fallback to inbox", async () => {
    const def = notification({
      id: "comment_mentioned",
      payload: { msg: "string" },
      channels: [
        webhook({ url: "https://example.com/hook" }),
      ],
      fallback: inbox({ title: "Fallback: {{msg}}" }),
    });
    const alwaysFail: WebhookProvider = {
      id: "fail",
      async send() {
        throw new Error("nope");
      },
    };
    const db = memoryAdapter();
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: db,
      providers: { webhook: alwaysFail },
      retry: { maxAttempts: 1, delayMs: () => 0 },
    });
    await notify.upsertRecipient({ id: "u1" });
    const result = await notify.send({
      recipientId: "u1",
      notificationId: "comment_mentioned",
      payload: { msg: "hi" },
    });
    expect(result.deliveries[0]!.status).toBe("failed");
    expect(result.deliveries[0]!.error).toMatch(/nope/);
    const items = await notify.inbox.list("u1");
    expect(items).toHaveLength(1);
    expect(items[0]!.title).toBe("Fallback: hi");
  });

  test("respects preferences — opting out skips webhook", async () => {
    const provider = fakeWebhookProvider();
    const { notify } = buildKit(provider);
    await notify.upsertRecipient({ id: "u1" });
    await notify.preferences.update({
      recipientId: "u1",
      notificationId: "comment_mentioned",
      channels: { webhook: false },
    });
    const result = await notify.send({
      recipientId: "u1",
      notificationId: "comment_mentioned",
      payload: basePayload,
    });
    expect(result.skippedChannels).toContain("webhook");
    expect(provider.sent).toEqual([]);
  });

  test("coexists with email in the same notification", async () => {
    const def = notification({
      id: "comment_mentioned",
      payload: { msg: "string" },
      channels: [
        email({ subject: "{{msg}}", body: "{{msg}}" }),
        webhook({ url: "https://hook.example/x" }),
      ],
    });
    const emailProvider = {
      id: "fake-email",
      sent: [] as Array<{ to: string; subject: string; body: string }>,
      async send(input: { to: string; subject: string; body: string }) {
        this.sent.push(input);
        return { providerMessageId: "em1" };
      },
    };
    const webhookProv = fakeWebhookProvider();
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: memoryAdapter(),
      providers: { email: emailProvider, webhook: webhookProv },
    });
    await notify.upsertRecipient({ id: "u1", email: "u@x.com" });
    await notify.send({
      recipientId: "u1",
      notificationId: "comment_mentioned",
      payload: { msg: "hi" },
    });
    expect(emailProvider.sent).toHaveLength(1);
    expect(webhookProv.sent).toHaveLength(1);
  });

  test("throws at startup if provider missing", () => {
    const def = buildWebhookDef();
    expect(() =>
      createNotifyKit({
        notifications: [def] as const,
        database: memoryAdapter(),
      }),
    ).toThrow(/no webhook provider/i);
  });

  test("quiet hours defer webhook alongside email", async () => {
    // Build a window that contains "now" in UTC.
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const start = `${pad((now.getUTCHours() + 23) % 24)}:${pad(now.getUTCMinutes())}`;
    const end = `${pad((now.getUTCHours() + 1) % 24)}:${pad(now.getUTCMinutes())}`;

    const provider = fakeWebhookProvider();
    const def = buildWebhookDef();
    const db = memoryAdapter();
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: db,
      providers: { webhook: provider },
    });
    await notify.upsertRecipient({
      id: "u1",
      quietHours: { start, end, timezone: "UTC" },
    });

    const result = await notify.send({
      recipientId: "u1",
      notificationId: "comment_mentioned",
      payload: basePayload,
    });
    expect(result.deferredChannels).toEqual(["webhook"]);
    expect(provider.sent).toEqual([]);
    expect(db._state.scheduledSends).toHaveLength(1);

    await notify.flushScheduledSends();
    expect(provider.sent).toHaveLength(1);
  });
});

describe("webhookProvider (default fetch-based)", () => {
  test("POSTs JSON payload with signature header when secret is set", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fakeFetch: typeof fetch = (async (input, init) => {
      calls.push({ url: String(input), init: init ?? {} });
      return new Response("", { status: 200, headers: { "x-request-id": "abc" } });
    }) as typeof fetch;

    const provider = webhookProvider({ secret: "shhh", fetch: fakeFetch });
    const res = await provider.send({
      url: "https://example.com/hook",
      headers: { "x-custom": "v" },
      payload: {
        notificationId: "n",
        recipientId: "r",
        payload: { a: 1 },
        sentAt: "2026-04-30T00:00:00.000Z",
      },
    });

    expect(res.providerMessageId).toBe("abc");
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("https://example.com/hook");
    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(headers["content-type"]).toBe("application/json");
    expect(headers["x-custom"]).toBe("v");
    const sig = headers["x-notifykit-signature"];
    expect(sig).toMatch(/^sha256=[0-9a-f]+$/);

    // Verify the signature matches what we'd compute.
    const body = calls[0]!.init.body as string;
    const expected = `sha256=${createHmac("sha256", "shhh").update(body).digest("hex")}`;
    expect(sig).toBe(expected);
  });

  test("no signature header when no secret configured", async () => {
    const calls: Array<{ headers: Record<string, string> }> = [];
    const fakeFetch: typeof fetch = (async (_input, init) => {
      calls.push({ headers: (init?.headers ?? {}) as Record<string, string> });
      return new Response("ok", { status: 200 });
    }) as typeof fetch;

    const provider = webhookProvider({ fetch: fakeFetch });
    await provider.send({
      url: "https://example.com/hook",
      headers: {},
      payload: {
        notificationId: "n",
        recipientId: "r",
        payload: {},
        sentAt: "2026-04-30T00:00:00.000Z",
      },
    });
    expect(calls[0]!.headers["x-notifykit-signature"]).toBeUndefined();
  });

  test("throws on non-2xx response (so retries fire)", async () => {
    const fakeFetch: typeof fetch = (async () =>
      new Response("server down", { status: 500, statusText: "Server Error" })) as typeof fetch;
    const provider = webhookProvider({ fetch: fakeFetch });
    await expect(
      provider.send({
        url: "https://example.com/hook",
        headers: {},
        payload: {
          notificationId: "n",
          recipientId: "r",
          payload: {},
          sentAt: "2026-04-30T00:00:00.000Z",
        },
      }),
    ).rejects.toThrow(/HTTP 500/);
  });
});

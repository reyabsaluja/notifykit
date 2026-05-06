import { describe, expect, test } from "bun:test";
import {
  channel,
  createNotifyKit,
  memoryAdapter,
  notification,
} from "notifykit";
import { resendProvider } from "../src/index.js";

type Call = { url: string; init: RequestInit };

function makeFakeFetch(
  responder: (call: Call) => Response,
): { fetch: typeof fetch; calls: Call[] } {
  const calls: Call[] = [];
  const fake: typeof fetch = (async (input, init) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    const call: Call = { url, init: init ?? {} };
    calls.push(call);
    return responder(call);
  }) as typeof fetch;
  return { fetch: fake, calls };
}

describe("resendProvider", () => {
  test("constructor validation", () => {
    expect(() =>
      resendProvider({ apiKey: "", from: "a@b.c" } as never),
    ).toThrow(/apiKey/);
    expect(() =>
      resendProvider({ apiKey: "k", from: "" } as never),
    ).toThrow(/from/);
  });

  test("POSTs to /emails with correct shape and auth header", async () => {
    const { fetch, calls } = makeFakeFetch(() =>
      new Response(JSON.stringify({ id: "email_123" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const provider = resendProvider({
      apiKey: "re_test",
      from: "Acme <no-reply@acme.com>",
      fetch,
    });
    const result = await provider.send({
      to: "jane@example.com",
      subject: "Hello",
      body: "Welcome!",
    });
    expect(result.providerMessageId).toBe("email_123");
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("https://api.resend.com/emails");
    const init = calls[0]!.init;
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer re_test");
    expect(headers["content-type"]).toBe("application/json");
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({
      from: "Acme <no-reply@acme.com>",
      to: "jane@example.com",
      subject: "Hello",
      html: "Welcome!",
    });
  });

  test("includes reply_to when configured", async () => {
    const { fetch, calls } = makeFakeFetch(
      () =>
        new Response(JSON.stringify({ id: "e1" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    const provider = resendProvider({
      apiKey: "k",
      from: "a@b.c",
      replyTo: "support@acme.com",
      fetch,
    });
    await provider.send({ to: "u@x.com", subject: "s", body: "b" });
    const body = JSON.parse(calls[0]!.init.body as string);
    expect(body.reply_to).toBe("support@acme.com");
  });

  test("throws with the API message on non-2xx", async () => {
    const { fetch } = makeFakeFetch(
      () =>
        new Response(
          JSON.stringify({
            statusCode: 422,
            name: "validation_error",
            message: "Invalid `to` field",
          }),
          { status: 422, headers: { "content-type": "application/json" } },
        ),
    );
    const provider = resendProvider({ apiKey: "k", from: "a@b.c", fetch });
    await expect(
      provider.send({ to: "bad", subject: "s", body: "b" }),
    ).rejects.toThrow(/Invalid `to` field/);
  });

  test("throws when response has no id even on 2xx", async () => {
    const { fetch } = makeFakeFetch(
      () => new Response("{}", { status: 200 }),
    );
    const provider = resendProvider({ apiKey: "k", from: "a@b.c", fetch });
    await expect(
      provider.send({ to: "u@x.com", subject: "s", body: "b" }),
    ).rejects.toThrow(/no `id`/);
  });

  test("respects baseUrl override", async () => {
    const { fetch, calls } = makeFakeFetch(
      () =>
        new Response(JSON.stringify({ id: "x" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    const provider = resendProvider({
      apiKey: "k",
      from: "a@b.c",
      baseUrl: "https://proxy.example/v1/",
      fetch,
    });
    await provider.send({ to: "u@x.com", subject: "s", body: "b" });
    expect(calls[0]!.url).toBe("https://proxy.example/v1/emails");
  });

  test("integrates with createNotifyKit end-to-end", async () => {
    const { fetch, calls } = makeFakeFetch(
      () =>
        new Response(JSON.stringify({ id: "integration_1" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    const emailCh = channel.email();
    const def = notification({
      id: "welcome",
      payload: { name: "string" },
      channels: [
        emailCh({ subject: "Hello {{name}}", body: "Welcome, {{name}}." }),
      ],
    });
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: memoryAdapter(),
      providers: {
        email: resendProvider({
          apiKey: "k",
          from: "Acme <no-reply@acme.com>",
          fetch,
        }),
      },
    });
    await notify.upsertRecipient({ id: "u1", email: "jane@example.com" });
    const result = await notify.send({
      recipientId: "u1",
      notificationId: "welcome",
      payload: { name: "Jane" },
    });
    expect(result.deliveries[0]!.status).toBe("sent");
    expect(result.deliveries[0]!.providerMessageId).toBe("integration_1");
    expect(result.deliveries[0]!.provider).toBe("resend");

    const body = JSON.parse(calls[0]!.init.body as string);
    expect(body.subject).toBe("Hello Jane");
    expect(body.html).toBe("Welcome, Jane.");
    expect(body.to).toBe("jane@example.com");
  });

  test("failures propagate through retry + fallback pipeline", async () => {
    let attempts = 0;
    const { fetch } = makeFakeFetch(() => {
      attempts++;
      return new Response(
        JSON.stringify({ message: `boom ${attempts}` }),
        { status: 500, headers: { "content-type": "application/json" } },
      );
    });
    const inboxCh = channel.inbox();
    const emailCh = channel.email();
    const def = notification({
      id: "reset",
      payload: { link: "string" },
      channels: [emailCh({ subject: "Reset", body: "{{link}}" })],
      fallback: inboxCh({ title: "Fallback for {{link}}" }),
    });
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: memoryAdapter(),
      providers: {
        email: resendProvider({ apiKey: "k", from: "a@b.c", fetch }),
      },
      retry: { maxAttempts: 2, delayMs: () => 0 },
    });
    await notify.upsertRecipient({ id: "u1", email: "u@x.com" });
    const result = await notify.send({
      recipientId: "u1",
      notificationId: "reset",
      payload: { link: "/r/1" },
    });
    expect(attempts).toBe(2);
    expect(result.deliveries[0]!.status).toBe("failed");
    expect(result.deliveries[0]!.error).toMatch(/boom 2/);
    const items = await notify.inbox.list("u1");
    expect(items).toHaveLength(1);
    expect(items[0]!.title).toBe("Fallback for /r/1");
  });
});

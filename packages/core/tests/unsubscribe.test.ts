import { describe, expect, test } from "bun:test";
import {
  channel,
  createHandler,
  createNotifyKit,
  fakeEmailProvider,
  memoryAdapter,
  notification,
  signUnsubscribeToken,
  verifyUnsubscribeToken,
} from "../src/index.js";

const inbox = channel.inbox();
const email = channel.email();

const def = notification({
  id: "comment_mentioned",
  payload: { actorName: "string" },
  channels: [
    inbox({ title: "{{actorName}} mentioned you" }),
    email({
      subject: "{{actorName}} mentioned you",
      body: "Unsubscribe: {{_unsubscribeUrl}}",
    }),
  ],
});

const BASE = "http://localhost/api/notifykit";

function buildKit(options: { secret?: string; baseUrl?: string } = {}) {
  const provider = fakeEmailProvider();
  const db = memoryAdapter();
  const unsubscribe =
    options.secret === undefined
      ? undefined
      : {
          secret: options.secret,
          baseUrl: options.baseUrl ?? BASE,
        };
  const notify = createNotifyKit({
    notifications: [def] as const,
    database: db,
    providers: { email: provider },
    unsubscribe,
  });
  const handler = createHandler(notify, {
    identify: () => "user_1",
    unsubscribeSecret: options.secret,
  });
  return { notify, provider, db, handler };
}

describe("token sign / verify", () => {
  test("round-trips claims", () => {
    const token = signUnsubscribeToken(
      { recipientId: "u1", notificationId: "x" },
      "shhh",
    );
    expect(verifyUnsubscribeToken(token, "shhh")).toEqual({
      recipientId: "u1",
      notificationId: "x",
    });
  });

  test("fails with wrong secret", () => {
    const token = signUnsubscribeToken(
      { recipientId: "u1", notificationId: "x" },
      "shhh",
    );
    expect(verifyUnsubscribeToken(token, "other")).toBeNull();
  });

  test("fails on tampered payload", () => {
    const token = signUnsubscribeToken(
      { recipientId: "u1", notificationId: "x" },
      "shhh",
    );
    const [, sig] = token.split(".");
    const tampered = `${Buffer.from("u2:x").toString("base64url")}.${sig}`;
    expect(verifyUnsubscribeToken(tampered, "shhh")).toBeNull();
  });

  test("fails on malformed token", () => {
    expect(verifyUnsubscribeToken("garbage", "shhh")).toBeNull();
    expect(verifyUnsubscribeToken("", "shhh")).toBeNull();
    expect(verifyUnsubscribeToken("a.b.c", "shhh")).toBeNull();
  });

  test("handles ids containing colons and slashes", () => {
    const token = signUnsubscribeToken(
      { recipientId: "user:42/x", notificationId: "ns:topic/a" },
      "shhh",
    );
    expect(verifyUnsubscribeToken(token, "shhh")).toEqual({
      recipientId: "user:42/x",
      notificationId: "ns:topic/a",
    });
  });
});

describe("email rendering", () => {
  test("{{_unsubscribeUrl}} expands to a verifiable URL", async () => {
    const { notify, provider } = buildKit({ secret: "shhh" });
    await notify.upsertRecipient({ id: "user_1", email: "u@x.com" });
    await notify.send({
      recipientId: "user_1",
      notificationId: "comment_mentioned",
      payload: { actorName: "Rey" },
    });
    expect(provider.sent).toHaveLength(1);
    const body = provider.sent[0]!.body;
    expect(body).toMatch(/\/unsubscribe\?token=/);
    const url = new URL(body.replace(/^Unsubscribe: /, ""));
    const token = url.searchParams.get("token")!;
    expect(verifyUnsubscribeToken(token, "shhh")).toEqual({
      recipientId: "user_1",
      notificationId: "comment_mentioned",
    });
  });

  test("without unsubscribe config, the placeholder renders empty", async () => {
    const { notify, provider } = buildKit(); // no secret
    await notify.upsertRecipient({ id: "user_1", email: "u@x.com" });
    await notify.send({
      recipientId: "user_1",
      notificationId: "comment_mentioned",
      payload: { actorName: "Rey" },
    });
    expect(provider.sent[0]!.body).toBe("Unsubscribe: ");
  });
});

describe("handler route", () => {
  test("GET with valid token flips preference and returns HTML", async () => {
    const { notify, handler } = buildKit({ secret: "shhh" });
    await notify.upsertRecipient({ id: "user_1", email: "u@x.com" });
    const token = signUnsubscribeToken(
      { recipientId: "user_1", notificationId: "comment_mentioned" },
      "shhh",
    );
    const res = await handler(
      new Request(`${BASE}/unsubscribe?token=${encodeURIComponent(token)}`),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/text\/html/);
    const text = await res.text();
    expect(text).toMatch(/unsubscribed/i);
    expect(text).toContain("comment_mentioned");

    const pref = await notify.preferences.get({
      recipientId: "user_1",
      notificationId: "comment_mentioned",
    });
    expect(pref?.channels.email).toBe(false);
  });

  test("POST one-click with token in query returns 200 and flips preference", async () => {
    const { notify, handler } = buildKit({ secret: "shhh" });
    await notify.upsertRecipient({ id: "user_1", email: "u@x.com" });
    const token = signUnsubscribeToken(
      { recipientId: "user_1", notificationId: "comment_mentioned" },
      "shhh",
    );
    const res = await handler(
      new Request(`${BASE}/unsubscribe?token=${encodeURIComponent(token)}`, {
        method: "POST",
      }),
    );
    expect(res.status).toBe(200);
    const pref = await notify.preferences.get({
      recipientId: "user_1",
      notificationId: "comment_mentioned",
    });
    expect(pref?.channels.email).toBe(false);
  });

  test("POST one-click with form body works", async () => {
    const { notify, handler } = buildKit({ secret: "shhh" });
    await notify.upsertRecipient({ id: "user_1", email: "u@x.com" });
    const token = signUnsubscribeToken(
      { recipientId: "user_1", notificationId: "comment_mentioned" },
      "shhh",
    );
    const res = await handler(
      new Request(`${BASE}/unsubscribe`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: `token=${encodeURIComponent(token)}`,
      }),
    );
    expect(res.status).toBe(200);
    const pref = await notify.preferences.get({
      recipientId: "user_1",
      notificationId: "comment_mentioned",
    });
    expect(pref?.channels.email).toBe(false);
  });

  test("invalid token returns 400 and does NOT change preferences", async () => {
    const { notify, handler } = buildKit({ secret: "shhh" });
    await notify.upsertRecipient({ id: "user_1", email: "u@x.com" });
    const res = await handler(
      new Request(`${BASE}/unsubscribe?token=garbage`),
    );
    expect(res.status).toBe(400);
    const pref = await notify.preferences.get({
      recipientId: "user_1",
      notificationId: "comment_mentioned",
    });
    expect(pref).toBeNull();
  });

  test("missing token returns 400", async () => {
    const { handler } = buildKit({ secret: "shhh" });
    const res = await handler(new Request(`${BASE}/unsubscribe`));
    expect(res.status).toBe(400);
  });

  test("without unsubscribeSecret, route 404s", async () => {
    const { handler } = buildKit(); // no secret
    const res = await handler(
      new Request(`${BASE}/unsubscribe?token=anything`),
    );
    expect(res.status).toBe(404);
  });

  test("subsequent sends skip email after unsubscribe", async () => {
    const { notify, handler, provider } = buildKit({ secret: "shhh" });
    await notify.upsertRecipient({ id: "user_1", email: "u@x.com" });
    await notify.send({
      recipientId: "user_1",
      notificationId: "comment_mentioned",
      payload: { actorName: "Rey" },
    });
    expect(provider.sent).toHaveLength(1);

    const token = signUnsubscribeToken(
      { recipientId: "user_1", notificationId: "comment_mentioned" },
      "shhh",
    );
    await handler(
      new Request(`${BASE}/unsubscribe?token=${encodeURIComponent(token)}`),
    );

    const result = await notify.send({
      recipientId: "user_1",
      notificationId: "comment_mentioned",
      payload: { actorName: "Ada" },
    });
    expect(result.skippedChannels).toContain("email");
    expect(provider.sent).toHaveLength(1);
  });

  test("token for unknown notification returns 404", async () => {
    const { notify, handler } = buildKit({ secret: "shhh" });
    await notify.upsertRecipient({ id: "user_1", email: "u@x.com" });
    const token = signUnsubscribeToken(
      { recipientId: "user_1", notificationId: "does_not_exist" },
      "shhh",
    );
    const res = await handler(
      new Request(`${BASE}/unsubscribe?token=${encodeURIComponent(token)}`),
    );
    expect(res.status).toBe(404);
  });

  test("unsubscribe bypasses identify()", async () => {
    // Handler identify() returns null — other routes 401. Unsubscribe should
    // still work because the token itself is the auth.
    const db = memoryAdapter();
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: db,
      providers: { email: fakeEmailProvider() },
      unsubscribe: { secret: "shhh", baseUrl: BASE },
    });
    await notify.upsertRecipient({ id: "user_1", email: "u@x.com" });
    const handler = createHandler(notify, {
      identify: () => null,
      unsubscribeSecret: "shhh",
    });
    const token = signUnsubscribeToken(
      { recipientId: "user_1", notificationId: "comment_mentioned" },
      "shhh",
    );
    const res = await handler(
      new Request(`${BASE}/unsubscribe?token=${encodeURIComponent(token)}`),
    );
    expect(res.status).toBe(200);
  });
});

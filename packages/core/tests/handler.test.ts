import { beforeEach, describe, expect, test } from "bun:test";
import {
  channel,
  createHandler,
  createNotifyKit,
  fakeEmailProvider,
  memoryAdapter,
  notification,
} from "../src/index.js";

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

async function buildHarness(identifyAs: string | null = "user_1") {
  const notify = createNotifyKit({
    notifications: [commentMentioned] as const,
    database: memoryAdapter(),
    providers: { email: fakeEmailProvider() },
  });

  const handler = createHandler(notify, {
    identify: () => identifyAs,
  });

  await notify.upsertRecipient({
    id: "user_1",
    email: "a@example.com",
    name: "Alice",
  });
  await notify.upsertRecipient({
    id: "user_2",
    email: "b@example.com",
    name: "Bob",
  });

  return { notify, handler };
}

const BASE = "http://localhost/api/notifykit";

describe("createHandler", () => {
  let ctx: Awaited<ReturnType<typeof buildHarness>>;

  beforeEach(async () => {
    ctx = await buildHarness();
  });

  test("paths outside basePath return 404", async () => {
    const res = await ctx.handler(new Request("http://localhost/other"));
    expect(res.status).toBe(404);
  });

  test("unknown route under basePath returns 404", async () => {
    const res = await ctx.handler(new Request(`${BASE}/unknown`));
    expect(res.status).toBe(404);
  });

  test("GET /notifications lists notification metadata (no auth required)", async () => {
    const unauth = await buildHarness(null);
    const res = await unauth.handler(new Request(`${BASE}/notifications`));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: Array<{ id: string; channels: string[]; payload: Record<string, string> }>;
    };
    expect(body.data).toHaveLength(1);
    expect(body.data[0]!.id).toBe("comment_mentioned");
    expect(body.data[0]!.channels).toEqual(["inbox", "email"]);
    expect(body.data[0]!.payload).toEqual({
      actorName: "string",
      postTitle: "string",
      postUrl: "string",
    });
  });

  test("returns 401 when identify returns null", async () => {
    const unauth = await buildHarness(null);
    const res = await unauth.handler(new Request(`${BASE}/inbox`));
    expect(res.status).toBe(401);
  });

  test("GET /inbox lists only the authed recipient's items", async () => {
    // seed an item for user_1, another for user_2
    await ctx.notify.send({
      recipientId: "user_1",
      notificationId: "comment_mentioned",
      payload: {
        actorName: "Rey",
        postTitle: "Plan A",
        postUrl: "/a",
      },
    });
    await ctx.notify.send({
      recipientId: "user_2",
      notificationId: "comment_mentioned",
      payload: {
        actorName: "Rey",
        postTitle: "Plan B",
        postUrl: "/b",
      },
    });

    const res = await ctx.handler(new Request(`${BASE}/inbox`));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: Array<{ recipientId: string; title: string }>;
    };
    expect(body.data).toHaveLength(1);
    expect(body.data[0]!.recipientId).toBe("user_1");
    expect(body.data[0]!.title).toBe("Rey mentioned you");
  });

  test("POST /inbox/:id/read marks the item read", async () => {
    const result = await ctx.notify.send({
      recipientId: "user_1",
      notificationId: "comment_mentioned",
      payload: {
        actorName: "Rey",
        postTitle: "Plan",
        postUrl: "/x",
      },
    });
    const itemId = result.inboxItems[0]!.id;

    const res = await ctx.handler(
      new Request(`${BASE}/inbox/${itemId}/read`, { method: "POST" }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { readAt: string | null } };
    expect(body.data.readAt).not.toBeNull();
  });

  test("POST /inbox/:id/read on someone else's item returns 403", async () => {
    const result = await ctx.notify.send({
      recipientId: "user_2", // belongs to Bob
      notificationId: "comment_mentioned",
      payload: {
        actorName: "Rey",
        postTitle: "Plan",
        postUrl: "/x",
      },
    });
    const otherId = result.inboxItems[0]!.id;

    // handler is authed as user_1
    const res = await ctx.handler(
      new Request(`${BASE}/inbox/${otherId}/read`, { method: "POST" }),
    );
    expect(res.status).toBe(403);

    const bobItems = await ctx.notify.inbox.list("user_2");
    expect(bobItems[0]!.readAt).toBeNull();
  });

  test("POST /inbox/missing/read returns 404", async () => {
    const res = await ctx.handler(
      new Request(`${BASE}/inbox/does_not_exist/read`, { method: "POST" }),
    );
    expect(res.status).toBe(404);
  });

  test("GET /inbox with wrong method returns 404", async () => {
    const res = await ctx.handler(
      new Request(`${BASE}/inbox`, { method: "POST" }),
    );
    expect(res.status).toBe(404);
  });

  test("GET /preferences returns the authed user's prefs", async () => {
    await ctx.notify.preferences.update({
      recipientId: "user_1",
      notificationId: "comment_mentioned",
      channels: { email: false },
    });
    const res = await ctx.handler(new Request(`${BASE}/preferences`));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: Array<{
        notificationId: string;
        channels: Record<string, boolean>;
      }>;
    };
    expect(body.data).toHaveLength(1);
    expect(body.data[0]!.channels).toEqual({ email: false });
  });

  test("POST /preferences updates preferences", async () => {
    const res = await ctx.handler(
      new Request(`${BASE}/preferences`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          notificationId: "comment_mentioned",
          channels: { email: false, inbox: true },
        }),
      }),
    );
    expect(res.status).toBe(200);

    const pref = await ctx.notify.preferences.get({
      recipientId: "user_1",
      notificationId: "comment_mentioned",
    });
    expect(pref?.channels).toEqual({ email: false, inbox: true });
  });

  test("POST /preferences rejects unknown notification id as 400", async () => {
    const res = await ctx.handler(
      new Request(`${BASE}/preferences`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          notificationId: "does_not_exist",
          channels: { email: false },
        }),
      }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/Unknown notification/);
  });

  test("POST /preferences rejects invalid body", async () => {
    const res = await ctx.handler(
      new Request(`${BASE}/preferences`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          notificationId: "comment_mentioned",
          channels: { email: "nope" },
        }),
      }),
    );
    expect(res.status).toBe(400);
  });

  test("POST /preferences rejects unknown channel name", async () => {
    const res = await ctx.handler(
      new Request(`${BASE}/preferences`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          notificationId: "comment_mentioned",
          channels: { sms: false },
        }),
      }),
    );
    expect(res.status).toBe(400);
  });

  test("custom basePath routes correctly", async () => {
    const notify = createNotifyKit({
      notifications: [commentMentioned] as const,
      database: memoryAdapter(),
      providers: { email: fakeEmailProvider() },
    });
    await notify.upsertRecipient({ id: "u" });
    const handler = createHandler(notify, {
      identify: () => "u",
      basePath: "/custom/notify",
    });
    const ok = await handler(
      new Request("http://localhost/custom/notify/inbox"),
    );
    expect(ok.status).toBe(200);
    const miss = await handler(
      new Request("http://localhost/api/notifykit/inbox"),
    );
    expect(miss.status).toBe(404);
  });

  test("identify can be async (reads headers)", async () => {
    const notify = createNotifyKit({
      notifications: [commentMentioned] as const,
      database: memoryAdapter(),
      providers: { email: fakeEmailProvider() },
    });
    await notify.upsertRecipient({ id: "user_from_header" });

    const handler = createHandler(notify, {
      identify: async (req) => {
        const token = req.headers.get("x-user-id");
        return token ?? null;
      },
    });

    const unauthed = await handler(new Request(`${BASE}/inbox`));
    expect(unauthed.status).toBe(401);

    const authed = await handler(
      new Request(`${BASE}/inbox`, {
        headers: { "x-user-id": "user_from_header" },
      }),
    );
    expect(authed.status).toBe(200);
  });
});

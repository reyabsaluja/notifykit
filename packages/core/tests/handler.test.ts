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
  const database = memoryAdapter();
  const notify = createNotifyKit({
    notifications: [commentMentioned] as const,
    database,
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

  return { notify, handler, database };
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

  test("malformed encoded route parameters return 404", async () => {
    const inboxRes = await ctx.handler(
      new Request(`${BASE}/inbox/%E0%A4%A/read`, { method: "POST" }),
    );
    expect(inboxRes.status).toBe(404);

    const webhookRes = await ctx.handler(
      new Request(`${BASE}/webhooks/%E0%A4%A`, { method: "POST" }),
    );
    expect(webhookRes.status).toBe(404);
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

  test("POST /preferences ignores client-supplied recipient and tenant ids", async () => {
    const handler = createHandler(ctx.notify, {
      identify: () => ({
        recipientId: "user_1",
        tenantId: "tenant_a",
      }),
    });

    const res = await handler(
      new Request(`${BASE}/preferences`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          recipientId: "user_2",
          tenantId: "tenant_b",
          notificationId: "comment_mentioned",
          channels: { email: false },
        }),
      }),
    );
    expect(res.status).toBe(200);

    const alicePref = await ctx.notify.preferences.get({
      recipientId: "user_1",
      tenantId: "tenant_a",
      notificationId: "comment_mentioned",
    });
    const bobPref = await ctx.notify.preferences.get({
      recipientId: "user_2",
      tenantId: "tenant_b",
      notificationId: "comment_mentioned",
    });
    expect(alicePref?.channels).toEqual({ email: false });
    expect(bobPref).toBeNull();
  });

  test("tenant-scoped inbox routes hide and refuse rows from other tenants", async () => {
    const handler = createHandler(ctx.notify, {
      identify: () => ({
        recipientId: "user_1",
        tenantId: "tenant_a",
      }),
    });

    await ctx.database.inbox.create({
      notificationRecordId: "ntf_tenant_a",
      recipientId: "user_1",
      tenantId: "tenant_a",
      notificationId: "comment_mentioned",
      title: "Tenant A",
    });
    const tenantBItem = await ctx.database.inbox.create({
      notificationRecordId: "ntf_tenant_b",
      recipientId: "user_1",
      tenantId: "tenant_b",
      notificationId: "comment_mentioned",
      title: "Tenant B",
    });

    const list = await handler(new Request(`${BASE}/inbox`));
    expect(list.status).toBe(200);
    const body = (await list.json()) as {
      data: Array<{ title: string; tenantId?: string }>;
    };
    expect(body.data.map((item) => ({
      title: item.title,
      tenantId: item.tenantId,
    }))).toEqual([{ title: "Tenant A", tenantId: "tenant_a" }]);

    const markOtherTenant = await handler(
      new Request(`${BASE}/inbox/${tenantBItem.id}/read`, { method: "POST" }),
    );
    expect(markOtherTenant.status).toBe(403);
    const allTenantBItems = await ctx.notify.inbox.list("user_1", {
      tenantId: "tenant_b",
    });
    expect(allTenantBItems[0]!.readAt).toBeNull();
  });

  test("GET /deliveries requires permission and filters by tenant scope", async () => {
    await ctx.notify.upsertRecipient({
      id: "user_1",
      tenantId: "tenant_a",
      email: "a@example.com",
    });
    await ctx.notify.upsertRecipient({
      id: "user_2",
      tenantId: "tenant_b",
      email: "b@example.com",
    });
    await ctx.notify.send({
      recipientId: "user_1",
      notificationId: "comment_mentioned",
      payload: {
        actorName: "Rey",
        postTitle: "Tenant A",
        postUrl: "/a",
      },
    });
    await ctx.notify.send({
      recipientId: "user_2",
      notificationId: "comment_mentioned",
      payload: {
        actorName: "Rey",
        postTitle: "Tenant B",
        postUrl: "/b",
      },
    });

    const denied = createHandler(ctx.notify, {
      identify: () => ({ recipientId: "user_1", tenantId: "tenant_a" }),
    });
    expect((await denied(new Request(`${BASE}/deliveries`))).status).toBe(403);

    const allowed = createHandler(ctx.notify, {
      identify: () => ({
        recipientId: "user_1",
        tenantId: "tenant_a",
        permissions: ["deliveries.list"],
      }),
    });
    const res = await allowed(new Request(`${BASE}/deliveries`));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: Array<{ recipientId: string; tenantId?: string }>;
    };
    expect(body.data).toHaveLength(1);
    expect(body.data[0]!.recipientId).toBe("user_1");
    expect(body.data[0]!.tenantId).toBe("tenant_a");
  });

  test("GET /deliveries can be allowed through the authorize hook", async () => {
    const sawPermissions: string[] = [];
    const handler = createHandler(ctx.notify, {
      identify: () => ({ recipientId: "user_1" }),
      authorize: (_ctx, permission) => {
        sawPermissions.push(permission);
        return true;
      },
    });

    const res = await handler(new Request(`${BASE}/deliveries`));
    expect(res.status).toBe(200);
    expect(sawPermissions).toContain("deliveries.list");
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
          channels: { push: false },
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

describe("explain endpoint", () => {
  test("GET /explain returns delivery explanation", async () => {
    const { handler } = await buildHarness();
    const res = await handler(
      new Request(
        `${BASE}/explain?notificationId=comment_mentioned&actorName=Bob&postTitle=Hi&postUrl=https://x.com`,
      ),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: Record<string, unknown> };
    expect(body.data).toBeDefined();
    expect(body.data.channels).toBeDefined();
    expect(Array.isArray(body.data.channels)).toBe(true);
  });

  test("GET /explain returns 400 without notificationId", async () => {
    const { handler } = await buildHarness();
    const res = await handler(new Request(`${BASE}/explain`));
    expect(res.status).toBe(400);
  });

  test("GET /explain returns 401 when unauthenticated", async () => {
    const { handler } = await buildHarness(null);
    const res = await handler(
      new Request(`${BASE}/explain?notificationId=comment_mentioned`),
    );
    expect(res.status).toBe(401);
  });
});

describe("handler debug option", () => {
  test("error responses omit fix field by default", async () => {
    const database = memoryAdapter();
    const notify = createNotifyKit({
      notifications: [commentMentioned] as const,
      database,
      providers: { email: fakeEmailProvider() },
    });
    const handler = createHandler(notify, {
      identify: () => null,
    });
    const res = await handler(new Request(`${BASE}/inbox`));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe("UNAUTHENTICATED");
    expect(body.fix).toBeUndefined();
  });

  test("NotifyKitError responses omit fix guidance by default", async () => {
    const database = memoryAdapter();
    const notify = createNotifyKit({
      notifications: [commentMentioned] as const,
      database,
      providers: { email: fakeEmailProvider() },
    });
    await notify.upsertRecipient({ id: "user_1" });
    const handler = createHandler(notify, {
      identify: () => "user_1",
    });

    const res = await handler(new Request(`${BASE}/preferences`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        notificationId: "unknown",
        channels: { email: false },
      }),
    }));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("UNKNOWN_NOTIFICATION");
    expect(body.error).toBe('Unknown notification id: "unknown".');
    expect(body.error).not.toContain("Registered ids");
    expect(body.fix).toBeUndefined();
  });

  test("error responses include fix field when debug: true", async () => {
    const database = memoryAdapter();
    const notify = createNotifyKit({
      notifications: [commentMentioned] as const,
      database,
      providers: { email: fakeEmailProvider() },
    });
    const handler = createHandler(notify, {
      identify: () => null,
      debug: true,
    });
    const res = await handler(new Request(`${BASE}/inbox`));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe("UNAUTHENTICATED");
    expect(body.fix).toBeTypeOf("string");
    expect(body.fix.length).toBeGreaterThan(0);
  });

  test("NotifyKitError responses include fix guidance when debug: true", async () => {
    const database = memoryAdapter();
    const notify = createNotifyKit({
      notifications: [commentMentioned] as const,
      database,
      providers: { email: fakeEmailProvider() },
    });
    await notify.upsertRecipient({ id: "user_1" });
    const handler = createHandler(notify, {
      identify: () => "user_1",
      debug: true,
    });

    const res = await handler(new Request(`${BASE}/preferences`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        notificationId: "unknown",
        channels: { email: false },
      }),
    }));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("UNKNOWN_NOTIFICATION");
    expect(body.error).toBe('Unknown notification id: "unknown".');
    expect(body.fix).toContain("Registered ids: comment_mentioned");
  });
});

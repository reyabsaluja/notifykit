import { beforeEach, describe, expect, test } from "bun:test";
import {
  channel,
  createHandler,
  createNotifyKit,
  fakeEmailProvider,
  memoryAdapter,
  notification,
} from "../src/index.js";
import type { MemoryAdapter, NotifyKit, Handler } from "../src/index.js";

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

function makePayload(actor = "Rey", title = "Plan", url = "/x") {
  return { actorName: actor, postTitle: title, postUrl: url };
}

describe("cross-recipient isolation", () => {
  let database: MemoryAdapter;
  let notify: NotifyKit<readonly [typeof commentMentioned]>;

  beforeEach(async () => {
    database = memoryAdapter();
    notify = createNotifyKit({
      notifications: [commentMentioned] as const,
      database,
      providers: { email: fakeEmailProvider() },
    });
    await notify.upsertRecipient({ id: "alice", email: "alice@x.com" });
    await notify.upsertRecipient({ id: "bob", email: "bob@x.com" });
  });

  test("user cannot list another user's inbox items via handler", async () => {
    await notify.send({
      recipientId: "bob",
      notificationId: "comment_mentioned",
      payload: makePayload(),
    });

    const handler = createHandler(notify, { identify: () => "alice" });
    const res = await handler(new Request(`${BASE}/inbox`));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: unknown[] };
    expect(body.data).toHaveLength(0);
  });

  test("user cannot mark another user's inbox item as read", async () => {
    const result = await notify.send({
      recipientId: "bob",
      notificationId: "comment_mentioned",
      payload: makePayload(),
    });
    const bobItemId = result.inboxItems[0]!.id;

    const handler = createHandler(notify, { identify: () => "alice" });
    const res = await handler(
      new Request(`${BASE}/inbox/${bobItemId}/read`, { method: "POST" }),
    );
    expect(res.status).toBe(403);

    const bobItems = await notify.inbox.list("bob");
    expect(bobItems[0]!.readAt).toBeNull();
  });

  test("user cannot list another user's preferences via handler", async () => {
    await notify.preferences.update({
      recipientId: "bob",
      notificationId: "comment_mentioned",
      channels: { email: false },
    });

    const handler = createHandler(notify, { identify: () => "alice" });
    const res = await handler(new Request(`${BASE}/preferences`));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: unknown[] };
    expect(body.data).toHaveLength(0);
  });

  test("POST /preferences cannot update another user's preferences", async () => {
    const handler = createHandler(notify, { identify: () => "alice" });
    const res = await handler(
      new Request(`${BASE}/preferences`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          recipientId: "bob",
          notificationId: "comment_mentioned",
          channels: { email: false },
        }),
      }),
    );
    expect(res.status).toBe(200);

    const bobPref = await notify.preferences.get({
      recipientId: "bob",
      notificationId: "comment_mentioned",
    });
    expect(bobPref).toBeNull();

    const alicePref = await notify.preferences.get({
      recipientId: "alice",
      notificationId: "comment_mentioned",
    });
    expect(alicePref?.channels).toEqual({ email: false });
  });
});

describe("cross-tenant isolation", () => {
  let database: MemoryAdapter;
  let notify: NotifyKit<readonly [typeof commentMentioned]>;

  beforeEach(async () => {
    database = memoryAdapter();
    notify = createNotifyKit({
      notifications: [commentMentioned] as const,
      database,
      providers: { email: fakeEmailProvider() },
    });
    await notify.upsertRecipient({
      id: "alice",
      tenantId: "tenant_a",
      email: "alice@x.com",
    });
    await notify.upsertRecipient({
      id: "bob",
      tenantId: "tenant_b",
      email: "bob@x.com",
    });
  });

  test("inbox list only returns items from the identified tenant", async () => {
    await database.inbox.create({
      notificationRecordId: "ntf_a",
      recipientId: "alice",
      tenantId: "tenant_a",
      notificationId: "comment_mentioned",
      title: "From tenant A",
    });
    await database.inbox.create({
      notificationRecordId: "ntf_b",
      recipientId: "alice",
      tenantId: "tenant_b",
      notificationId: "comment_mentioned",
      title: "From tenant B",
    });

    const handler = createHandler(notify, {
      identify: () => ({ recipientId: "alice", tenantId: "tenant_a" }),
    });

    const res = await handler(new Request(`${BASE}/inbox`));
    const body = (await res.json()) as {
      data: Array<{ title: string; tenantId?: string }>;
    };
    expect(body.data).toHaveLength(1);
    expect(body.data[0]!.title).toBe("From tenant A");
  });

  test("markRead on another tenant's item returns forbidden", async () => {
    const otherTenantItem = await database.inbox.create({
      notificationRecordId: "ntf_b",
      recipientId: "alice",
      tenantId: "tenant_b",
      notificationId: "comment_mentioned",
      title: "From tenant B",
    });

    const handler = createHandler(notify, {
      identify: () => ({ recipientId: "alice", tenantId: "tenant_a" }),
    });

    const res = await handler(
      new Request(`${BASE}/inbox/${otherTenantItem.id}/read`, {
        method: "POST",
      }),
    );
    expect(res.status).toBe(403);
  });

  test("preferences list is scoped to the identified tenant", async () => {
    await database.preferences.upsert({
      recipientId: "alice",
      tenantId: "tenant_a",
      notificationId: "comment_mentioned",
      channels: { email: false },
    });
    await database.preferences.upsert({
      recipientId: "alice",
      tenantId: "tenant_b",
      notificationId: "comment_mentioned",
      channels: { inbox: false },
    });

    const handler = createHandler(notify, {
      identify: () => ({ recipientId: "alice", tenantId: "tenant_a" }),
    });
    const res = await handler(new Request(`${BASE}/preferences`));
    const body = (await res.json()) as {
      data: Array<{ channels: Record<string, boolean>; tenantId?: string }>;
    };
    expect(body.data).toHaveLength(1);
    expect(body.data[0]!.channels).toEqual({ email: false });
  });

  test("preference update is scoped to the identified tenant", async () => {
    const handler = createHandler(notify, {
      identify: () => ({ recipientId: "alice", tenantId: "tenant_a" }),
    });

    await handler(
      new Request(`${BASE}/preferences`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tenantId: "tenant_b",
          notificationId: "comment_mentioned",
          channels: { email: false },
        }),
      }),
    );

    const tenantAPref = await notify.preferences.get({
      recipientId: "alice",
      tenantId: "tenant_a",
      notificationId: "comment_mentioned",
    });
    expect(tenantAPref?.channels).toEqual({ email: false });

    const tenantBPref = await database.preferences.get(
      "alice",
      "comment_mentioned",
      { tenantId: "tenant_b" },
    );
    expect(tenantBPref).toBeNull();
  });

  test("deliveries list is scoped to the identified tenant", async () => {
    await notify.send({
      recipientId: "alice",
      notificationId: "comment_mentioned",
      payload: makePayload(),
    });
    await notify.send({
      recipientId: "bob",
      notificationId: "comment_mentioned",
      payload: makePayload(),
    });

    const handler = createHandler(notify, {
      identify: () => ({
        recipientId: "alice",
        tenantId: "tenant_a",
        permissions: ["deliveries.list" as const],
      }),
    });

    const res = await handler(new Request(`${BASE}/deliveries`));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: Array<{ recipientId: string; tenantId?: string }>;
    };
    for (const d of body.data) {
      expect(d.tenantId).toBe("tenant_a");
    }
  });

  test("deliveries.list cannot be used to query other tenants via recipientId param", async () => {
    await notify.send({
      recipientId: "bob",
      notificationId: "comment_mentioned",
      payload: makePayload(),
    });

    const handler = createHandler(notify, {
      identify: () => ({
        recipientId: "alice",
        tenantId: "tenant_a",
        permissions: ["deliveries.list" as const],
      }),
    });

    const res = await handler(
      new Request(`${BASE}/deliveries?recipientId=bob`),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: unknown[] };
    expect(body.data).toHaveLength(0);
  });
});

describe("delivery record redaction", () => {
  test("deliveries.list redacts body, subject, and to fields", async () => {
    const database = memoryAdapter();
    const notify = createNotifyKit({
      notifications: [commentMentioned] as const,
      database,
      providers: { email: fakeEmailProvider() },
    });
    await notify.upsertRecipient({ id: "alice", email: "alice@secret.com" });
    await notify.send({
      recipientId: "alice",
      notificationId: "comment_mentioned",
      payload: makePayload(),
    });

    const handler = createHandler(notify, {
      identify: () => ({
        recipientId: "alice",
        permissions: ["admin" as const],
      }),
    });

    const res = await handler(new Request(`${BASE}/deliveries`));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: Array<Record<string, unknown>>;
    };
    expect(body.data.length).toBeGreaterThan(0);
    for (const d of body.data) {
      expect(d).not.toHaveProperty("body");
      expect(d).not.toHaveProperty("subject");
      expect(d).not.toHaveProperty("to");
      expect(d).toHaveProperty("id");
      expect(d).toHaveProperty("channel");
      expect(d).toHaveProperty("status");
      expect(d).toHaveProperty("notificationId");
    }
  });
});

describe("unauthenticated access", () => {
  test("all protected routes return 401 when identify returns null", async () => {
    const database = memoryAdapter();
    const notify = createNotifyKit({
      notifications: [commentMentioned] as const,
      database,
      providers: { email: fakeEmailProvider() },
    });
    const handler = createHandler(notify, { identify: () => null });

    const routes = [
      new Request(`${BASE}/inbox`),
      new Request(`${BASE}/inbox/some-id/read`, { method: "POST" }),
      new Request(`${BASE}/preferences`),
      new Request(`${BASE}/preferences`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          notificationId: "comment_mentioned",
          channels: { email: false },
        }),
      }),
      new Request(`${BASE}/deliveries`),
    ];

    for (const req of routes) {
      const res = await handler(req);
      expect(res.status).toBe(401);
    }
  });

  test("GET /notifications is accessible without auth", async () => {
    const database = memoryAdapter();
    const notify = createNotifyKit({
      notifications: [commentMentioned] as const,
      database,
      providers: { email: fakeEmailProvider() },
    });
    const handler = createHandler(notify, { identify: () => null });

    const res = await handler(new Request(`${BASE}/notifications`));
    expect(res.status).toBe(200);
  });
});

describe("permission enforcement", () => {
  test("deliveries.list without permission returns 403", async () => {
    const database = memoryAdapter();
    const notify = createNotifyKit({
      notifications: [commentMentioned] as const,
      database,
      providers: { email: fakeEmailProvider() },
    });
    await notify.upsertRecipient({ id: "alice" });

    const handler = createHandler(notify, {
      identify: () => ({ recipientId: "alice" }),
    });

    const res = await handler(new Request(`${BASE}/deliveries`));
    expect(res.status).toBe(403);
  });

  test("admin permission grants access to deliveries.list", async () => {
    const database = memoryAdapter();
    const notify = createNotifyKit({
      notifications: [commentMentioned] as const,
      database,
      providers: { email: fakeEmailProvider() },
    });
    await notify.upsertRecipient({ id: "alice" });

    const handler = createHandler(notify, {
      identify: () => ({
        recipientId: "alice",
        permissions: ["admin" as const],
      }),
    });

    const res = await handler(new Request(`${BASE}/deliveries`));
    expect(res.status).toBe(200);
  });

  test("authorize hook overrides identity permissions", async () => {
    const database = memoryAdapter();
    const notify = createNotifyKit({
      notifications: [commentMentioned] as const,
      database,
      providers: { email: fakeEmailProvider() },
    });
    await notify.upsertRecipient({ id: "alice" });

    const handler = createHandler(notify, {
      identify: () => ({
        recipientId: "alice",
        permissions: ["admin" as const],
      }),
      authorize: () => false,
    });

    const res = await handler(new Request(`${BASE}/deliveries`));
    expect(res.status).toBe(403);
  });
});

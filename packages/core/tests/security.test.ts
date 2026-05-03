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

describe("handler inbox routes", () => {
  let database: MemoryAdapter;
  let notify: NotifyKit<readonly [typeof commentMentioned]>;
  let handle: Handler;

  beforeEach(async () => {
    database = memoryAdapter();
    notify = createNotifyKit({
      notifications: [commentMentioned] as const,
      database,
      providers: { email: fakeEmailProvider() },
    });
    await notify.upsertRecipient({ id: "alice", email: "alice@x.com" });
    handle = createHandler(notify, { identify: () => "alice" });
  });

  test("GET /inbox/unread-count returns count", async () => {
    await notify.send({
      recipientId: "alice",
      notificationId: "comment_mentioned",
      payload: makePayload(),
    });
    await notify.send({
      recipientId: "alice",
      notificationId: "comment_mentioned",
      payload: makePayload("Bob"),
    });

    const res = await handle(new Request(`${BASE}/inbox/unread-count`));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { count: number } };
    expect(body.data.count).toBe(2);
  });

  test("POST /inbox/mark-all-read marks all and returns count", async () => {
    await notify.send({
      recipientId: "alice",
      notificationId: "comment_mentioned",
      payload: makePayload(),
    });
    await notify.send({
      recipientId: "alice",
      notificationId: "comment_mentioned",
      payload: makePayload("Bob"),
    });

    const res = await handle(
      new Request(`${BASE}/inbox/mark-all-read`, { method: "POST" }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { count: number } };
    expect(body.data.count).toBe(2);

    const countRes = await handle(new Request(`${BASE}/inbox/unread-count`));
    const countBody = (await countRes.json()) as { data: { count: number } };
    expect(countBody.data.count).toBe(0);
  });

  test("POST /inbox/:id/archive archives and hides from default list", async () => {
    const result = await notify.send({
      recipientId: "alice",
      notificationId: "comment_mentioned",
      payload: makePayload(),
    });
    const itemId = result.inboxItems[0]!.id;

    const res = await handle(
      new Request(`${BASE}/inbox/${itemId}/archive`, { method: "POST" }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { id: string; archivedAt: string };
    };
    expect(body.data.archivedAt).toBeTruthy();

    const listRes = await handle(new Request(`${BASE}/inbox`));
    const listBody = (await listRes.json()) as { data: unknown[] };
    expect(listBody.data).toHaveLength(0);

    const archivedRes = await handle(
      new Request(`${BASE}/inbox?archived=true`),
    );
    const archivedBody = (await archivedRes.json()) as { data: unknown[] };
    expect(archivedBody.data).toHaveLength(1);
  });

  test("POST /inbox/:id/unarchive restores item", async () => {
    const result = await notify.send({
      recipientId: "alice",
      notificationId: "comment_mentioned",
      payload: makePayload(),
    });
    const itemId = result.inboxItems[0]!.id;

    await handle(
      new Request(`${BASE}/inbox/${itemId}/archive`, { method: "POST" }),
    );

    const res = await handle(
      new Request(`${BASE}/inbox/${itemId}/unarchive`, { method: "POST" }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { id: string; archivedAt: string | null };
    };
    expect(body.data.archivedAt).toBeNull();

    const listRes = await handle(new Request(`${BASE}/inbox`));
    const listBody = (await listRes.json()) as { data: unknown[] };
    expect(listBody.data).toHaveLength(1);
  });

  test("DELETE /inbox/:id hard deletes item", async () => {
    const result = await notify.send({
      recipientId: "alice",
      notificationId: "comment_mentioned",
      payload: makePayload(),
    });
    const itemId = result.inboxItems[0]!.id;

    const res = await handle(
      new Request(`${BASE}/inbox/${itemId}`, { method: "DELETE" }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { deleted: boolean } };
    expect(body.data.deleted).toBe(true);

    const listRes = await handle(new Request(`${BASE}/inbox`));
    const listBody = (await listRes.json()) as { data: unknown[] };
    expect(listBody.data).toHaveLength(0);
  });

  test("archive/unarchive/delete return 404 for missing items", async () => {
    const archiveRes = await handle(
      new Request(`${BASE}/inbox/nope/archive`, { method: "POST" }),
    );
    expect(archiveRes.status).toBe(404);

    const unarchiveRes = await handle(
      new Request(`${BASE}/inbox/nope/unarchive`, { method: "POST" }),
    );
    expect(unarchiveRes.status).toBe(404);

    const deleteRes = await handle(
      new Request(`${BASE}/inbox/nope`, { method: "DELETE" }),
    );
    expect(deleteRes.status).toBe(404);
  });

  test("archive/unarchive/delete return 403 for another user's items", async () => {
    await notify.upsertRecipient({ id: "bob", email: "bob@x.com" });
    const result = await notify.send({
      recipientId: "bob",
      notificationId: "comment_mentioned",
      payload: makePayload(),
    });
    const bobItemId = result.inboxItems[0]!.id;

    const archiveRes = await handle(
      new Request(`${BASE}/inbox/${bobItemId}/archive`, { method: "POST" }),
    );
    expect(archiveRes.status).toBe(403);

    const unarchiveRes = await handle(
      new Request(`${BASE}/inbox/${bobItemId}/unarchive`, { method: "POST" }),
    );
    expect(unarchiveRes.status).toBe(403);

    const deleteRes = await handle(
      new Request(`${BASE}/inbox/${bobItemId}`, { method: "DELETE" }),
    );
    expect(deleteRes.status).toBe(403);
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
      new Request(`${BASE}/inbox/unread-count`),
      new Request(`${BASE}/inbox/mark-all-read`, { method: "POST" }),
      new Request(`${BASE}/inbox/some-id/archive`, { method: "POST" }),
      new Request(`${BASE}/inbox/some-id/unarchive`, { method: "POST" }),
      new Request(`${BASE}/inbox/some-id`, { method: "DELETE" }),
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

describe("SDK-level cross-tenant isolation", () => {
  test("inbox.list with scope only returns matching tenant's items", async () => {
    const database = memoryAdapter();
    const notify = createNotifyKit({
      notifications: [commentMentioned] as const,
      database,
      providers: { email: fakeEmailProvider() },
    });
    await notify.upsertRecipient({
      id: "alice",
      tenantId: "tenant_a",
      email: "alice@x.com",
    });
    await notify.send({
      recipientId: "alice",
      notificationId: "comment_mentioned",
      payload: makePayload(),
    });
    // Manually insert an item under a different tenant for the same recipient
    await database.inbox.create({
      notificationRecordId: "ntf_b",
      recipientId: "alice",
      tenantId: "tenant_b",
      notificationId: "comment_mentioned",
      title: "From tenant B",
    });

    const tenantA = await notify.inbox.list("alice", { tenantId: "tenant_a" });
    const tenantB = await notify.inbox.list("alice", { tenantId: "tenant_b" });
    expect(tenantA.every((i) => i.tenantId === "tenant_a")).toBe(true);
    expect(tenantB.every((i) => i.tenantId === "tenant_b")).toBe(true);
    expect(tenantB).toHaveLength(1);
    expect(tenantB[0]!.title).toBe("From tenant B");
  });

  test("deliveries.list with scope only returns matching tenant's deliveries", async () => {
    const database = memoryAdapter();
    const notify = createNotifyKit({
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

    const tenantA = await notify.deliveries.list(undefined, {
      tenantId: "tenant_a",
    });
    for (const d of tenantA) {
      expect(d.tenantId).toBe("tenant_a");
    }
    expect(tenantA.length).toBeGreaterThan(0);

    const tenantB = await notify.deliveries.list(undefined, {
      tenantId: "tenant_b",
    });
    for (const d of tenantB) {
      expect(d.tenantId).toBe("tenant_b");
    }

    // Cross-tenant: requesting tenant_a deliveries must not include tenant_b
    const aliceIdInB = await notify.deliveries.list("alice", {
      tenantId: "tenant_b",
    });
    expect(aliceIdInB).toHaveLength(0);
  });

  test("preferences.list with scope only returns matching tenant's preferences", async () => {
    const database = memoryAdapter();
    const notify = createNotifyKit({
      notifications: [commentMentioned] as const,
      database,
      providers: { email: fakeEmailProvider() },
    });
    await notify.upsertRecipient({
      id: "alice",
      tenantId: "tenant_a",
      email: "alice@x.com",
    });
    await notify.preferences.update({
      recipientId: "alice",
      tenantId: "tenant_a",
      notificationId: "comment_mentioned",
      channels: { email: false },
    });

    const tenantA = await notify.preferences.list("alice", {
      tenantId: "tenant_a",
    });
    expect(tenantA).toHaveLength(1);
    expect(tenantA[0]!.channels).toEqual({ email: false });

    const tenantB = await notify.preferences.list("alice", {
      tenantId: "tenant_b",
    });
    expect(tenantB).toHaveLength(0);
  });
});

describe("cross-workspace isolation", () => {
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
      workspaceId: "ws_a",
      email: "alice@x.com",
    });
    await notify.upsertRecipient({
      id: "bob",
      workspaceId: "ws_b",
      email: "bob@x.com",
    });
  });

  test("inbox list only returns items from the identified workspace", async () => {
    await database.inbox.create({
      notificationRecordId: "ntf_a",
      recipientId: "alice",
      workspaceId: "ws_a",
      notificationId: "comment_mentioned",
      title: "From workspace A",
    });
    await database.inbox.create({
      notificationRecordId: "ntf_b",
      recipientId: "alice",
      workspaceId: "ws_b",
      notificationId: "comment_mentioned",
      title: "From workspace B",
    });

    const handler = createHandler(notify, {
      identify: () => ({ recipientId: "alice", workspaceId: "ws_a" }),
    });

    const res = await handler(new Request(`${BASE}/inbox`));
    const body = (await res.json()) as {
      data: Array<{ title: string; workspaceId?: string }>;
    };
    expect(body.data).toHaveLength(1);
    expect(body.data[0]!.title).toBe("From workspace A");
  });

  test("markRead on another workspace's item returns forbidden", async () => {
    const otherWsItem = await database.inbox.create({
      notificationRecordId: "ntf_b",
      recipientId: "alice",
      workspaceId: "ws_b",
      notificationId: "comment_mentioned",
      title: "From workspace B",
    });

    const handler = createHandler(notify, {
      identify: () => ({ recipientId: "alice", workspaceId: "ws_a" }),
    });

    const res = await handler(
      new Request(`${BASE}/inbox/${otherWsItem.id}/read`, { method: "POST" }),
    );
    expect(res.status).toBe(403);
  });

  test("preferences list is scoped to the identified workspace", async () => {
    await database.preferences.upsert({
      recipientId: "alice",
      workspaceId: "ws_a",
      notificationId: "comment_mentioned",
      channels: { email: false },
    });
    await database.preferences.upsert({
      recipientId: "alice",
      workspaceId: "ws_b",
      notificationId: "comment_mentioned",
      channels: { inbox: false },
    });

    const handler = createHandler(notify, {
      identify: () => ({ recipientId: "alice", workspaceId: "ws_a" }),
    });
    const res = await handler(new Request(`${BASE}/preferences`));
    const body = (await res.json()) as {
      data: Array<{ channels: Record<string, boolean>; workspaceId?: string }>;
    };
    expect(body.data).toHaveLength(1);
    expect(body.data[0]!.channels).toEqual({ email: false });
  });

  test("preference update is scoped to the identified workspace", async () => {
    const handler = createHandler(notify, {
      identify: () => ({ recipientId: "alice", workspaceId: "ws_a" }),
    });

    await handler(
      new Request(`${BASE}/preferences`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workspaceId: "ws_b",
          notificationId: "comment_mentioned",
          channels: { email: false },
        }),
      }),
    );

    const wsAPref = await notify.preferences.get({
      recipientId: "alice",
      workspaceId: "ws_a",
      notificationId: "comment_mentioned",
    });
    expect(wsAPref?.channels).toEqual({ email: false });

    const wsBPref = await database.preferences.get(
      "alice",
      "comment_mentioned",
      { workspaceId: "ws_b" },
    );
    expect(wsBPref).toBeNull();
  });

  test("deliveries list is scoped to the identified workspace", async () => {
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
        workspaceId: "ws_a",
        permissions: ["deliveries.list" as const],
      }),
    });

    const res = await handler(new Request(`${BASE}/deliveries`));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: Array<{ recipientId: string; workspaceId?: string }>;
    };
    for (const d of body.data) {
      expect(d.workspaceId).toBe("ws_a");
    }
  });
});

describe("protectNotifications option", () => {
  test("GET /notifications returns 401 when protectNotifications is true and identify returns null", async () => {
    const database = memoryAdapter();
    const notify = createNotifyKit({
      notifications: [commentMentioned] as const,
      database,
      providers: { email: fakeEmailProvider() },
    });
    const handler = createHandler(notify, {
      identify: () => null,
      protectNotifications: true,
    });

    const res = await handler(new Request(`${BASE}/notifications`));
    expect(res.status).toBe(401);
  });

  test("GET /notifications returns 200 when protectNotifications is true and identify succeeds", async () => {
    const database = memoryAdapter();
    const notify = createNotifyKit({
      notifications: [commentMentioned] as const,
      database,
      providers: { email: fakeEmailProvider() },
    });
    const handler = createHandler(notify, {
      identify: () => "alice",
      protectNotifications: true,
    });

    const res = await handler(new Request(`${BASE}/notifications`));
    expect(res.status).toBe(200);
  });

  test("GET /notifications is public by default", async () => {
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

describe("CORS support", () => {
  test("responses include CORS headers and credentials when cors is a specific origin", async () => {
    const database = memoryAdapter();
    const notify = createNotifyKit({
      notifications: [commentMentioned] as const,
      database,
      providers: { email: fakeEmailProvider() },
    });
    const handler = createHandler(notify, {
      identify: () => null,
      cors: "https://app.example.com",
    });

    const res = await handler(new Request(`${BASE}/notifications`));
    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://app.example.com",
    );
    expect(res.headers.get("Access-Control-Allow-Credentials")).toBe("true");
    expect(res.headers.get("Vary")).toBe("Origin");
  });

  test("wildcard cors omits credentials header", async () => {
    const database = memoryAdapter();
    const notify = createNotifyKit({
      notifications: [commentMentioned] as const,
      database,
      providers: { email: fakeEmailProvider() },
    });
    const handler = createHandler(notify, {
      identify: () => null,
      cors: "*",
    });

    const res = await handler(new Request(`${BASE}/notifications`));
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(res.headers.get("Access-Control-Allow-Credentials")).toBeNull();
  });

  test("OPTIONS preflight reflects Access-Control-Request-Headers", async () => {
    const database = memoryAdapter();
    const notify = createNotifyKit({
      notifications: [commentMentioned] as const,
      database,
      providers: { email: fakeEmailProvider() },
    });
    const handler = createHandler(notify, {
      identify: () => null,
      cors: "https://app.example.com",
    });

    const res = await handler(
      new Request(`${BASE}/inbox`, {
        method: "OPTIONS",
        headers: {
          "Access-Control-Request-Headers": "Content-Type, X-Custom-Auth",
        },
      }),
    );
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Headers")).toBe(
      "Content-Type, X-Custom-Auth",
    );
    expect(res.headers.get("Access-Control-Allow-Credentials")).toBe("true");
    expect(res.headers.get("Access-Control-Allow-Methods")).toBe(
      "GET, POST, DELETE, OPTIONS",
    );
  });

  test("preflight uses fixed allowlist when request omits header list", async () => {
    const database = memoryAdapter();
    const notify = createNotifyKit({
      notifications: [commentMentioned] as const,
      database,
      providers: { email: fakeEmailProvider() },
    });
    const handler = createHandler(notify, {
      identify: () => null,
      cors: "*",
    });

    const res = await handler(
      new Request(`${BASE}/inbox`, { method: "OPTIONS" }),
    );
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(res.headers.get("Access-Control-Allow-Headers")).toBe(
      "Content-Type, Authorization",
    );
  });

  test("no CORS headers when cors option is omitted", async () => {
    const database = memoryAdapter();
    const notify = createNotifyKit({
      notifications: [commentMentioned] as const,
      database,
      providers: { email: fakeEmailProvider() },
    });
    const handler = createHandler(notify, { identify: () => null });

    const res = await handler(new Request(`${BASE}/notifications`));
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });
});

describe("empty-string recipientId rejection", () => {
  test("identify returning empty string is treated as unauthenticated", async () => {
    const database = memoryAdapter();
    const notify = createNotifyKit({
      notifications: [commentMentioned] as const,
      database,
      providers: { email: fakeEmailProvider() },
    });
    const handler = createHandler(notify, { identify: () => "" });

    const res = await handler(new Request(`${BASE}/inbox`));
    expect(res.status).toBe(401);
  });

  test("identify returning object with empty recipientId is treated as unauthenticated", async () => {
    const database = memoryAdapter();
    const notify = createNotifyKit({
      notifications: [commentMentioned] as const,
      database,
      providers: { email: fakeEmailProvider() },
    });
    const handler = createHandler(notify, {
      identify: () => ({ recipientId: "" }),
    });

    const res = await handler(new Request(`${BASE}/inbox`));
    expect(res.status).toBe(401);
  });
});

describe("deliveries.list admin vs non-admin scoping", () => {
  test("non-admin with deliveries.list sees only own deliveries", async () => {
    const database = memoryAdapter();
    const notify = createNotifyKit({
      notifications: [commentMentioned] as const,
      database,
      providers: { email: fakeEmailProvider() },
    });
    await notify.upsertRecipient({
      id: "alice",
      tenantId: "t1",
      email: "alice@x.com",
    });
    await notify.upsertRecipient({
      id: "bob",
      tenantId: "t1",
      email: "bob@x.com",
    });
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
        tenantId: "t1",
        permissions: ["deliveries.list" as const],
      }),
    });

    const res = await handler(new Request(`${BASE}/deliveries`));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: Array<{ recipientId: string }> };
    for (const d of body.data) {
      expect(d.recipientId).toBe("alice");
    }
  });

  test("non-admin cannot use recipientId param to query other users", async () => {
    const database = memoryAdapter();
    const notify = createNotifyKit({
      notifications: [commentMentioned] as const,
      database,
      providers: { email: fakeEmailProvider() },
    });
    await notify.upsertRecipient({
      id: "alice",
      tenantId: "t1",
      email: "alice@x.com",
    });
    await notify.upsertRecipient({
      id: "bob",
      tenantId: "t1",
      email: "bob@x.com",
    });
    await notify.send({
      recipientId: "bob",
      notificationId: "comment_mentioned",
      payload: makePayload(),
    });

    const handler = createHandler(notify, {
      identify: () => ({
        recipientId: "alice",
        tenantId: "t1",
        permissions: ["deliveries.list" as const],
      }),
    });

    const res = await handler(
      new Request(`${BASE}/deliveries?recipientId=bob`),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: Array<{ recipientId: string }> };
    for (const d of body.data) {
      expect(d.recipientId).toBe("alice");
    }
  });

  test("admin can use recipientId param to query other users", async () => {
    const database = memoryAdapter();
    const notify = createNotifyKit({
      notifications: [commentMentioned] as const,
      database,
      providers: { email: fakeEmailProvider() },
    });
    await notify.upsertRecipient({
      id: "alice",
      tenantId: "t1",
      email: "alice@x.com",
    });
    await notify.upsertRecipient({
      id: "bob",
      tenantId: "t1",
      email: "bob@x.com",
    });
    await notify.send({
      recipientId: "bob",
      notificationId: "comment_mentioned",
      payload: makePayload(),
    });

    const handler = createHandler(notify, {
      identify: () => ({
        recipientId: "alice",
        tenantId: "t1",
        permissions: ["admin" as const],
      }),
    });

    const res = await handler(
      new Request(`${BASE}/deliveries?recipientId=bob`),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: Array<{ recipientId: string }> };
    expect(body.data.length).toBeGreaterThan(0);
    for (const d of body.data) {
      expect(d.recipientId).toBe("bob");
    }
  });
});

describe("request rate limiting", () => {
  test("returns 429 when request limit is exceeded", async () => {
    const database = memoryAdapter();
    const notify = createNotifyKit({
      notifications: [commentMentioned] as const,
      database,
      providers: { email: fakeEmailProvider() },
    });
    await notify.upsertRecipient({ id: "alice" });

    const handler = createHandler(notify, {
      identify: () => "alice",
      requestRateLimit: { max: 3, windowMs: 60_000 },
    });

    for (let i = 0; i < 3; i++) {
      const res = await handler(new Request(`${BASE}/inbox`));
      expect(res.status).toBe(200);
    }

    const blocked = await handler(new Request(`${BASE}/inbox`));
    expect(blocked.status).toBe(429);
    const body = (await blocked.json()) as { error: string };
    expect(body.error).toBe("Too many requests");
  });

  test("rate limit is per-identity (different users have independent limits)", async () => {
    const database = memoryAdapter();
    const notify = createNotifyKit({
      notifications: [commentMentioned] as const,
      database,
      providers: { email: fakeEmailProvider() },
    });
    await notify.upsertRecipient({ id: "alice" });
    await notify.upsertRecipient({ id: "bob" });

    let currentUser = "alice";
    const handler = createHandler(notify, {
      identify: () => currentUser,
      requestRateLimit: { max: 2, windowMs: 60_000 },
    });

    await handler(new Request(`${BASE}/inbox`));
    await handler(new Request(`${BASE}/inbox`));
    const aliceBlocked = await handler(new Request(`${BASE}/inbox`));
    expect(aliceBlocked.status).toBe(429);

    currentUser = "bob";
    const bobOk = await handler(new Request(`${BASE}/inbox`));
    expect(bobOk.status).toBe(200);
  });

  test("rate limit does not apply to unauthenticated routes", async () => {
    const database = memoryAdapter();
    const notify = createNotifyKit({
      notifications: [commentMentioned] as const,
      database,
      providers: { email: fakeEmailProvider() },
    });
    const handler = createHandler(notify, {
      identify: () => null,
      requestRateLimit: { max: 1, windowMs: 60_000 },
    });

    const res1 = await handler(new Request(`${BASE}/notifications`));
    const res2 = await handler(new Request(`${BASE}/notifications`));
    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
  });

  test("rate limit applies to protected /notifications when protectNotifications is true", async () => {
    const database = memoryAdapter();
    const notify = createNotifyKit({
      notifications: [commentMentioned] as const,
      database,
      providers: { email: fakeEmailProvider() },
    });
    await notify.upsertRecipient({ id: "alice" });

    const handler = createHandler(notify, {
      identify: () => "alice",
      protectNotifications: true,
      requestRateLimit: { max: 2, windowMs: 60_000 },
    });

    const res1 = await handler(new Request(`${BASE}/notifications`));
    const res2 = await handler(new Request(`${BASE}/notifications`));
    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);

    const blocked = await handler(new Request(`${BASE}/notifications`));
    expect(blocked.status).toBe(429);
  });
});

describe("resolveScope error message opacity", () => {
  test("tenant mismatch error does not reveal the actual tenant", async () => {
    const database = memoryAdapter();
    const notify = createNotifyKit({
      notifications: [commentMentioned] as const,
      database,
      providers: { email: fakeEmailProvider() },
    });
    await notify.upsertRecipient({
      id: "alice",
      tenantId: "secret_tenant",
      email: "alice@x.com",
    });

    try {
      await notify.send({
        recipientId: "alice",
        tenantId: "wrong_tenant",
        notificationId: "comment_mentioned",
        payload: makePayload(),
      });
      expect.unreachable("should have thrown");
    } catch (err) {
      const message = (err as Error).message;
      expect(message).not.toContain("secret_tenant");
      expect(message).not.toContain("wrong_tenant");
      expect(message).toContain("does not belong to the specified tenant");
    }
  });
});

describe("inbound provider webhook route", () => {
  test("POST /webhooks/:provider returns 404 when no webhooks configured", async () => {
    const database = memoryAdapter();
    const notify = createNotifyKit({
      notifications: [commentMentioned] as const,
      database,
      providers: { email: fakeEmailProvider() },
    });
    const handler = createHandler(notify, { identify: () => "alice" });

    const res = await handler(
      new Request(`${BASE}/webhooks/resend`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "email.delivered" }),
      }),
    );
    expect(res.status).toBe(404);
  });

  test("POST /webhooks/:provider returns 401 when verifier rejects", async () => {
    const database = memoryAdapter();
    const notify = createNotifyKit({
      notifications: [commentMentioned] as const,
      database,
      providers: { email: fakeEmailProvider() },
    });
    const handler = createHandler(notify, {
      identify: () => "alice",
      webhooks: {
        resend: () => false,
      },
    });

    const res = await handler(
      new Request(`${BASE}/webhooks/resend`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "email.delivered" }),
      }),
    );
    expect(res.status).toBe(401);
  });

  test("POST /webhooks/:provider succeeds when verifier accepts", async () => {
    const database = memoryAdapter();
    const notify = createNotifyKit({
      notifications: [commentMentioned] as const,
      database,
      providers: { email: fakeEmailProvider() },
    });
    const events: Array<{ provider: string; payload: unknown }> = [];
    const handler = createHandler(notify, {
      identify: () => "alice",
      webhooks: {
        resend: (_headers, body) => body.includes("email.delivered"),
      },
      onWebhookEvent: (provider, payload) => {
        events.push({ provider, payload });
      },
    });

    const res = await handler(
      new Request(`${BASE}/webhooks/resend`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "email.delivered", id: "msg_123" }),
      }),
    );
    expect(res.status).toBe(200);
    expect(events).toHaveLength(1);
    expect(events[0]!.provider).toBe("resend");
    expect((events[0]!.payload as Record<string, unknown>).type).toBe(
      "email.delivered",
    );
  });

  test("POST /webhooks/:provider returns 404 for unknown provider", async () => {
    const database = memoryAdapter();
    const notify = createNotifyKit({
      notifications: [commentMentioned] as const,
      database,
      providers: { email: fakeEmailProvider() },
    });
    const handler = createHandler(notify, {
      identify: () => "alice",
      webhooks: {
        resend: () => true,
      },
    });

    const res = await handler(
      new Request(`${BASE}/webhooks/unknown`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      }),
    );
    expect(res.status).toBe(404);
  });

  test("webhook route bypasses identify — no auth required", async () => {
    const database = memoryAdapter();
    const notify = createNotifyKit({
      notifications: [commentMentioned] as const,
      database,
      providers: { email: fakeEmailProvider() },
    });
    const events: unknown[] = [];
    const handler = createHandler(notify, {
      identify: () => null,
      webhooks: {
        resend: () => true,
      },
      onWebhookEvent: (_provider, payload) => {
        events.push(payload);
      },
    });

    const res = await handler(
      new Request(`${BASE}/webhooks/resend`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ event: "bounce" }),
      }),
    );
    expect(res.status).toBe(200);
    expect(events).toHaveLength(1);
  });

  test("onWebhookEvent error returns 500 without crashing", async () => {
    const database = memoryAdapter();
    const notify = createNotifyKit({
      notifications: [commentMentioned] as const,
      database,
      providers: { email: fakeEmailProvider() },
    });
    const handler = createHandler(notify, {
      identify: () => "alice",
      webhooks: {
        resend: () => true,
      },
      onWebhookEvent: () => {
        throw new Error("handler blew up");
      },
    });

    const res = await handler(
      new Request(`${BASE}/webhooks/resend`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "email.bounced" }),
      }),
    );
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Internal error");
  });

  test("verifier that throws returns 401 instead of crashing", async () => {
    const database = memoryAdapter();
    const notify = createNotifyKit({
      notifications: [commentMentioned] as const,
      database,
      providers: { email: fakeEmailProvider() },
    });
    const handler = createHandler(notify, {
      identify: () => "alice",
      webhooks: {
        resend: () => {
          throw new Error("missing signature header");
        },
      },
    });

    const res = await handler(
      new Request(`${BASE}/webhooks/resend`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "email.delivered" }),
      }),
    );
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Unauthorized");
  });

  test("verifier receives headers (not full Request) and raw body", async () => {
    const database = memoryAdapter();
    const notify = createNotifyKit({
      notifications: [commentMentioned] as const,
      database,
      providers: { email: fakeEmailProvider() },
    });
    let receivedHeaders: Headers | null = null;
    let receivedBody: string | null = null;
    const handler = createHandler(notify, {
      identify: () => "alice",
      webhooks: {
        resend: (headers, body) => {
          receivedHeaders = headers;
          receivedBody = body;
          return headers.get("x-webhook-secret") === "s3cret";
        },
      },
    });

    const res = await handler(
      new Request(`${BASE}/webhooks/resend`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-webhook-secret": "s3cret",
        },
        body: JSON.stringify({ event: "delivered" }),
      }),
    );
    expect(res.status).toBe(200);
    expect(receivedHeaders).toBeInstanceOf(Headers);
    expect(receivedHeaders!.get("x-webhook-secret")).toBe("s3cret");
    expect(receivedBody).toBe(JSON.stringify({ event: "delivered" }));
  });
});

describe("authorize hook + admin scoping on deliveries", () => {
  test("authorize granting admin allows recipientId param for non-admin identity", async () => {
    const database = memoryAdapter();
    const notify = createNotifyKit({
      notifications: [commentMentioned] as const,
      database,
      providers: { email: fakeEmailProvider() },
    });
    await notify.upsertRecipient({
      id: "support-agent",
      tenantId: "t1",
      email: "support@x.com",
    });
    await notify.upsertRecipient({
      id: "bob",
      tenantId: "t1",
      email: "bob@x.com",
    });
    await notify.send({
      recipientId: "bob",
      notificationId: "comment_mentioned",
      payload: makePayload(),
    });

    const handler = createHandler(notify, {
      identify: () => ({
        recipientId: "support-agent",
        tenantId: "t1",
      }),
      authorize: (_ctx, permission) => {
        return permission === "deliveries.list" || permission === "admin";
      },
    });

    const res = await handler(
      new Request(`${BASE}/deliveries?recipientId=bob`),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: Array<{ recipientId: string }> };
    expect(body.data.length).toBeGreaterThan(0);
    for (const d of body.data) {
      expect(d.recipientId).toBe("bob");
    }
  });

  test("authorize granting deliveries.list but not admin restricts to own deliveries", async () => {
    const database = memoryAdapter();
    const notify = createNotifyKit({
      notifications: [commentMentioned] as const,
      database,
      providers: { email: fakeEmailProvider() },
    });
    await notify.upsertRecipient({
      id: "support-agent",
      tenantId: "t1",
      email: "support@x.com",
    });
    await notify.upsertRecipient({
      id: "bob",
      tenantId: "t1",
      email: "bob@x.com",
    });
    await notify.send({
      recipientId: "bob",
      notificationId: "comment_mentioned",
      payload: makePayload(),
    });

    const handler = createHandler(notify, {
      identify: () => ({
        recipientId: "support-agent",
        tenantId: "t1",
      }),
      authorize: (_ctx, permission) => {
        return permission === "deliveries.list";
      },
    });

    const res = await handler(
      new Request(`${BASE}/deliveries?recipientId=bob`),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: Array<{ recipientId: string }> };
    for (const d of body.data) {
      expect(d.recipientId).toBe("support-agent");
    }
  });

  test("authorize denying admin falls back correctly even with admin in permissions", async () => {
    const database = memoryAdapter();
    const notify = createNotifyKit({
      notifications: [commentMentioned] as const,
      database,
      providers: { email: fakeEmailProvider() },
    });
    await notify.upsertRecipient({
      id: "alice",
      tenantId: "t1",
      email: "alice@x.com",
    });
    await notify.upsertRecipient({
      id: "bob",
      tenantId: "t1",
      email: "bob@x.com",
    });
    await notify.send({
      recipientId: "bob",
      notificationId: "comment_mentioned",
      payload: makePayload(),
    });

    const handler = createHandler(notify, {
      identify: () => ({
        recipientId: "alice",
        tenantId: "t1",
        permissions: ["admin" as const],
      }),
      authorize: (_ctx, permission) => {
        if (permission === "admin") return false;
        return permission === "deliveries.list";
      },
    });

    const res = await handler(
      new Request(`${BASE}/deliveries?recipientId=bob`),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: Array<{ recipientId: string }> };
    for (const d of body.data) {
      expect(d.recipientId).toBe("alice");
    }
  });
});

describe("organizationId alias", () => {
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
      organizationId: "org_1",
      email: "alice@x.com",
    });
  });

  test("upsertRecipient stores organizationId as tenantId", async () => {
    const r = await database.recipients.findById("alice");
    expect(r!.tenantId).toBe("org_1");
  });

  test("send() accepts organizationId in place of tenantId", async () => {
    const result = await notify.send({
      recipientId: "alice",
      organizationId: "org_1",
      notificationId: "comment_mentioned",
      payload: makePayload(),
    });
    expect(result.notification!.tenantId).toBe("org_1");
  });

  test("handler identify() normalizes organizationId to tenantId", async () => {
    await database.inbox.create({
      notificationRecordId: "n1",
      recipientId: "alice",
      tenantId: "org_1",
      notificationId: "comment_mentioned",
      title: "Test",
    });
    const handler = createHandler(notify, {
      identify: () => ({ recipientId: "alice", organizationId: "org_1" }),
    });
    const res = await handler(new Request(`${BASE}/inbox`));
    const body = (await res.json()) as { data: unknown[] };
    expect(body.data).toHaveLength(1);
  });

  test("preferences.get accepts organizationId", async () => {
    await notify.preferences.update({
      recipientId: "alice",
      organizationId: "org_1",
      notificationId: "comment_mentioned",
      channels: { email: false },
    });
    const pref = await notify.preferences.get({
      recipientId: "alice",
      organizationId: "org_1",
      notificationId: "comment_mentioned",
    });
    expect(pref?.channels.email).toBe(false);
  });

  test("tenantId takes precedence over organizationId when both are set", async () => {
    await notify.upsertRecipient({
      id: "bob",
      tenantId: "t_explicit",
      email: "bob@x.com",
    });
    const result = await notify.send({
      recipientId: "bob",
      tenantId: "t_explicit",
      organizationId: "should_be_ignored",
      notificationId: "comment_mentioned",
      payload: makePayload(),
    });
    expect(result.notification!.tenantId).toBe("t_explicit");
  });
});

describe("getGlobal / getCategory scope validation", () => {
  const categorized = notification({
    id: "social_update",
    category: "social",
    payload: { actorName: "string", postTitle: "string", postUrl: "string" },
    channels: [
      inbox({ title: "{{actorName}}", body: "{{postTitle}}", actionUrl: "{{postUrl}}" }),
      email({ subject: "{{actorName}}", body: "{{postTitle}}" }),
    ],
  });

  let notify: NotifyKit<readonly [typeof categorized]>;

  beforeEach(async () => {
    const database = memoryAdapter();
    notify = createNotifyKit({
      notifications: [categorized] as const,
      database,
      providers: { email: fakeEmailProvider() },
    });
    await notify.upsertRecipient({ id: "alice", tenantId: "tA", email: "a@x.com" });
    await notify.upsertRecipient({ id: "bob", tenantId: "tB", email: "b@x.com" });
  });

  test("getGlobal validates recipient tenant scope", async () => {
    await notify.preferences.updateGlobal({
      recipientId: "alice",
      tenantId: "tA",
      channels: { email: false },
    });
    const wrongTenant = notify.preferences.getGlobal({
      recipientId: "alice",
      tenantId: "tB",
    });
    await expect(wrongTenant).rejects.toThrow(/does not belong/);
  });

  test("getGlobal returns null for unknown recipient", async () => {
    const result = await notify.preferences.getGlobal({
      recipientId: "ghost",
    });
    expect(result).toBeNull();
  });

  test("getCategory validates recipient tenant scope", async () => {
    const wrongTenant = notify.preferences.getCategory({
      recipientId: "alice",
      tenantId: "tB",
      category: "social",
    });
    await expect(wrongTenant).rejects.toThrow(/does not belong/);
  });

  test("getCategory returns null for unknown recipient", async () => {
    const result = await notify.preferences.getCategory({
      recipientId: "ghost",
      category: "social",
    });
    expect(result).toBeNull();
  });
});

describe("cross-tenant inbox isolation", () => {
  let database: MemoryAdapter;
  let notify: NotifyKit<readonly [typeof commentMentioned]>;

  beforeEach(async () => {
    database = memoryAdapter();
    notify = createNotifyKit({
      notifications: [commentMentioned] as const,
      database,
      providers: { email: fakeEmailProvider() },
    });
    await notify.upsertRecipient({ id: "alice", tenantId: "orgA", email: "a@x.com" });
    await notify.upsertRecipient({ id: "bob", tenantId: "orgB", email: "b@x.com" });

    await notify.send({
      recipientId: "alice",
      tenantId: "orgA",
      notificationId: "comment_mentioned",
      payload: makePayload(),
    });
    await notify.send({
      recipientId: "bob",
      tenantId: "orgB",
      notificationId: "comment_mentioned",
      payload: makePayload(),
    });
  });

  test("inbox.list scoped to orgA returns only orgA items", async () => {
    const items = await notify.inbox.list("alice", { tenantId: "orgA" });
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((i) => i.tenantId === "orgA")).toBe(true);
  });

  test("inbox.list scoped to orgB returns only orgB items", async () => {
    const items = await notify.inbox.list("bob", { tenantId: "orgB" });
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((i) => i.tenantId === "orgB")).toBe(true);
  });

  test("inbox.list with wrong tenant returns nothing", async () => {
    const items = await notify.inbox.list("alice", { tenantId: "orgB" });
    expect(items).toHaveLength(0);
  });

  test("deliveries.list scoped to orgA returns only orgA records", async () => {
    const deliveries = await notify.deliveries.list("alice", { tenantId: "orgA" });
    expect(deliveries.length).toBeGreaterThan(0);
    expect(deliveries.every((d) => d.tenantId === "orgA")).toBe(true);
  });

  test("deliveries.list with wrong tenant returns nothing", async () => {
    const deliveries = await notify.deliveries.list("alice", { tenantId: "orgB" });
    expect(deliveries).toHaveLength(0);
  });

  test("preferences.list scoped to tenant returns only that tenant's preferences", async () => {
    await notify.preferences.update({
      recipientId: "alice",
      tenantId: "orgA",
      notificationId: "comment_mentioned",
      channels: { email: false },
    });
    await notify.preferences.update({
      recipientId: "bob",
      tenantId: "orgB",
      notificationId: "comment_mentioned",
      channels: { email: true },
    });

    const prefsA = await notify.preferences.list("alice", { tenantId: "orgA" });
    expect(prefsA).toHaveLength(1);
    expect(prefsA[0].channels.email).toBe(false);

    const prefsB = await notify.preferences.list("bob", { tenantId: "orgB" });
    expect(prefsB).toHaveLength(1);
    expect(prefsB[0].channels.email).toBe(true);

    const wrongScope = await notify.preferences.list("alice", { tenantId: "orgB" });
    expect(wrongScope).toHaveLength(0);
  });
});

describe("organizationId normalization in scope-taking APIs", () => {
  let database: MemoryAdapter;
  let notify: NotifyKit<readonly [typeof commentMentioned]>;

  beforeEach(async () => {
    database = memoryAdapter();
    notify = createNotifyKit({
      notifications: [commentMentioned] as const,
      database,
      providers: { email: fakeEmailProvider() },
    });
    await notify.upsertRecipient({ id: "alice", tenantId: "org_1", email: "a@x.com" });
    await notify.send({
      recipientId: "alice",
      tenantId: "org_1",
      notificationId: "comment_mentioned",
      payload: makePayload(),
    });
  });

  test("inbox.list normalizes organizationId to tenantId", async () => {
    const items = await notify.inbox.list("alice", { organizationId: "org_1" });
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((i) => i.tenantId === "org_1")).toBe(true);
  });

  test("inbox.list with wrong organizationId returns nothing", async () => {
    const items = await notify.inbox.list("alice", { organizationId: "org_wrong" });
    expect(items).toHaveLength(0);
  });

  test("inbox.unreadCount normalizes organizationId", async () => {
    const count = await notify.inbox.unreadCount("alice", { organizationId: "org_1" });
    expect(count).toBeGreaterThan(0);

    const wrongCount = await notify.inbox.unreadCount("alice", { organizationId: "org_wrong" });
    expect(wrongCount).toBe(0);
  });

  test("deliveries.list normalizes organizationId", async () => {
    const deliveries = await notify.deliveries.list("alice", { organizationId: "org_1" });
    expect(deliveries.length).toBeGreaterThan(0);

    const wrongDeliveries = await notify.deliveries.list("alice", { organizationId: "org_wrong" });
    expect(wrongDeliveries).toHaveLength(0);
  });

  test("preferences.list normalizes organizationId", async () => {
    await notify.preferences.update({
      recipientId: "alice",
      tenantId: "org_1",
      notificationId: "comment_mentioned",
      channels: { email: false },
    });

    const prefs = await notify.preferences.list("alice", { organizationId: "org_1" });
    expect(prefs).toHaveLength(1);
    expect(prefs[0].channels.email).toBe(false);

    const wrongPrefs = await notify.preferences.list("alice", { organizationId: "org_wrong" });
    expect(wrongPrefs).toHaveLength(0);
  });
});

describe("recipient tenant immutability", () => {
  test("upsertRecipient rejects tenant reassignment", async () => {
    const database = memoryAdapter();
    const notify = createNotifyKit({
      notifications: [commentMentioned] as const,
      database,
      providers: { email: fakeEmailProvider() },
    });
    await notify.upsertRecipient({ id: "alice", tenantId: "orgA" });

    await expect(
      notify.upsertRecipient({ id: "alice", tenantId: "orgB" }),
    ).rejects.toThrow(/Cannot reassign to tenant/);
  });

  test("upsertRecipient allows re-upserting same tenant", async () => {
    const database = memoryAdapter();
    const notify = createNotifyKit({
      notifications: [commentMentioned] as const,
      database,
      providers: { email: fakeEmailProvider() },
    });
    await notify.upsertRecipient({ id: "alice", tenantId: "orgA", email: "old@x.com" });

    const updated = await notify.upsertRecipient({ id: "alice", tenantId: "orgA", email: "new@x.com" });
    expect(updated.email).toBe("new@x.com");
    expect(updated.tenantId).toBe("orgA");
  });

  test("upsertRecipient allows updating non-tenant fields without specifying tenant", async () => {
    const database = memoryAdapter();
    const notify = createNotifyKit({
      notifications: [commentMentioned] as const,
      database,
      providers: { email: fakeEmailProvider() },
    });
    await notify.upsertRecipient({ id: "alice", tenantId: "orgA", email: "old@x.com" });

    const updated = await notify.upsertRecipient({ id: "alice", email: "new@x.com" });
    expect(updated.email).toBe("new@x.com");
    expect(updated.tenantId).toBe("orgA");
  });
});

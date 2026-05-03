import { beforeEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import {
  channel,
  createNotifyKit,
  fakeEmailProvider,
  notification,
} from "notifykit";

import { createSqliteTables, drizzleSqliteAdapter } from "../src/index.js";

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

const welcome = notification({
  id: "user_welcome",
  payload: { name: "string" },
  channels: [inbox({ title: "Welcome, {{name}}" })],
});

async function buildKit() {
  const sqlite = new Database(":memory:");
  const db = drizzle(sqlite);
  await createSqliteTables(db);

  const adapter = drizzleSqliteAdapter(db);
  const provider = fakeEmailProvider();
  const notify = createNotifyKit({
    notifications: [commentMentioned, welcome] as const,
    database: adapter,
    providers: { email: provider },
  });

  return { notify, provider, adapter, db, sqlite };
}

describe("drizzleSqliteAdapter", () => {
  let ctx: Awaited<ReturnType<typeof buildKit>>;

  beforeEach(async () => {
    ctx = await buildKit();
  });

  test("createSqliteTables is idempotent", async () => {
    // running again on same db should not throw
    await createSqliteTables(ctx.db);
    await ctx.notify.upsertRecipient({ id: "user_1" });
  });

  test("upsertRecipient creates then updates", async () => {
    const created = await ctx.notify.upsertRecipient({
      id: "user_1",
      email: "a@example.com",
      name: "Alice",
    });
    expect(created.email).toBe("a@example.com");

    const updated = await ctx.notify.upsertRecipient({
      id: "user_1",
      name: "Alice B.",
    });
    expect(updated.name).toBe("Alice B.");
    expect(updated.email).toBe("a@example.com");
  });

  test("end-to-end send with inbox + email persists records", async () => {
    await ctx.notify.upsertRecipient({
      id: "user_1",
      email: "a@example.com",
      name: "Alice",
    });
    const result = await ctx.notify.send({
      recipientId: "user_1",
      notificationId: "comment_mentioned",
      payload: {
        actorName: "Rey",
        postTitle: "Launch Plan",
        postUrl: "/posts/123",
      },
    });
    expect(result.inboxItems).toHaveLength(1);
    expect(result.deliveries).toHaveLength(1);
    expect(result.deliveries[0]!.status).toBe("sent");
    expect(result.deliveries[0]!.providerMessageId).toBeDefined();
    expect(ctx.provider.sent).toHaveLength(1);

    const items = await ctx.notify.inbox.list("user_1");
    expect(items).toHaveLength(1);
    expect(items[0]!.title).toBe("Rey mentioned you");

    const deliveries = await ctx.notify.deliveries.list("user_1");
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]!.sentAt).toBeInstanceOf(Date);
  });

  test("markRead persists across reads", async () => {
    await ctx.notify.upsertRecipient({ id: "user_1" });
    const result = await ctx.notify.send({
      recipientId: "user_1",
      notificationId: "user_welcome",
      payload: { name: "Alice" },
    });
    const inboxItemId = result.inboxItems[0]!.id;

    const readResult = await ctx.notify.inbox.markReadForRecipient(inboxItemId, "user_1");
    expect(readResult.status).toBe("marked");
    const items = await ctx.notify.inbox.list("user_1");
    expect(items[0]!.readAt).toBeInstanceOf(Date);
  });

  test("markReadForRecipient refuses another recipient without updating", async () => {
    await ctx.notify.upsertRecipient({ id: "user_1" });
    await ctx.notify.upsertRecipient({ id: "user_2" });
    const result = await ctx.notify.send({
      recipientId: "user_1",
      notificationId: "user_welcome",
      payload: { name: "Alice" },
    });
    const inboxItemId = result.inboxItems[0]!.id;

    const forbidden = await ctx.adapter.inbox.markReadForRecipient(
      inboxItemId,
      "user_2",
    );
    expect(forbidden.status).toBe("forbidden");

    let items = await ctx.notify.inbox.list("user_1");
    expect(items[0]!.readAt).toBeNull();

    const missing = await ctx.adapter.inbox.markReadForRecipient(
      "does_not_exist",
      "user_1",
    );
    expect(missing.status).toBe("not_found");

    const marked = await ctx.adapter.inbox.markReadForRecipient(
      inboxItemId,
      "user_1",
    );
    expect(marked.status).toBe("marked");
    items = await ctx.notify.inbox.list("user_1");
    expect(items[0]!.readAt).toBeInstanceOf(Date);
  });

  test("delivery.failed persists error text after retries exhausted", async () => {
    const sqlite = new Database(":memory:");
    const db = drizzle(sqlite);
    await createSqliteTables(db);
    const alwaysFail = {
      id: "always-fail",
      async send() {
        throw new Error("simulated failure");
      },
    };
    const notify = createNotifyKit({
      notifications: [commentMentioned, welcome] as const,
      database: drizzleSqliteAdapter(db),
      providers: { email: alwaysFail },
      retry: { maxAttempts: 2, delayMs: () => 0 },
    });
    await notify.upsertRecipient({
      id: "user_1",
      email: "a@example.com",
    });
    const result = await notify.send({
      recipientId: "user_1",
      notificationId: "comment_mentioned",
      payload: {
        actorName: "Rey",
        postTitle: "Launch Plan",
        postUrl: "/posts/123",
      },
    });
    expect(result.deliveries[0]!.status).toBe("failed");
    expect(result.deliveries[0]!.error).toMatch(/simulated failure/);
    expect(result.deliveries[0]!.attempts).toBe(2);

    const refetched = await notify.deliveries.list("user_1");
    expect(refetched[0]!.status).toBe("failed");
    expect(refetched[0]!.failedAt).toBeInstanceOf(Date);
  });

  test("preferences opt-out persists and skips email", async () => {
    await ctx.notify.upsertRecipient({
      id: "user_1",
      email: "a@example.com",
    });
    await ctx.notify.preferences.update({
      recipientId: "user_1",
      notificationId: "comment_mentioned",
      channels: { email: false },
    });

    const pref = await ctx.notify.preferences.get({
      recipientId: "user_1",
      notificationId: "comment_mentioned",
    });
    expect(pref?.channels.email).toBe(false);

    const result = await ctx.notify.send({
      recipientId: "user_1",
      notificationId: "comment_mentioned",
      payload: {
        actorName: "Rey",
        postTitle: "Launch Plan",
        postUrl: "/posts/123",
      },
    });
    expect(result.skippedChannels).toEqual(["email"]);
    expect(result.deliveries).toHaveLength(0);
    expect(ctx.provider.sent).toHaveLength(0);
  });

  test("preferences.upsert merges channels across calls", async () => {
    await ctx.notify.upsertRecipient({ id: "user_1" });
    await ctx.notify.preferences.update({
      recipientId: "user_1",
      notificationId: "comment_mentioned",
      channels: { email: false },
    });
    await ctx.notify.preferences.update({
      recipientId: "user_1",
      notificationId: "comment_mentioned",
      channels: { inbox: true },
    });
    const pref = await ctx.notify.preferences.get({
      recipientId: "user_1",
      notificationId: "comment_mentioned",
    });
    expect(pref?.channels).toEqual({ email: false, inbox: true });
  });

  test("deliveries.list with no recipient returns all", async () => {
    await ctx.notify.upsertRecipient({
      id: "user_1",
      email: "a@example.com",
    });
    await ctx.notify.upsertRecipient({
      id: "user_2",
      email: "b@example.com",
    });
    for (const id of ["user_1", "user_2"]) {
      await ctx.notify.send({
        recipientId: id,
        notificationId: "comment_mentioned",
        payload: {
          actorName: "Rey",
          postTitle: "Launch Plan",
          postUrl: "/posts/1",
        },
      });
    }
    const all = await ctx.notify.deliveries.list();
    expect(all).toHaveLength(2);
  });

  test("quietHours persists on the recipient row", async () => {
    const sqlite = new Database(":memory:");
    const db = drizzle(sqlite);
    await createSqliteTables(db);
    const inboxCh = channel.inbox();
    const def = notification({
      id: "alert",
      payload: { msg: "string" },
      channels: [inboxCh({ title: "{{msg}}" })],
    });
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: drizzleSqliteAdapter(db),
      providers: { email: fakeEmailProvider() },
    });
    await notify.upsertRecipient({
      id: "u1",
      email: "u@x.com",
      quietHours: { start: "22:00", end: "08:00", timezone: "UTC" },
    });

    const raw = sqlite
      .query("SELECT quiet_hours FROM notifykit_recipients WHERE id = ?")
      .get("u1") as { quiet_hours: string };
    expect(JSON.parse(raw.quiet_hours)).toEqual({
      start: "22:00",
      end: "08:00",
      timezone: "UTC",
    });

    await notify.upsertRecipient({ id: "u1", quietHours: null });
    const raw2 = sqlite
      .query("SELECT quiet_hours FROM notifykit_recipients WHERE id = ?")
      .get("u1") as { quiet_hours: null | string };
    expect(raw2.quiet_hours).toBeNull();
  });

  test("scheduled send is persisted and flushed via flushScheduledSends", async () => {
    const sqlite = new Database(":memory:");
    const db = drizzle(sqlite);
    await createSqliteTables(db);
    const emailCh = channel.email();
    const inboxCh = channel.inbox();
    const def = notification({
      id: "alert",
      payload: { msg: "string" },
      channels: [
        inboxCh({ title: "{{msg}}" }),
        emailCh({ subject: "{{msg}}", body: "{{msg}}" }),
      ],
    });
    const provider = fakeEmailProvider();
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: drizzleSqliteAdapter(db),
      providers: { email: provider },
    });

    // Quiet hours that contain "now" (in UTC).
    const now = new Date();
    const hours = now.getUTCHours();
    const minutes = now.getUTCMinutes();
    const pad = (n: number) => String(n).padStart(2, "0");
    const start = `${pad((hours + 23) % 24)}:${pad(minutes)}`;
    const end = `${pad((hours + 1) % 24)}:${pad(minutes)}`;

    await notify.upsertRecipient({
      id: "u1",
      email: "u@x.com",
      quietHours: { start, end, timezone: "UTC" },
    });

    await notify.send({
      recipientId: "u1",
      notificationId: "alert",
      payload: { msg: "hi" },
    });

    const pending = sqlite
      .query("SELECT COUNT(*) as n FROM notifykit_scheduled_sends")
      .get() as { n: number };
    expect(pending.n).toBe(1);
    expect(provider.sent).toEqual([]);

    await notify.flushScheduledSends();

    const after = sqlite
      .query("SELECT COUNT(*) as n FROM notifykit_scheduled_sends")
      .get() as { n: number };
    expect(after.n).toBe(0);
    expect(provider.sent).toHaveLength(1);
  });

  test("fallback inbox fires when email terminally fails", async () => {
    const sqlite = new Database(":memory:");
    const db = drizzle(sqlite);
    await createSqliteTables(db);
    const emailCh = channel.email();
    const inboxCh = channel.inbox();
    const def = notification({
      id: "reset",
      payload: { link: "string" },
      channels: [emailCh({ subject: "Reset", body: "{{link}}" })],
      fallback: inboxCh({ title: "Fallback: {{link}}" }),
    });
    const alwaysFail = {
      id: "alwaysFail",
      async send() {
        throw new Error("nope");
      },
    };
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: drizzleSqliteAdapter(db),
      providers: { email: alwaysFail },
      retry: { maxAttempts: 1, delayMs: () => 0 },
    });
    await notify.upsertRecipient({ id: "u1", email: "u@x.com" });
    await notify.send({
      recipientId: "u1",
      notificationId: "reset",
      payload: { link: "/r/1" },
    });
    const items = await notify.inbox.list("u1");
    expect(items).toHaveLength(1);
    expect(items[0]!.title).toBe("Fallback: /r/1");
  });

  test("rate limit drops sends over max, persists events, prunes stale rows", async () => {
    const sqlite = new Database(":memory:");
    const db = drizzle(sqlite);
    await createSqliteTables(db);

    const inboxCh = channel.inbox();
    const def = notification({
      id: "limited",
      payload: { msg: "string" },
      channels: [inboxCh({ title: "{{msg}}" })],
      rateLimit: { max: 2, windowMs: 30 },
    });

    const events: string[] = [];
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: drizzleSqliteAdapter(db),
      providers: { email: fakeEmailProvider() },
      on: {
        "notification.rate_limited": ({ recipientId }) =>
          void events.push(recipientId),
      },
    });
    await notify.upsertRecipient({ id: "u1" });

    for (const msg of ["a", "b", "c", "d"]) {
      await notify.send({
        recipientId: "u1",
        notificationId: "limited",
        payload: { msg },
      });
    }

    const items = await notify.inbox.list("u1");
    expect(items).toHaveLength(2);
    expect(events).toEqual(["u1", "u1"]);

    const rateLimitsCount = sqlite
      .query("SELECT COUNT(*) as n FROM notifykit_rate_limit_events")
      .get() as { n: number };
    expect(rateLimitsCount.n).toBe(2);

    // Wait past the window, send one more: aged rows get pruned during count().
    await new Promise((r) => setTimeout(r, 40));
    await notify.send({
      recipientId: "u1",
      notificationId: "limited",
      payload: { msg: "e" },
    });
    const afterPrune = sqlite
      .query("SELECT COUNT(*) as n FROM notifykit_rate_limit_events")
      .get() as { n: number };
    expect(afterPrune.n).toBe(1);
  });

  test("digest buffer persists and flushes merged payload", async () => {
    const sqlite = new Database(":memory:");
    const db = drizzle(sqlite);
    await createSqliteTables(db);

    const inboxCh = channel.inbox();
    const digested = notification({
      id: "digested",
      payload: { actorName: "string", count: "number" },
      channels: [
        inboxCh({
          title: "{{count}} updates",
          body: "Latest from {{actorName}}",
        }),
      ],
      digest: {
        windowMs: 30,
        render: ({ payloads }) => ({
          actorName: payloads[payloads.length - 1]!.actorName,
          count: payloads.length,
        }),
      },
    });

    const notify = createNotifyKit({
      notifications: [digested] as const,
      database: drizzleSqliteAdapter(db),
      providers: { email: fakeEmailProvider() },
    });
    await notify.upsertRecipient({ id: "u1" });

    for (const name of ["Alice", "Bob", "Carol"]) {
      await notify.send({
        recipientId: "u1",
        notificationId: "digested",
        payload: { actorName: name, count: 1 },
      });
    }

    const buffered = sqlite
      .query("SELECT COUNT(*) as n FROM notifykit_digest_buffers")
      .get() as { n: number };
    expect(buffered.n).toBe(1);

    await notify.drain();

    const flushed = sqlite
      .query("SELECT COUNT(*) as n FROM notifykit_digest_buffers")
      .get() as { n: number };
    expect(flushed.n).toBe(0);

    const items = await notify.inbox.list("u1");
    expect(items).toHaveLength(1);
    expect(items[0]!.title).toBe("3 updates");
    expect(items[0]!.body).toBe("Latest from Carol");
  });

  test("invalid digest render preserves the buffered row", async () => {
    const sqlite = new Database(":memory:");
    const db = drizzle(sqlite);
    await createSqliteTables(db);

    const inboxCh = channel.inbox();
    const broken = notification({
      id: "broken_digest",
      payload: { count: "number" },
      channels: [inboxCh({ title: "{{count}}" })],
      digest: {
        windowMs: 30,
        render: () => ({ count: "nope" as unknown as number }),
      },
    });

    const notify = createNotifyKit({
      notifications: [broken] as const,
      database: drizzleSqliteAdapter(db),
      providers: { email: fakeEmailProvider() },
    });
    await notify.upsertRecipient({ id: "u1" });
    await notify.send({
      recipientId: "u1",
      notificationId: "broken_digest",
      payload: { count: 1 },
    });

    await expect(notify.flushDigests()).rejects.toThrow(
      /expected "count" to be number/,
    );

    const buffered = sqlite
      .query("SELECT payloads FROM notifykit_digest_buffers")
      .get() as { payloads: string };
    expect(JSON.parse(buffered.payloads)).toEqual([{ count: 1 }]);
    const items = await notify.inbox.list("u1");
    expect(items).toEqual([]);
  });

  test("JSON payload round-trips through SQLite", async () => {
    await ctx.notify.upsertRecipient({
      id: "user_1",
      email: "a@example.com",
    });
    const result = await ctx.notify.send({
      recipientId: "user_1",
      notificationId: "comment_mentioned",
      payload: {
        actorName: "Rey ✨",
        postTitle: "Launch \"Plan\"",
        postUrl: "/posts/123",
      },
    });
    expect(result.notification.payload).toEqual({
      actorName: "Rey ✨",
      postTitle: 'Launch "Plan"',
      postUrl: "/posts/123",
    });
  });

  test("unreadCount returns count, decrements after markRead", async () => {
    await ctx.notify.upsertRecipient({ id: "user_1" });
    await ctx.notify.send({
      recipientId: "user_1",
      notificationId: "user_welcome",
      payload: { name: "Alice" },
    });
    await ctx.notify.send({
      recipientId: "user_1",
      notificationId: "user_welcome",
      payload: { name: "Bob" },
    });

    expect(await ctx.notify.inbox.unreadCount("user_1")).toBe(2);

    const items = await ctx.notify.inbox.list("user_1");
    await ctx.notify.inbox.markReadForRecipient(items[0]!.id, "user_1");

    expect(await ctx.notify.inbox.unreadCount("user_1")).toBe(1);
  });

  test("markAllRead marks all and is idempotent", async () => {
    await ctx.notify.upsertRecipient({ id: "user_1" });
    await ctx.notify.send({
      recipientId: "user_1",
      notificationId: "user_welcome",
      payload: { name: "Alice" },
    });
    await ctx.notify.send({
      recipientId: "user_1",
      notificationId: "user_welcome",
      payload: { name: "Bob" },
    });

    const count = await ctx.notify.inbox.markAllRead("user_1");
    expect(count).toBe(2);

    const items = await ctx.notify.inbox.list("user_1");
    for (const item of items) {
      expect(item.readAt).toBeInstanceOf(Date);
    }

    expect(await ctx.notify.inbox.markAllRead("user_1")).toBe(0);
  });

  test("archive hides from default list, unarchive restores", async () => {
    await ctx.notify.upsertRecipient({ id: "user_1" });
    const result = await ctx.notify.send({
      recipientId: "user_1",
      notificationId: "user_welcome",
      payload: { name: "Alice" },
    });
    const itemId = result.inboxItems[0]!.id;

    const archived = await ctx.adapter.inbox.archiveForRecipient(itemId, "user_1");
    expect(archived.status).toBe("ok");

    expect(await ctx.notify.inbox.list("user_1")).toHaveLength(0);
    expect(await ctx.notify.inbox.list("user_1", undefined, { archived: true })).toHaveLength(1);

    const unarchived = await ctx.adapter.inbox.unarchiveForRecipient(itemId, "user_1");
    expect(unarchived.status).toBe("ok");
    if (unarchived.status === "ok") {
      expect(unarchived.item.archivedAt).toBeNull();
    }

    expect(await ctx.notify.inbox.list("user_1")).toHaveLength(1);
  });

  test("deleteForRecipient hard-deletes an inbox item", async () => {
    await ctx.notify.upsertRecipient({ id: "user_1" });
    const result = await ctx.notify.send({
      recipientId: "user_1",
      notificationId: "user_welcome",
      payload: { name: "Alice" },
    });
    const itemId = result.inboxItems[0]!.id;

    const deleted = await ctx.adapter.inbox.deleteForRecipient(itemId, "user_1");
    expect(deleted.status).toBe("deleted");

    expect(await ctx.notify.inbox.list("user_1")).toHaveLength(0);
    expect(await ctx.notify.inbox.list("user_1", undefined, { archived: true })).toHaveLength(0);
  });

  test("archive/unarchive/delete refuse wrong recipient and return not_found for missing", async () => {
    await ctx.notify.upsertRecipient({ id: "user_1" });
    await ctx.notify.upsertRecipient({ id: "user_2" });
    const result = await ctx.notify.send({
      recipientId: "user_1",
      notificationId: "user_welcome",
      payload: { name: "Alice" },
    });
    const itemId = result.inboxItems[0]!.id;

    expect((await ctx.adapter.inbox.archiveForRecipient(itemId, "user_2")).status).toBe("forbidden");
    expect((await ctx.adapter.inbox.unarchiveForRecipient(itemId, "user_2")).status).toBe("forbidden");
    expect((await ctx.adapter.inbox.deleteForRecipient(itemId, "user_2")).status).toBe("forbidden");

    expect((await ctx.adapter.inbox.archiveForRecipient("missing", "user_1")).status).toBe("not_found");
    expect((await ctx.adapter.inbox.unarchiveForRecipient("missing", "user_1")).status).toBe("not_found");
    expect((await ctx.adapter.inbox.deleteForRecipient("missing", "user_1")).status).toBe("not_found");
  });

  describe("multi-tenant isolation", () => {
    test("inbox items are scoped by tenantId", async () => {
      await ctx.notify.upsertRecipient({ id: "user_1" });

      await ctx.notify.send({
        recipientId: "user_1",
        notificationId: "user_welcome",
        payload: { name: "Tenant A" },
        tenantId: "tenant_a",
      });
      await ctx.notify.send({
        recipientId: "user_1",
        notificationId: "user_welcome",
        payload: { name: "Tenant B" },
        tenantId: "tenant_b",
      });

      const allItems = await ctx.adapter.inbox.listByRecipient("user_1", {});
      expect(allItems.length).toBeGreaterThanOrEqual(2);

      const tenantAItems = await ctx.adapter.inbox.listByRecipient("user_1", { tenantId: "tenant_a" });
      const tenantBItems = await ctx.adapter.inbox.listByRecipient("user_1", { tenantId: "tenant_b" });
      expect(tenantAItems.every((it) => it.tenantId === "tenant_a")).toBe(true);
      expect(tenantBItems.every((it) => it.tenantId === "tenant_b")).toBe(true);
      expect(tenantAItems.length).toBe(1);
      expect(tenantBItems.length).toBe(1);
    });

    test("preferences are scoped by tenantId", async () => {
      await ctx.notify.upsertRecipient({ id: "user_1" });

      await ctx.notify.preferences.update({
        recipientId: "user_1",
        notificationId: "comment_mentioned",
        tenantId: "tenant_a",
        channels: { email: false },
      });
      await ctx.notify.preferences.update({
        recipientId: "user_1",
        notificationId: "comment_mentioned",
        tenantId: "tenant_b",
        channels: { email: true },
      });

      const prefA = await ctx.notify.preferences.get({
        recipientId: "user_1",
        notificationId: "comment_mentioned",
        tenantId: "tenant_a",
      });
      const prefB = await ctx.notify.preferences.get({
        recipientId: "user_1",
        notificationId: "comment_mentioned",
        tenantId: "tenant_b",
      });
      expect(prefA?.channels.email).toBe(false);
      expect(prefB?.channels.email).toBe(true);
    });

    test("unread count is scoped by tenantId", async () => {
      await ctx.notify.upsertRecipient({ id: "user_1" });

      await ctx.notify.send({
        recipientId: "user_1",
        notificationId: "user_welcome",
        payload: { name: "A" },
        tenantId: "tenant_a",
      });
      await ctx.notify.send({
        recipientId: "user_1",
        notificationId: "user_welcome",
        payload: { name: "B" },
        tenantId: "tenant_a",
      });
      await ctx.notify.send({
        recipientId: "user_1",
        notificationId: "user_welcome",
        payload: { name: "C" },
        tenantId: "tenant_b",
      });

      const countA = await ctx.adapter.inbox.unreadCount("user_1", { tenantId: "tenant_a" });
      const countB = await ctx.adapter.inbox.unreadCount("user_1", { tenantId: "tenant_b" });
      expect(countA).toBe(2);
      expect(countB).toBe(1);
    });
  });
});

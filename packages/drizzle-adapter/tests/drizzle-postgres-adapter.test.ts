import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { sql } from "drizzle-orm";
import {
  channel,
  createNotifyKit,
  fakeEmailProvider,
  notification,
} from "@notifykitjs/core";

import { createPgTables, drizzlePostgresAdapter } from "../src/index.js";

const pgClients: PGlite[] = [];
function newPgClient(): PGlite {
  const c = new PGlite();
  pgClients.push(c);
  return c;
}
afterAll(async () => {
  for (const c of pgClients) await c.close();
});

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
  const client = newPgClient();
  const db = drizzle(client);
  await createPgTables(db);

  const adapter = drizzlePostgresAdapter(db);
  const provider = fakeEmailProvider();
  const notify = createNotifyKit({
    notifications: [commentMentioned, welcome] as const,
    database: adapter,
    providers: { email: provider },
  });

  return { notify, provider, adapter, db, client };
}

describe("drizzlePostgresAdapter", () => {
  let ctx: Awaited<ReturnType<typeof buildKit>>;

  beforeEach(async () => {
    ctx = await buildKit();
  });

  test("createPgTables is idempotent", async () => {
    await createPgTables(ctx.db);
    await ctx.notify.upsertRecipient({ id: "user_1" });
  });

  test("upsertRecipient creates then updates without clobbering", async () => {
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
    // email must survive an update that only sets `name`.
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
    const client = newPgClient();
    const db = drizzle(client);
    await createPgTables(db);
    const alwaysFail = {
      id: "always-fail",
      async send() {
        throw new Error("simulated failure");
      },
    };
    const notify = createNotifyKit({
      notifications: [commentMentioned, welcome] as const,
      database: drizzlePostgresAdapter(db),
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
    expect(result.deliveries).toHaveLength(1);
    expect(result.deliveries[0]!.status).toBe("skipped");
    expect(result.deliveries[0]!.skipReason).toBe("preferences_disabled");
    expect(ctx.provider.sent).toHaveLength(0);
  });

  test("preferences.upsert merges channels across calls via jsonb concat", async () => {
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

  test("quietHours persists as jsonb on the recipient row", async () => {
    await ctx.notify.upsertRecipient({
      id: "u1",
      email: "u@x.com",
      quietHours: { start: "22:00", end: "08:00", timezone: "UTC" },
    });

    const raw = await ctx.db.execute(
      sql`SELECT quiet_hours FROM notifykit_recipients WHERE id = 'u1'`,
    );
    const row = (raw.rows as { quiet_hours: unknown }[])[0]!;
    expect(row.quiet_hours).toEqual({
      start: "22:00",
      end: "08:00",
      timezone: "UTC",
    });

    // Null must actually clear the field, not be dropped as "undefined means keep".
    await ctx.notify.upsertRecipient({ id: "u1", quietHours: null });
    const raw2 = await ctx.db.execute(
      sql`SELECT quiet_hours FROM notifykit_recipients WHERE id = 'u1'`,
    );
    const row2 = (raw2.rows as { quiet_hours: unknown }[])[0]!;
    expect(row2.quiet_hours).toBeNull();
  });

  test("scheduled send is persisted and flushed via flushScheduledSends", async () => {
    const client = newPgClient();
    const db = drizzle(client);
    await createPgTables(db);
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
      database: drizzlePostgresAdapter(db),
      providers: { email: provider },
    });

    // Quiet hours spanning "now" in UTC so the send is deferred.
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

    const pending = await db.execute(
      sql`SELECT COUNT(*)::int as n FROM notifykit_scheduled_sends`,
    );
    expect((pending.rows as { n: number }[])[0]!.n).toBe(1);
    expect(provider.sent).toEqual([]);

    await notify.flushScheduledSends();

    const after = await db.execute(
      sql`SELECT COUNT(*)::int as n FROM notifykit_scheduled_sends`,
    );
    expect((after.rows as { n: number }[])[0]!.n).toBe(0);
    expect(provider.sent).toHaveLength(1);
  });

  test("fallback inbox fires when email terminally fails", async () => {
    const client = newPgClient();
    const db = drizzle(client);
    await createPgTables(db);
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
      database: drizzlePostgresAdapter(db),
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
    const client = newPgClient();
    const db = drizzle(client);
    await createPgTables(db);

    const inboxCh = channel.inbox();
    const def = notification({
      id: "limited",
      payload: { msg: "string" },
      channels: [inboxCh({ title: "{{msg}}" })],
      rateLimit: { max: 2, windowMs: 60_000 },
    });

    const events: string[] = [];
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: drizzlePostgresAdapter(db),
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

    const before = await db.execute(
      sql`SELECT COUNT(*)::int as n FROM notifykit_rate_limit_events`,
    );
    expect((before.rows as { n: number }[])[0]!.n).toBe(2);

    await db.execute(
      sql`UPDATE notifykit_rate_limit_events SET occurred_at = NOW() - INTERVAL '61 seconds'`,
    );
    await notify.send({
      recipientId: "u1",
      notificationId: "limited",
      payload: { msg: "e" },
    });
    const after = await db.execute(
      sql`SELECT COUNT(*)::int as n FROM notifykit_rate_limit_events`,
    );
    expect((after.rows as { n: number }[])[0]!.n).toBe(1);
  });

  test("tenant-scoped rate limit keys are Postgres-safe", async () => {
    const client = newPgClient();
    const db = drizzle(client);
    await createPgTables(db);

    const inboxCh = channel.inbox();
    const def = notification({
      id: "tenant_limited",
      payload: { msg: "string" },
      channels: [inboxCh({ title: "{{msg}}" })],
      rateLimit: { max: 1, windowMs: 60_000 },
    });
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: drizzlePostgresAdapter(db),
      providers: { email: fakeEmailProvider() },
    });
    await notify.upsertRecipient({ id: "u1", tenantId: "tenant_a" });

    await notify.send({
      recipientId: "u1",
      tenantId: "tenant_a",
      notificationId: "tenant_limited",
      payload: { msg: "first" },
    });
    const second = await notify.send({
      recipientId: "u1",
      tenantId: "tenant_a",
      notificationId: "tenant_limited",
      payload: { msg: "second" },
    });
    expect(second.rateLimited).toBe(true);

    const keys = await db.execute(
      sql`SELECT key FROM notifykit_rate_limit_events`,
    );
    const row = (keys.rows as { key: string }[])[0]!;
    expect(row.key).not.toContain("\0");
  });

  test("digest buffer persists and flushes merged payload", async () => {
    const client = newPgClient();
    const db = drizzle(client);
    await createPgTables(db);

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
      database: drizzlePostgresAdapter(db),
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

    const buffered = await db.execute(
      sql`SELECT COUNT(*)::int as n FROM notifykit_digest_buffers`,
    );
    expect((buffered.rows as { n: number }[])[0]!.n).toBe(1);

    await notify.drain();

    const flushed = await db.execute(
      sql`SELECT COUNT(*)::int as n FROM notifykit_digest_buffers`,
    );
    expect((flushed.rows as { n: number }[])[0]!.n).toBe(0);

    const items = await notify.inbox.list("u1");
    expect(items).toHaveLength(1);
    expect(items[0]!.title).toBe("3 updates");
    expect(items[0]!.body).toBe("Latest from Carol");
  });

  test("invalid digest render preserves the buffered row", async () => {
    const client = newPgClient();
    const db = drizzle(client);
    await createPgTables(db);

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
      database: drizzlePostgresAdapter(db),
      providers: { email: fakeEmailProvider() },
    });
    await notify.upsertRecipient({ id: "u1" });
    await notify.send({
      recipientId: "u1",
      notificationId: "broken_digest",
      payload: { count: 1 },
    });

    await expect(notify.flushDigests()).rejects.toThrow(
      /Expected "count" to be number/,
    );

    const buffered = await db.execute(
      sql`SELECT payloads FROM notifykit_digest_buffers`,
    );
    const row = (buffered.rows as { payloads: unknown }[])[0]!;
    expect(row.payloads).toEqual([{ count: 1 }]);
    const items = await notify.inbox.list("u1");
    expect(items).toEqual([]);
  });

  test("JSON payload round-trips through jsonb", async () => {
    await ctx.notify.upsertRecipient({
      id: "user_1",
      email: "a@example.com",
    });
    const result = await ctx.notify.send({
      recipientId: "user_1",
      notificationId: "comment_mentioned",
      payload: {
        actorName: "Rey ✨",
        postTitle: 'Launch "Plan"',
        postUrl: "/posts/123",
      },
    });
    expect(result.notification.payload).toEqual({
      actorName: "Rey ✨",
      postTitle: 'Launch "Plan"',
      postUrl: "/posts/123",
    });
  });

  test("concurrent digest appends to the same key do not drop payloads", async () => {
    // The whole point of the pg adapter vs. the sqlite one: ON CONFLICT DO
    // UPDATE with jsonb concat is atomic per-row, so interleaved appends
    // cannot lose writes. No JS mutex is involved.
    const client = newPgClient();
    const db = drizzle(client);
    await createPgTables(db);
    const adapter = drizzlePostgresAdapter(db);

    const N = 25;
    const appends = Array.from({ length: N }, (_, i) =>
      adapter.digests.append({
        key: "concurrent_key",
        recipientId: "u1",
        notificationId: "concurrent",
        payload: { i },
        windowMs: 60_000,
      }),
    );
    await Promise.all(appends);

    const taken = await adapter.digests.take("concurrent_key");
    expect(taken).not.toBeNull();
    expect(taken!.payloads).toHaveLength(N);
    const seen = new Set(
      taken!.payloads.map((p) => (p as { i: number }).i),
    );
    expect(seen.size).toBe(N);
  });

  test("scheduled send claim is race-free: only one caller wins", async () => {
    const now = new Date();
    const created = await ctx.adapter.scheduledSends.create({
      recipientId: "u1",
      notificationId: "alert",
      payload: { msg: "hi" },
      scheduledFor: now,
      reason: "quiet_hours",
    });
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        ctx.adapter.scheduledSends.claim(created.id),
      ),
    );
    const winners = results.filter((r) => r !== null);
    expect(winners).toHaveLength(1);
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
});

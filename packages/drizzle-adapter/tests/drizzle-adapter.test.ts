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

    await ctx.notify.inbox.markRead(inboxItemId);
    const items = await ctx.notify.inbox.list("user_1");
    expect(items[0]!.readAt).toBeInstanceOf(Date);
  });

  test("delivery.failed persists error text", async () => {
    ctx.provider.setFailOnNext(true);
    await ctx.notify.upsertRecipient({
      id: "user_1",
      email: "a@example.com",
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
    expect(result.deliveries[0]!.status).toBe("failed");
    expect(result.deliveries[0]!.error).toMatch(/simulated failure/);

    const refetched = await ctx.notify.deliveries.list("user_1");
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
});

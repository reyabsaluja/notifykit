import { describe, expect, test } from "bun:test";
import {
  channel,
  createNotifyKit,
  fakeEmailProvider,
  memoryAdapter,
  memoryRealtimeAdapter,
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

describe("inbox mutation lifecycle hooks", () => {
  test("markReadForRecipient fires inbox.updated hook", async () => {
    const hookCalls: string[] = [];
    const realtime = memoryRealtimeAdapter();
    const notify = createNotifyKit({
      notifications: [commentMentioned] as const,
      database: memoryAdapter(),
      providers: { email: fakeEmailProvider() },
      realtime,
      on: {
        "inbox.updated": () => { hookCalls.push("inbox.updated"); },
      },
    });
    await notify.upsertRecipient({ id: "user_1", email: "a@example.com" });
    await notify.send({
      notificationId: "comment_mentioned",
      recipientId: "user_1",
      payload: { actorName: "Bob", postTitle: "Post", postUrl: "https://example.com" },
    });
    const items = await notify.inbox.list("user_1", {});
    await notify.inbox.markReadForRecipient(items[0]!.id, "user_1", {});
    expect(hookCalls).toContain("inbox.updated");
  });

  test("markAllRead fires inbox.all_read hook", async () => {
    const hookCalls: Array<{ recipientId: string; count: number }> = [];
    const realtime = memoryRealtimeAdapter();
    const notify = createNotifyKit({
      notifications: [commentMentioned] as const,
      database: memoryAdapter(),
      providers: { email: fakeEmailProvider() },
      realtime,
      on: {
        "inbox.all_read": (ctx) => { hookCalls.push(ctx); },
      },
    });
    await notify.upsertRecipient({ id: "user_1", email: "a@example.com" });
    await notify.send({
      notificationId: "comment_mentioned",
      recipientId: "user_1",
      payload: { actorName: "Bob", postTitle: "Post", postUrl: "https://example.com" },
    });
    await notify.inbox.markAllRead("user_1", {});
    expect(hookCalls).toHaveLength(1);
    expect(hookCalls[0]!.recipientId).toBe("user_1");
    expect(hookCalls[0]!.count).toBe(1);
  });

  test("archiveForRecipient fires inbox.archived hook", async () => {
    const hookCalls: string[] = [];
    const realtime = memoryRealtimeAdapter();
    const notify = createNotifyKit({
      notifications: [commentMentioned] as const,
      database: memoryAdapter(),
      providers: { email: fakeEmailProvider() },
      realtime,
      on: {
        "inbox.archived": () => { hookCalls.push("inbox.archived"); },
      },
    });
    await notify.upsertRecipient({ id: "user_1", email: "a@example.com" });
    await notify.send({
      notificationId: "comment_mentioned",
      recipientId: "user_1",
      payload: { actorName: "Bob", postTitle: "Post", postUrl: "https://example.com" },
    });
    const items = await notify.inbox.list("user_1", {});
    await notify.inbox.archiveForRecipient(items[0]!.id, "user_1", {});
    expect(hookCalls).toContain("inbox.archived");
  });

  test("unarchiveForRecipient fires inbox.unarchived hook", async () => {
    const hookCalls: string[] = [];
    const realtime = memoryRealtimeAdapter();
    const notify = createNotifyKit({
      notifications: [commentMentioned] as const,
      database: memoryAdapter(),
      providers: { email: fakeEmailProvider() },
      realtime,
      on: {
        "inbox.unarchived": () => { hookCalls.push("inbox.unarchived"); },
      },
    });
    await notify.upsertRecipient({ id: "user_1", email: "a@example.com" });
    await notify.send({
      notificationId: "comment_mentioned",
      recipientId: "user_1",
      payload: { actorName: "Bob", postTitle: "Post", postUrl: "https://example.com" },
    });
    const items = await notify.inbox.list("user_1", {});
    await notify.inbox.archiveForRecipient(items[0]!.id, "user_1", {});
    await notify.inbox.unarchiveForRecipient(items[0]!.id, "user_1", {});
    expect(hookCalls).toContain("inbox.unarchived");
  });

  test("deleteForRecipient fires inbox.deleted hook", async () => {
    const hookCalls: Array<{ itemId: string; recipientId: string }> = [];
    const realtime = memoryRealtimeAdapter();
    const notify = createNotifyKit({
      notifications: [commentMentioned] as const,
      database: memoryAdapter(),
      providers: { email: fakeEmailProvider() },
      realtime,
      on: {
        "inbox.deleted": (ctx) => { hookCalls.push(ctx); },
      },
    });
    await notify.upsertRecipient({ id: "user_1", email: "a@example.com" });
    await notify.send({
      notificationId: "comment_mentioned",
      recipientId: "user_1",
      payload: { actorName: "Bob", postTitle: "Post", postUrl: "https://example.com" },
    });
    const items = await notify.inbox.list("user_1", {});
    await notify.inbox.deleteForRecipient(items[0]!.id, "user_1", {});
    expect(hookCalls).toHaveLength(1);
    expect(hookCalls[0]!.itemId).toBe(items[0]!.id);
    expect(hookCalls[0]!.recipientId).toBe("user_1");
  });

  test("no hook fires on not_found or forbidden results", async () => {
    const hookCalls: string[] = [];
    const realtime = memoryRealtimeAdapter();
    const notify = createNotifyKit({
      notifications: [commentMentioned] as const,
      database: memoryAdapter(),
      providers: { email: fakeEmailProvider() },
      realtime,
      on: {
        "inbox.updated": () => { hookCalls.push("inbox.updated"); },
        "inbox.archived": () => { hookCalls.push("inbox.archived"); },
        "inbox.deleted": () => { hookCalls.push("inbox.deleted"); },
      },
    });
    await notify.upsertRecipient({ id: "user_1", email: "a@example.com" });
    await notify.inbox.markReadForRecipient("nonexistent", "user_1", {});
    await notify.inbox.archiveForRecipient("nonexistent", "user_1", {});
    await notify.inbox.deleteForRecipient("nonexistent", "user_1", {});
    expect(hookCalls).toHaveLength(0);
  });

  test("markAllRead hook does not fire when count is 0", async () => {
    const hookCalls: string[] = [];
    const realtime = memoryRealtimeAdapter();
    const notify = createNotifyKit({
      notifications: [commentMentioned] as const,
      database: memoryAdapter(),
      providers: { email: fakeEmailProvider() },
      realtime,
      on: {
        "inbox.all_read": () => { hookCalls.push("inbox.all_read"); },
      },
    });
    await notify.upsertRecipient({ id: "user_1", email: "a@example.com" });
    await notify.inbox.markAllRead("user_1", {});
    expect(hookCalls).toHaveLength(0);
  });

  test("throwing hook does not prevent realtime publish", async () => {
    const events: Array<{ type: string }> = [];
    const realtime = memoryRealtimeAdapter();
    realtime.subscribe("user_1", {}, (e) => events.push(e));
    const notify = createNotifyKit({
      notifications: [commentMentioned] as const,
      database: memoryAdapter(),
      providers: { email: fakeEmailProvider() },
      realtime,
      on: {
        "inbox.updated": () => { throw new Error("hook failure"); },
      },
    });
    await notify.upsertRecipient({ id: "user_1", email: "a@example.com" });
    await notify.send({
      notificationId: "comment_mentioned",
      recipientId: "user_1",
      payload: { actorName: "Bob", postTitle: "Post", postUrl: "https://example.com" },
    });
    const items = await notify.inbox.list("user_1", {});
    await notify.inbox.markReadForRecipient(items[0]!.id, "user_1", {});
    expect(events.some((e) => e.type === "inbox.updated")).toBe(true);
  });
});

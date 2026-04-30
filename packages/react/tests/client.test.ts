import { beforeEach, describe, expect, test } from "bun:test";
import {
  channel,
  createHandler,
  createNotifyKit,
  fakeEmailProvider,
  memoryAdapter,
  notification,
} from "notifykit";
import { createNotifyKitClient } from "../src/client.js";

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

async function buildHarness(authed = true) {
  const notify = createNotifyKit({
    notifications: [commentMentioned] as const,
    database: memoryAdapter(),
    providers: { email: fakeEmailProvider() },
  });
  const handler = createHandler(notify, {
    identify: () => (authed ? "user_1" : null),
  });
  const client = createNotifyKitClient({
    baseUrl: "http://test/api/notifykit",
    fetch: (input, init) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      return handler(new Request(url, init));
    },
  });
  await notify.upsertRecipient({
    id: "user_1",
    email: "a@example.com",
    name: "Alice",
  });
  return { notify, handler, client };
}

describe("createNotifyKitClient", () => {
  let ctx: Awaited<ReturnType<typeof buildHarness>>;

  beforeEach(async () => {
    ctx = await buildHarness();
  });

  test("inbox.list fetches and revives Date fields", async () => {
    await ctx.notify.send({
      recipientId: "user_1",
      notificationId: "comment_mentioned",
      payload: {
        actorName: "Rey",
        postTitle: "Plan",
        postUrl: "/p",
      },
    });

    const items = await ctx.client.inbox.list();
    expect(items).toHaveLength(1);
    expect(items[0]!.createdAt).toBeInstanceOf(Date);
    expect(items[0]!.readAt).toBeNull();
    expect(items[0]!.title).toBe("Rey mentioned you");
  });

  test("inbox.list publishes state transitions to subscribers", async () => {
    const statuses: string[] = [];
    ctx.client.subscribe(() => {
      statuses.push(ctx.client.getState().inbox.status);
    });
    await ctx.client.inbox.list();
    expect(statuses[0]).toBe("loading");
    expect(statuses[statuses.length - 1]).toBe("ready");
  });

  test("inbox.markRead optimistically updates then confirms", async () => {
    const sent = await ctx.notify.send({
      recipientId: "user_1",
      notificationId: "comment_mentioned",
      payload: {
        actorName: "Rey",
        postTitle: "Plan",
        postUrl: "/p",
      },
    });
    const itemId = sent.inboxItems[0]!.id;
    await ctx.client.inbox.list();

    const snapshots: Array<Date | null | undefined> = [];
    ctx.client.subscribe(() => {
      const item = ctx.client
        .getState()
        .inbox.items.find((i) => i.id === itemId);
      snapshots.push(item?.readAt);
    });

    await ctx.client.inbox.markRead(itemId);

    // First snapshot is the optimistic local update (Date), final is the
    // server-confirmed Date.
    expect(snapshots[0]).toBeInstanceOf(Date);
    expect(snapshots[snapshots.length - 1]).toBeInstanceOf(Date);
  });

  test("inbox.markRead reverts optimistic update on server error", async () => {
    await ctx.notify.send({
      recipientId: "user_1",
      notificationId: "comment_mentioned",
      payload: {
        actorName: "Rey",
        postTitle: "Plan",
        postUrl: "/p",
      },
    });
    await ctx.client.inbox.list();

    await expect(
      ctx.client.inbox.markRead("does_not_exist"),
    ).rejects.toThrow();
    const items = ctx.client.getState().inbox.items;
    expect(items[0]!.readAt).toBeNull();
  });

  test("preferences.update round-trips through the handler", async () => {
    const pref = await ctx.client.preferences.update({
      notificationId: "comment_mentioned",
      channels: { email: false },
    });
    expect(pref.channels.email).toBe(false);

    const persisted = await ctx.notify.preferences.get({
      recipientId: "user_1",
      notificationId: "comment_mentioned",
    });
    expect(persisted?.channels.email).toBe(false);
  });

  test("preferences.update is optimistic", async () => {
    const snapshots: Array<boolean | undefined> = [];
    ctx.client.subscribe(() => {
      const pref = ctx.client
        .getState()
        .preferences.items.find(
          (p) => p.notificationId === "comment_mentioned",
        );
      snapshots.push(pref?.channels.email);
    });
    await ctx.client.preferences.update({
      notificationId: "comment_mentioned",
      channels: { email: false },
    });
    // First snapshot should already reflect the optimistic update.
    expect(snapshots[0]).toBe(false);
  });

  test("notifications.list returns schema metadata", async () => {
    const meta = await ctx.client.notifications.list();
    expect(meta).toHaveLength(1);
    expect(meta[0]!.id).toBe("comment_mentioned");
    expect(meta[0]!.channels).toEqual(["inbox", "email"]);
  });

  test("client surfaces server error messages", async () => {
    await expect(
      ctx.client.preferences.update({
        notificationId: "does_not_exist",
        channels: { email: false },
      }),
    ).rejects.toThrow(/Unknown notification/);
  });

  test("401 from handler becomes an error", async () => {
    const unauth = await buildHarness(false);
    await expect(unauth.client.inbox.list()).rejects.toThrow(/Unauthenticated/);
    expect(unauth.client.getState().inbox.status).toBe("error");
  });

  test("baseUrl trailing slashes are tolerated", async () => {
    const notify = createNotifyKit({
      notifications: [commentMentioned] as const,
      database: memoryAdapter(),
      providers: { email: fakeEmailProvider() },
    });
    const handler = createHandler(notify, { identify: () => "u" });
    await notify.upsertRecipient({ id: "u" });
    const client = createNotifyKitClient({
      baseUrl: "http://test/api/notifykit///",
      fetch: (input, init) => {
        const url = typeof input === "string" ? input : (input as Request).url;
        return handler(new Request(url, init));
      },
    });
    const items = await client.inbox.list();
    expect(items).toEqual([]);
  });
});

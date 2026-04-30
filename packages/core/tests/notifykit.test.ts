import { describe, expect, test } from "bun:test";
import {
  channel,
  createNotifyKit,
  fakeEmailProvider,
  memoryAdapter,
  notification,
} from "../src/index.js";
import type {
  DeliveryRecord,
  InboxItem,
  NotificationRecord,
} from "../src/index.js";

function buildKit(
  extras: {
    hooks?: Parameters<typeof createNotifyKit>[0]["on"];
    provider?: ReturnType<typeof fakeEmailProvider>;
  } = {},
) {
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
    payload: {
      name: "string",
    },
    channels: [
      inbox({
        title: "Welcome, {{name}}",
        body: "Your account is ready.",
      }),
    ],
  });

  const provider = extras.provider ?? fakeEmailProvider();
  const db = memoryAdapter();

  const notify = createNotifyKit({
    notifications: [commentMentioned, welcome] as const,
    database: db,
    providers: { email: provider },
    on: extras.hooks,
  });

  return { notify, db, provider, commentMentioned, welcome };
}

describe("NotifyKit core", () => {
  test("can define a notification", () => {
    const inbox = channel.inbox();
    const def = notification({
      id: "hello",
      payload: { name: "string" },
      channels: [inbox({ title: "Hi {{name}}" })],
    });
    expect(def.id).toBe("hello");
    expect(def.channels).toHaveLength(1);
    expect(def.channels[0]).toEqual({
      type: "inbox",
      title: "Hi {{name}}",
      body: undefined,
      actionUrl: undefined,
    });
  });

  test("can create a NotifyKit instance", () => {
    const { notify } = buildKit();
    expect(typeof notify.send).toBe("function");
    expect(typeof notify.upsertRecipient).toBe("function");
    expect(typeof notify.inbox.list).toBe("function");
    expect(typeof notify.inbox.markRead).toBe("function");
    expect(typeof notify.deliveries.list).toBe("function");
  });

  test("can upsert a recipient (create then update)", async () => {
    const { notify, db } = buildKit();
    const created = await notify.upsertRecipient({
      id: "user_1",
      email: "a@example.com",
      name: "Alice",
    });
    expect(created.id).toBe("user_1");
    expect(created.email).toBe("a@example.com");

    const updated = await notify.upsertRecipient({
      id: "user_1",
      name: "Alice B.",
    });
    expect(updated.name).toBe("Alice B.");
    expect(updated.email).toBe("a@example.com");
    expect(db._state.recipients).toHaveLength(1);
  });

  test("can send an inbox notification", async () => {
    const { notify } = buildKit();
    await notify.upsertRecipient({
      id: "user_1",
      email: "a@example.com",
      name: "Alice",
    });
    const result = await notify.send({
      recipientId: "user_1",
      notificationId: "user_welcome",
      payload: { name: "Alice" },
    });
    expect(result.inboxItems).toHaveLength(1);
    const items = await notify.inbox.list("user_1");
    expect(items).toHaveLength(1);
    expect(items[0]!.title).toBe("Welcome, Alice");
  });

  test("can send a fake email", async () => {
    const { notify, provider } = buildKit();
    await notify.upsertRecipient({
      id: "user_1",
      email: "a@example.com",
      name: "Alice",
    });
    await notify.send({
      recipientId: "user_1",
      notificationId: "comment_mentioned",
      payload: {
        actorName: "Rey",
        postTitle: "Launch Plan",
        postUrl: "/posts/123",
      },
    });
    expect(provider.sent).toHaveLength(1);
    expect(provider.sent[0]!.to).toBe("a@example.com");
    expect(provider.sent[0]!.subject).toBe("Rey mentioned you in Launch Plan");
  });

  test("delivery status becomes 'sent'", async () => {
    const { notify } = buildKit();
    await notify.upsertRecipient({
      id: "user_1",
      email: "a@example.com",
      name: "Alice",
    });
    await notify.send({
      recipientId: "user_1",
      notificationId: "comment_mentioned",
      payload: {
        actorName: "Rey",
        postTitle: "Launch Plan",
        postUrl: "/posts/123",
      },
    });
    const deliveries = await notify.deliveries.list("user_1");
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]!.status).toBe("sent");
    expect(deliveries[0]!.attempts).toBe(1);
    expect(deliveries[0]!.sentAt).toBeInstanceOf(Date);
    expect(deliveries[0]!.providerMessageId).toBeDefined();
  });

  test("unknown recipient throws", async () => {
    const { notify } = buildKit();
    await expect(
      notify.send({
        recipientId: "nope",
        notificationId: "user_welcome",
        payload: { name: "x" },
      }),
    ).rejects.toThrow(/Unknown recipient/);
  });

  test("unknown notification throws", async () => {
    const { notify } = buildKit();
    await notify.upsertRecipient({ id: "user_1" });
    await expect(
      notify.send({
        recipientId: "user_1",
        // @ts-expect-error — testing runtime behavior for unknown id
        notificationId: "does_not_exist",
        payload: {},
      }),
    ).rejects.toThrow(/Unknown notification/);
  });

  test("template variables render correctly", async () => {
    const { notify } = buildKit();
    await notify.upsertRecipient({
      id: "user_1",
      email: "a@example.com",
      name: "Alice",
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
    const inboxItem = result.inboxItems[0]!;
    expect(inboxItem.title).toBe("Rey mentioned you");
    expect(inboxItem.body).toBe("In Launch Plan");
    expect(inboxItem.actionUrl).toBe("/posts/123");
    expect(result.deliveries[0]!.subject).toBe(
      "Rey mentioned you in Launch Plan",
    );
    expect(result.deliveries[0]!.body).toBe("Open /posts/123 to reply.");
  });

  test("markRead() updates inbox item", async () => {
    const { notify } = buildKit();
    await notify.upsertRecipient({ id: "user_1" });
    const result = await notify.send({
      recipientId: "user_1",
      notificationId: "user_welcome",
      payload: { name: "Alice" },
    });
    const item = result.inboxItems[0]!;
    expect(item.readAt).toBeNull();

    const marked = await notify.inbox.markRead(item.id);
    expect(marked).not.toBeNull();
    expect(marked!.readAt).toBeInstanceOf(Date);

    const listed = await notify.inbox.list("user_1");
    expect(listed[0]!.readAt).toBeInstanceOf(Date);
  });

  test("invalid payload throws", async () => {
    const { notify } = buildKit();
    await notify.upsertRecipient({
      id: "user_1",
      email: "a@example.com",
    });
    await expect(
      notify.send({
        recipientId: "user_1",
        notificationId: "user_welcome",
        // @ts-expect-error — deliberately wrong type
        payload: { name: 123 },
      }),
    ).rejects.toThrow(/expected "name" to be string/);

    await expect(
      notify.send({
        recipientId: "user_1",
        notificationId: "user_welcome",
        // @ts-expect-error — missing key
        payload: {},
      }),
    ).rejects.toThrow(/missing "name"/);
  });

  test("event hooks are called", async () => {
    const events: string[] = [];
    const captured: {
      notification?: NotificationRecord;
      inboxItem?: InboxItem;
      delivery?: DeliveryRecord;
    } = {};

    const { notify } = buildKit({
      hooks: {
        "notification.created": ({ notification }) => {
          events.push("notification.created");
          captured.notification = notification;
        },
        "inbox.created": ({ inboxItem }) => {
          events.push("inbox.created");
          captured.inboxItem = inboxItem;
        },
        "delivery.sent": ({ delivery }) => {
          events.push("delivery.sent");
          captured.delivery = delivery;
        },
      },
    });

    await notify.upsertRecipient({
      id: "user_1",
      email: "a@example.com",
      name: "Alice",
    });
    await notify.send({
      recipientId: "user_1",
      notificationId: "comment_mentioned",
      payload: {
        actorName: "Rey",
        postTitle: "Launch Plan",
        postUrl: "/posts/123",
      },
    });

    expect(events).toEqual([
      "notification.created",
      "inbox.created",
      "delivery.sent",
    ]);
    expect(captured.notification?.notificationId).toBe("comment_mentioned");
    expect(captured.inboxItem?.title).toBe("Rey mentioned you");
    expect(captured.delivery?.status).toBe("sent");
  });

  test("preferences default to allow when none set", async () => {
    const { notify, provider } = buildKit();
    await notify.upsertRecipient({
      id: "user_1",
      email: "a@example.com",
    });
    const listed = await notify.preferences.list("user_1");
    expect(listed).toEqual([]);

    const result = await notify.send({
      recipientId: "user_1",
      notificationId: "comment_mentioned",
      payload: {
        actorName: "Rey",
        postTitle: "Launch Plan",
        postUrl: "/posts/123",
      },
    });
    expect(result.skippedChannels).toEqual([]);
    expect(result.inboxItems).toHaveLength(1);
    expect(result.deliveries).toHaveLength(1);
    expect(provider.sent).toHaveLength(1);
  });

  test("preferences.update opts out of email but keeps inbox", async () => {
    const { notify, provider } = buildKit();
    await notify.upsertRecipient({
      id: "user_1",
      email: "a@example.com",
    });
    const pref = await notify.preferences.update({
      recipientId: "user_1",
      notificationId: "comment_mentioned",
      channels: { email: false },
    });
    expect(pref.channels.email).toBe(false);

    const result = await notify.send({
      recipientId: "user_1",
      notificationId: "comment_mentioned",
      payload: {
        actorName: "Rey",
        postTitle: "Launch Plan",
        postUrl: "/posts/123",
      },
    });

    expect(result.skippedChannels).toEqual(["email"]);
    expect(result.inboxItems).toHaveLength(1);
    expect(result.deliveries).toHaveLength(0);
    expect(provider.sent).toHaveLength(0);
  });

  test("preferences.update merges channel settings across calls", async () => {
    const { notify } = buildKit();
    await notify.upsertRecipient({
      id: "user_1",
      email: "a@example.com",
    });
    await notify.preferences.update({
      recipientId: "user_1",
      notificationId: "comment_mentioned",
      channels: { email: false },
    });
    await notify.preferences.update({
      recipientId: "user_1",
      notificationId: "comment_mentioned",
      channels: { inbox: true },
    });
    const pref = await notify.preferences.get({
      recipientId: "user_1",
      notificationId: "comment_mentioned",
    });
    expect(pref).not.toBeNull();
    expect(pref!.channels).toEqual({ email: false, inbox: true });
  });

  test("preferences.update throws for unknown notification or recipient", async () => {
    const { notify } = buildKit();
    await expect(
      notify.preferences.update({
        recipientId: "ghost",
        notificationId: "comment_mentioned",
        channels: { email: false },
      }),
    ).rejects.toThrow(/Unknown recipient/);

    await notify.upsertRecipient({ id: "user_1" });
    await expect(
      notify.preferences.update({
        recipientId: "user_1",
        // @ts-expect-error — unknown id at compile time
        notificationId: "nope",
        channels: { email: false },
      }),
    ).rejects.toThrow(/Unknown notification/);
  });

  test("delivery.failed hook fires when provider throws", async () => {
    const failing = fakeEmailProvider({ failOnNext: true });
    const events: string[] = [];
    const { notify } = buildKit({
      provider: failing,
      hooks: {
        "delivery.failed": ({ delivery }) => {
          events.push(`failed:${delivery.status}`);
        },
      },
    });
    await notify.upsertRecipient({
      id: "user_1",
      email: "a@example.com",
      name: "Alice",
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
    expect(events).toEqual(["failed:failed"]);
    expect(result.deliveries[0]!.status).toBe("failed");
    expect(result.deliveries[0]!.error).toMatch(/simulated failure/);
  });
});

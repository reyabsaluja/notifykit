import { describe, expect, test } from "bun:test";
import {
  channel,
  createNotifyKit,
  fakeEmailProvider,
  fakeSmsProvider,
  memoryAdapter,
  notification,
} from "../src/index.js";
import type {
  DeliveryRecord,
  EmailProvider,
  InboxItem,
  NotificationRecord,
  RetryPolicy,
} from "../src/index.js";

function buildKit(
  extras: {
    hooks?: Parameters<typeof createNotifyKit>[0]["on"];
    provider?: EmailProvider;
    retry?: Partial<RetryPolicy>;
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
    retry: extras.retry,
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
    expect(typeof notify.inbox.markReadForRecipient).toBe("function");
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

    const marked = await notify.inbox.markReadForRecipient(item.id, "user_1");
    expect(marked.status).toBe("marked");
    expect(marked.status === "marked" && marked.item.readAt).toBeInstanceOf(Date);

    const listed = await notify.inbox.list("user_1");
    expect(listed[0]!.readAt).toBeInstanceOf(Date);
  });

  test("markReadForRecipient() refuses another recipient without updating", async () => {
    const { notify } = buildKit();
    await notify.upsertRecipient({ id: "user_1" });
    await notify.upsertRecipient({ id: "user_2" });
    const result = await notify.send({
      recipientId: "user_1",
      notificationId: "user_welcome",
      payload: { name: "Alice" },
    });
    const item = result.inboxItems[0]!;

    const forbidden = await notify.inbox.markReadForRecipient(
      item.id,
      "user_2",
    );
    expect(forbidden.status).toBe("forbidden");

    let listed = await notify.inbox.list("user_1");
    expect(listed[0]!.readAt).toBeNull();

    const missing = await notify.inbox.markReadForRecipient(
      "does_not_exist",
      "user_1",
    );
    expect(missing.status).toBe("not_found");

    const marked = await notify.inbox.markReadForRecipient(item.id, "user_1");
    expect(marked.status).toBe("marked");
    listed = await notify.inbox.list("user_1");
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
    ).rejects.toThrow(/Expected "name" to be string/);

    await expect(
      notify.send({
        recipientId: "user_1",
        notificationId: "user_welcome",
        // @ts-expect-error — missing key
        payload: {},
      }),
    ).rejects.toThrow(/Missing "name"/);
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
    expect(result.deliveries).toHaveLength(1);
    expect(result.deliveries[0]!.status).toBe("skipped");
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

  test("inbox.unreadCount() returns count without loading full inbox", async () => {
    const { notify } = buildKit();
    await notify.upsertRecipient({ id: "user_1" });
    await notify.send({
      recipientId: "user_1",
      notificationId: "user_welcome",
      payload: { name: "Alice" },
    });
    await notify.send({
      recipientId: "user_1",
      notificationId: "user_welcome",
      payload: { name: "Bob" },
    });

    expect(await notify.inbox.unreadCount("user_1")).toBe(2);

    const items = await notify.inbox.list("user_1");
    await notify.inbox.markReadForRecipient(items[0]!.id, "user_1");
    expect(await notify.inbox.unreadCount("user_1")).toBe(1);
  });

  test("inbox.markAllRead() marks all unread items and returns count", async () => {
    const { notify } = buildKit();
    await notify.upsertRecipient({ id: "user_1" });
    await notify.send({
      recipientId: "user_1",
      notificationId: "user_welcome",
      payload: { name: "Alice" },
    });
    await notify.send({
      recipientId: "user_1",
      notificationId: "user_welcome",
      payload: { name: "Bob" },
    });

    const count = await notify.inbox.markAllRead("user_1");
    expect(count).toBe(2);
    expect(await notify.inbox.unreadCount("user_1")).toBe(0);

    const items = await notify.inbox.list("user_1");
    expect(items.every((i) => i.readAt !== null)).toBe(true);

    const again = await notify.inbox.markAllRead("user_1");
    expect(again).toBe(0);
  });

  test("inbox.archive() hides from default list, retrievable with filter", async () => {
    const { notify } = buildKit();
    await notify.upsertRecipient({ id: "user_1" });
    const result = await notify.send({
      recipientId: "user_1",
      notificationId: "user_welcome",
      payload: { name: "Alice" },
    });
    const item = result.inboxItems[0]!;

    const archived = await notify.inbox.archiveForRecipient(
      item.id,
      "user_1",
    );
    expect(archived.status).toBe("ok");
    if (archived.status === "ok") {
      expect(archived.item.archivedAt).toBeInstanceOf(Date);
    }

    const defaultList = await notify.inbox.list("user_1");
    expect(defaultList).toHaveLength(0);

    const archivedList = await notify.inbox.list("user_1", undefined, {
      archived: true,
    });
    expect(archivedList).toHaveLength(1);
    expect(archivedList[0]!.id).toBe(item.id);
  });

  test("inbox.unarchive() restores item to default list", async () => {
    const { notify } = buildKit();
    await notify.upsertRecipient({ id: "user_1" });
    const result = await notify.send({
      recipientId: "user_1",
      notificationId: "user_welcome",
      payload: { name: "Alice" },
    });
    const item = result.inboxItems[0]!;

    await notify.inbox.archiveForRecipient(item.id, "user_1");
    expect(await notify.inbox.list("user_1")).toHaveLength(0);

    const unarchived = await notify.inbox.unarchiveForRecipient(
      item.id,
      "user_1",
    );
    expect(unarchived.status).toBe("ok");
    if (unarchived.status === "ok") {
      expect(unarchived.item.archivedAt).toBeNull();
    }

    expect(await notify.inbox.list("user_1")).toHaveLength(1);
  });

  test("inbox.deleteItem() hard deletes", async () => {
    const { notify } = buildKit();
    await notify.upsertRecipient({ id: "user_1" });
    const result = await notify.send({
      recipientId: "user_1",
      notificationId: "user_welcome",
      payload: { name: "Alice" },
    });
    const item = result.inboxItems[0]!;

    const deleted = await notify.inbox.deleteForRecipient(item.id, "user_1");
    expect(deleted.status).toBe("deleted");

    expect(await notify.inbox.list("user_1")).toHaveLength(0);
    expect(
      await notify.inbox.list("user_1", undefined, { archived: true }),
    ).toHaveLength(0);
  });

  test("inbox operations enforce recipient isolation", async () => {
    const { notify } = buildKit();
    await notify.upsertRecipient({ id: "user_1" });
    await notify.upsertRecipient({ id: "user_2" });
    const result = await notify.send({
      recipientId: "user_1",
      notificationId: "user_welcome",
      payload: { name: "Alice" },
    });
    const item = result.inboxItems[0]!;

    const archiveForbidden = await notify.inbox.archiveForRecipient(
      item.id,
      "user_2",
    );
    expect(archiveForbidden.status).toBe("forbidden");

    const unarchiveForbidden = await notify.inbox.unarchiveForRecipient(
      item.id,
      "user_2",
    );
    expect(unarchiveForbidden.status).toBe("forbidden");

    const deleteForbidden = await notify.inbox.deleteForRecipient(
      item.id,
      "user_2",
    );
    expect(deleteForbidden.status).toBe("forbidden");

    expect(await notify.inbox.list("user_1")).toHaveLength(1);
  });

  test("inbox operations return not_found for missing items", async () => {
    const { notify } = buildKit();
    await notify.upsertRecipient({ id: "user_1" });

    expect(
      (await notify.inbox.archiveForRecipient("nope", "user_1")).status,
    ).toBe("not_found");
    expect(
      (await notify.inbox.unarchiveForRecipient("nope", "user_1")).status,
    ).toBe("not_found");
    expect(
      (await notify.inbox.deleteForRecipient("nope", "user_1")).status,
    ).toBe("not_found");
  });

  test("archived items are excluded from unreadCount", async () => {
    const { notify } = buildKit();
    await notify.upsertRecipient({ id: "user_1" });
    await notify.send({
      recipientId: "user_1",
      notificationId: "user_welcome",
      payload: { name: "Alice" },
    });
    const result2 = await notify.send({
      recipientId: "user_1",
      notificationId: "user_welcome",
      payload: { name: "Bob" },
    });
    expect(await notify.inbox.unreadCount("user_1")).toBe(2);

    await notify.inbox.archiveForRecipient(
      result2.inboxItems[0]!.id,
      "user_1",
    );
    expect(await notify.inbox.unreadCount("user_1")).toBe(1);
  });

  test("markAllRead does not affect archived items", async () => {
    const { notify } = buildKit();
    await notify.upsertRecipient({ id: "user_1" });
    const r1 = await notify.send({
      recipientId: "user_1",
      notificationId: "user_welcome",
      payload: { name: "Alice" },
    });
    await notify.send({
      recipientId: "user_1",
      notificationId: "user_welcome",
      payload: { name: "Bob" },
    });

    await notify.inbox.archiveForRecipient(
      r1.inboxItems[0]!.id,
      "user_1",
    );

    const count = await notify.inbox.markAllRead("user_1");
    expect(count).toBe(1);

    const archivedList = await notify.inbox.list("user_1", undefined, {
      archived: true,
    });
    expect(archivedList[0]!.readAt).toBeNull();
  });

  test("delivery.failed hook fires when provider keeps throwing", async () => {
    // Provider that fails on every attempt
    const alwaysFail = {
      id: "always-fail",
      async send() {
        throw new Error("simulated failure");
      },
    };
    const events: string[] = [];
    const { notify } = buildKit({
      provider: alwaysFail,
      hooks: {
        "delivery.failed": ({ delivery }) => {
          events.push(`failed:${delivery.status}`);
        },
      },
      // Zero-delay retries to keep the test fast
      retry: { maxAttempts: 2, delayMs: () => 0 },
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
    expect(result.deliveries[0]!.attempts).toBe(2);
  });
});

describe("SMS channel", () => {
  const smsChannel = channel.sms();
  const inboxChannel = channel.inbox();

  test("sends SMS to recipient with phone number", async () => {
    const sms = fakeSmsProvider();
    const def = notification({
      id: "otp",
      payload: { code: "string" },
      channels: [smsChannel({ body: "Your code is {{code}}" })],
    });
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: memoryAdapter(),
      providers: { sms },
    });
    await notify.upsertRecipient({ id: "u1", phone: "+15551234567" });

    const result = await notify.send({
      recipientId: "u1",
      notificationId: "otp",
      payload: { code: "9042" },
    });

    expect(result.deliveries).toHaveLength(1);
    expect(result.deliveries[0]!.channel).toBe("sms");
    expect(result.deliveries[0]!.status).toBe("sent");
    expect(sms.sent).toHaveLength(1);
    expect(sms.sent[0]!.to).toBe("+15551234567");
    expect(sms.sent[0]!.body).toBe("Your code is 9042");
  });

  test("skips SMS when recipient has no phone", async () => {
    const sms = fakeSmsProvider();
    const def = notification({
      id: "otp",
      payload: { code: "string" },
      channels: [smsChannel({ body: "Code: {{code}}" })],
    });
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: memoryAdapter(),
      providers: { sms },
    });
    await notify.upsertRecipient({ id: "u1" });

    const result = await notify.send({
      recipientId: "u1",
      notificationId: "otp",
      payload: { code: "1111" },
    });

    expect(result.skippedChannels).toContain("sms");
    expect(sms.sent).toHaveLength(0);
  });

  test("triggers missing_address fallback when no phone", async () => {
    const sms = fakeSmsProvider();
    const def = notification({
      id: "otp",
      payload: { code: "string" },
      channels: [smsChannel({ body: "Code: {{code}}" })],
      fallback: [
        { if: "missing_address", from: "sms", then: inboxChannel({ title: "Your code: {{code}}" }) },
      ],
    });
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: memoryAdapter(),
      providers: { sms },
    });
    await notify.upsertRecipient({ id: "u1" });

    await notify.send({
      recipientId: "u1",
      notificationId: "otp",
      payload: { code: "7777" },
    });

    expect(sms.sent).toHaveLength(0);
    const items = await notify.inbox.list("u1");
    expect(items).toHaveLength(1);
    expect(items[0]!.title).toBe("Your code: 7777");
  });

  test("SMS + inbox multi-channel delivery", async () => {
    const sms = fakeSmsProvider();
    const def = notification({
      id: "alert",
      payload: { msg: "string" },
      channels: [
        inboxChannel({ title: "{{msg}}" }),
        smsChannel({ body: "Alert: {{msg}}" }),
      ],
    });
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: memoryAdapter(),
      providers: { sms },
    });
    await notify.upsertRecipient({ id: "u1", phone: "+15559876543" });

    const result = await notify.send({
      recipientId: "u1",
      notificationId: "alert",
      payload: { msg: "Server down" },
    });

    expect(result.deliveries).toHaveLength(1);
    expect(result.deliveries[0]!.channel).toBe("sms");
    expect(result.deliveries[0]!.status).toBe("sent");
    const items = await notify.inbox.list("u1");
    expect(items).toHaveLength(1);
    expect(items[0]!.title).toBe("Server down");
    expect(sms.sent[0]!.body).toBe("Alert: Server down");
  });
});

describe("input validation", () => {
  test("send() throws on empty recipientId", async () => {
    const { notify } = buildKit();
    await expect(
      notify.send({
        recipientId: "",
        notificationId: "comment_mentioned",
        payload: { actorName: "A", postTitle: "B", postUrl: "/c" },
      }),
    ).rejects.toThrow(/recipientId/i);
  });
});

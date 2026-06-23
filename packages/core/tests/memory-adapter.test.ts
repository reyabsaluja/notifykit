import { describe, expect, test } from "bun:test";
import { memoryAdapter } from "../src/index.js";

describe("memoryAdapter", () => {
  test("list methods reject invalid limits", async () => {
    const adapter = memoryAdapter();

    await expect(
      adapter.inbox.listByRecipient("u1", undefined, undefined, -1),
    ).rejects.toThrow(/positive integer/);
    await expect(
      adapter.deliveries.list("u1", undefined, 1.5),
    ).rejects.toThrow(/positive integer/);
    await expect(
      adapter.timeline!.listByNotificationRecordId("ntf_1", 0),
    ).rejects.toThrow(/positive integer/);
    await expect(
      adapter.timeline!.listByDeliveryId("dlv_1", undefined, Number.NaN),
    ).rejects.toThrow(/positive integer/);
  });

  test("returns defensive copies from recipient methods", async () => {
    const adapter = memoryAdapter();
    const created = await adapter.recipients.upsert({
      id: "u1",
      email: "ada@example.com",
      quietHours: { start: "22:00", end: "06:00", timezone: "UTC" },
    });

    created.email = "mutated@example.com";
    created.quietHours!.start = "00:00";
    created.createdAt.setFullYear(2000);

    const stored = await adapter.recipients.findById("u1");
    expect(stored?.email).toBe("ada@example.com");
    expect(stored?.quietHours?.start).toBe("22:00");
    expect(stored?.createdAt.getFullYear()).not.toBe(2000);

    stored!.email = "again@example.com";
    const reread = await adapter.recipients.findById("u1");
    expect(reread?.email).toBe("ada@example.com");
  });

  test("returns defensive copies from notification and inbox methods", async () => {
    const adapter = memoryAdapter();
    const createdNotification = await adapter.notifications.create({
      recipientId: "u1",
      notificationId: "comment",
      payload: { nested: { count: 1 } },
      payloadSchema: { nested: "object" },
    });

    (createdNotification.payload.nested as { count: number }).count = 2;
    createdNotification.createdAt.setFullYear(2000);

    const storedNotification = await adapter.notifications.findByIdempotencyKey("");
    expect(storedNotification).toBeNull();
    const withKey = await adapter.notifications.create({
      recipientId: "u1",
      notificationId: "comment",
      payload: { message: "hello" },
      idempotencyKey: "key",
    });
    withKey.payload.message = "mutated";

    const replayed = await adapter.notifications.findByIdempotencyKey("key");
    expect(replayed?.payload.message).toBe("hello");

    const inboxItem = await adapter.inbox.create({
      notificationRecordId: createdNotification.id,
      recipientId: "u1",
      notificationId: "comment",
      title: "Original",
    });
    inboxItem.title = "Mutated";
    inboxItem.createdAt.setFullYear(2000);

    const listed = await adapter.inbox.listByRecipient("u1");
    expect(listed[0]?.title).toBe("Original");
    expect(listed[0]?.createdAt.getFullYear()).not.toBe(2000);

    listed[0]!.title = "Mutated again";
    const byNotification = await adapter.inbox.listByNotificationRecordId(
      createdNotification.id,
    );
    expect(byNotification[0]?.title).toBe("Original");

    const marked = await adapter.inbox.markReadForRecipient(inboxItem.id, "u1");
    expect(marked.status).toBe("marked");
    if (marked.status === "marked") {
      marked.item.title = "Mutated marked";
      marked.item.readAt!.setFullYear(2000);
    }
    const afterMark = await adapter.inbox.listByRecipient("u1");
    expect(afterMark[0]?.title).toBe("Original");
    expect(afterMark[0]?.readAt?.getFullYear()).not.toBe(2000);
  });

  test("returns defensive copies from delivery and preference methods", async () => {
    const adapter = memoryAdapter();
    const delivery = await adapter.deliveries.create({
      notificationRecordId: "ntf_1",
      recipientId: "u1",
      notificationId: "comment",
      channel: "email",
      provider: "test",
      status: "sent",
      attempts: 1,
      sentAt: new Date("2026-01-01T00:00:00.000Z"),
    });

    delivery.status = "failed";
    delivery.sentAt!.setFullYear(2000);

    const found = await adapter.deliveries.findById(delivery.id);
    expect(found?.status).toBe("sent");
    expect(found?.sentAt?.getFullYear()).toBe(2026);

    const updated = await adapter.deliveries.update(delivery.id, {
      failedAt: new Date("2026-02-01T00:00:00.000Z"),
    });
    updated!.failedAt!.setFullYear(2000);

    const listed = await adapter.deliveries.list("u1");
    expect(listed[0]?.failedAt?.getFullYear()).toBe(2026);
    listed[0]!.status = "failed";

    const byNotification = await adapter.deliveries.listByNotificationRecordId("ntf_1");
    expect(byNotification[0]?.status).toBe("sent");

    const preference = await adapter.preferences.upsert({
      recipientId: "u1",
      notificationId: "comment",
      channels: { email: false },
    });
    preference.channels.email = true;
    preference.updatedAt.setFullYear(2000);

    const storedPreference = await adapter.preferences.get("u1", "comment");
    expect(storedPreference?.channels.email).toBe(false);
    expect(storedPreference?.updatedAt.getFullYear()).not.toBe(2000);

    storedPreference!.channels.email = true;
    const listedPreferences = await adapter.preferences.list("u1");
    expect(listedPreferences[0]?.channels.email).toBe(false);
  });

  test("returns defensive copies from digest, scheduled send, and timeline methods", async () => {
    const adapter = memoryAdapter();
    const digest = await adapter.digests.append({
      key: "digest_1",
      recipientId: "u1",
      notificationId: "comment",
      payload: { nested: { count: 1 } },
      windowMs: 1000,
    });

    (digest.payloads[0]!.nested as { count: number }).count = 2;
    digest.flushAt.setFullYear(2000);

    const digests = await adapter.digests.list();
    expect((digests[0]?.payloads[0]?.nested as { count: number }).count).toBe(1);
    expect(digests[0]?.flushAt.getFullYear()).not.toBe(2000);

    const taken = await adapter.digests.take("digest_1");
    taken!.payloads[0]!.nested = { count: 3 };
    await adapter.digests.restore(taken!);
    taken!.payloads[0]!.nested = { count: 4 };
    const restored = await adapter.digests.list();
    expect((restored[0]?.payloads[0]?.nested as { count: number }).count).toBe(3);

    const scheduledFor = new Date("2026-03-01T00:00:00.000Z");
    const scheduled = await adapter.scheduledSends.create({
      recipientId: "u1",
      notificationId: "comment",
      payload: { nested: { count: 1 } },
      scheduledFor,
      reason: "quiet_hours",
    });
    scheduledFor.setFullYear(2000);
    (scheduled.payload.nested as { count: number }).count = 2;

    const scheduledList = await adapter.scheduledSends.list();
    expect(scheduledList[0]?.scheduledFor.getFullYear()).toBe(2026);
    expect((scheduledList[0]?.payload.nested as { count: number }).count).toBe(1);

    const claimed = await adapter.scheduledSends.claim(scheduled.id);
    claimed!.claimedAt!.setFullYear(2000);
    const claimedList = await adapter.scheduledSends.list();
    expect(claimedList[0]?.claimedAt?.getFullYear()).not.toBe(2000);

    const appended = await adapter.timeline!.append([
      {
        notificationRecordId: "ntf_1",
        recipientId: "u1",
        notificationId: "comment",
        event: "payload.validated",
        message: "ok",
        metadata: { nested: { count: 1 } },
      },
    ]);
    (appended[0]!.metadata!.nested as { count: number }).count = 2;
    appended[0]!.timestamp.setFullYear(2000);

    const timeline = await adapter.timeline!.listByNotificationRecordId("ntf_1");
    expect((timeline[0]?.metadata?.nested as { count: number }).count).toBe(1);
    expect(timeline[0]?.timestamp.getFullYear()).not.toBe(2000);
  });
});

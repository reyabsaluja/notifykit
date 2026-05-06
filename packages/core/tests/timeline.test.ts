import { describe, expect, test } from "bun:test";
import {
  channel,
  createNotifyKit,
  fakeEmailProvider,
  fakeSmsProvider,
  memoryAdapter,
  notification,
} from "../src/index.js";

const inbox = channel.inbox();
const email = channel.email();
const sms = channel.sms();

function setup() {
  const db = memoryAdapter();
  const emailProvider = fakeEmailProvider();
  const smsProvider = fakeSmsProvider();
  const def = notification({
    id: "comment_mentioned",
    payload: { author: "string", body: "string" },
    channels: [
      inbox({ title: "{{author}} mentioned you", body: "{{body}}" }),
      email({ subject: "{{author}} mentioned you", body: "{{body}}" }),
    ],
    redact: ["body"],
  });
  const notify = createNotifyKit({
    notifications: [def] as const,
    database: db,
    providers: { email: emailProvider, sms: smsProvider },
  });
  return { db, emailProvider, smsProvider, notify };
}

describe("timeline", () => {
  test("records lifecycle events for a successful send", async () => {
    const { notify } = setup();
    await notify.upsertRecipient({ id: "u1", email: "u1@test.com" });

    const result = await notify.send({
      recipientId: "u1",
      notificationId: "comment_mentioned",
      payload: { author: "Alice", body: "Hello" },
    });

    const timeline = await notify.timeline(result.notification!.id);
    expect(timeline.length).toBeGreaterThanOrEqual(4);

    const events = timeline.map((e) => e.event);
    expect(events).toContain("payload.validated");
    expect(events).toContain("recipient.resolved");
    expect(events).toContain("preferences.resolved");
    expect(events).toContain("inbox.created");
    expect(events).toContain("delivery.created");
    expect(events).toContain("delivery.sent");
  });

  test("records provider message ID", async () => {
    const db = memoryAdapter();
    const emailProvider = fakeEmailProvider();
    const def = notification({
      id: "test",
      payload: { msg: "string" },
      channels: [email({ subject: "{{msg}}", body: "{{msg}}" })],
    });
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: db,
      providers: { email: emailProvider },
    });
    await notify.upsertRecipient({ id: "u1", email: "u1@test.com" });

    const result = await notify.send({
      recipientId: "u1",
      notificationId: "test",
      payload: { msg: "hi" },
    });

    const timeline = await notify.timeline(result.notification!.id);
    const msgIdEvent = timeline.find((e) => e.event === "provider.message_id_stored");
    expect(msgIdEvent).toBeDefined();
    expect(msgIdEvent!.metadata?.providerMessageId).toBeDefined();
  });

  test("records deduplication", async () => {
    const { notify } = setup();
    await notify.upsertRecipient({ id: "u1", email: "u1@test.com" });

    await notify.send({
      recipientId: "u1",
      notificationId: "comment_mentioned",
      payload: { author: "Alice", body: "hi" },
      dedupeKey: "mention-1",
      dedupeWindowMs: 60_000,
    });

    const result = await notify.send({
      recipientId: "u1",
      notificationId: "comment_mentioned",
      payload: { author: "Alice", body: "hi" },
      dedupeKey: "mention-1",
      dedupeWindowMs: 60_000,
    });

    const timeline = await notify.timeline(result.notification!.id);
    const dedupeEvent = timeline.find((e) => e.event === "deduplicated");
    expect(dedupeEvent).toBeDefined();
    expect(dedupeEvent!.metadata?.dedupeKey).toBe("mention-1");
  });

  test("records rate limiting", async () => {
    const db = memoryAdapter();
    const emailProvider = fakeEmailProvider();
    const def = notification({
      id: "alert",
      payload: { msg: "string" },
      channels: [email({ subject: "{{msg}}", body: "{{msg}}" })],
      rateLimit: { max: 1, windowMs: 60_000 },
    });
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: db,
      providers: { email: emailProvider },
    });
    await notify.upsertRecipient({ id: "u1", email: "u1@test.com" });

    await notify.send({
      recipientId: "u1",
      notificationId: "alert",
      payload: { msg: "first" },
    });

    const result = await notify.send({
      recipientId: "u1",
      notificationId: "alert",
      payload: { msg: "second" },
    });

    const timeline = await notify.timeline(result.notification!.id);
    const rateLimitEvent = timeline.find((e) => e.event === "rate_limited");
    expect(rateLimitEvent).toBeDefined();
    expect(rateLimitEvent!.metadata?.max).toBe(1);
  });

  test("records channel skipped reasons", async () => {
    const db = memoryAdapter();
    const emailProvider = fakeEmailProvider();
    const def = notification({
      id: "alert",
      payload: { msg: "string" },
      channels: [
        inbox({ title: "{{msg}}" }),
        email({ subject: "{{msg}}", body: "{{msg}}" }),
      ],
    });
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: db,
      providers: { email: emailProvider },
    });
    // No email on recipient
    await notify.upsertRecipient({ id: "u1" });

    const result = await notify.send({
      recipientId: "u1",
      notificationId: "alert",
      payload: { msg: "hello" },
    });

    const timeline = await notify.timeline(result.notification!.id);
    const skipEvent = timeline.find(
      (e) => e.event === "channel.skipped" && e.channel === "email",
    );
    expect(skipEvent).toBeDefined();
    expect(skipEvent!.metadata?.reason).toBe("missing_address");
  });

  test("records retry attempts and provider errors on failure", async () => {
    const db = memoryAdapter();
    let callCount = 0;
    const failingProvider = {
      id: "failing-email",
      async send() {
        callCount++;
        throw new Error("SMTP timeout");
      },
    };
    const def = notification({
      id: "alert",
      payload: { msg: "string" },
      channels: [email({ subject: "{{msg}}", body: "{{msg}}" })],
    });
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: db,
      providers: { email: failingProvider },
      retry: { maxAttempts: 3, delayMs: () => 0 },
    });
    await notify.upsertRecipient({ id: "u1", email: "u1@test.com" });

    const result = await notify.send({
      recipientId: "u1",
      notificationId: "alert",
      payload: { msg: "hi" },
    });

    const timeline = await notify.timeline(result.notification!.id);
    const providerErrors = timeline.filter((e) => e.event === "provider.error");
    expect(providerErrors.length).toBe(3);
    expect(providerErrors[0]!.metadata?.error).toBe("SMTP timeout");

    const retryAttempts = timeline.filter((e) => e.event === "delivery.attempt");
    expect(retryAttempts.length).toBe(2); // attempts 2 and 3

    const failedEvent = timeline.find((e) => e.event === "delivery.failed");
    expect(failedEvent).toBeDefined();
    expect(failedEvent!.metadata?.attempts).toBe(3);
  });

  test("records suppression when all channels disabled", async () => {
    const db = memoryAdapter();
    const emailProvider = fakeEmailProvider();
    const def = notification({
      id: "promo",
      payload: { msg: "string" },
      channels: [email({ subject: "{{msg}}", body: "{{msg}}" })],
    });
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: db,
      providers: { email: emailProvider },
    });
    await notify.upsertRecipient({ id: "u1", email: "u1@test.com" });
    await notify.preferences.update({
      recipientId: "u1",
      notificationId: "promo",
      channels: { email: false },
    });

    const result = await notify.send({
      recipientId: "u1",
      notificationId: "promo",
      payload: { msg: "sale!" },
    });

    const timeline = await notify.timeline(result.notification!.id);
    const suppressEvent = timeline.find((e) => e.event === "notification.suppressed");
    expect(suppressEvent).toBeDefined();
  });

  test("filters timeline by deliveryId", async () => {
    const { notify } = setup();
    await notify.upsertRecipient({ id: "u1", email: "u1@test.com" });

    const result = await notify.send({
      recipientId: "u1",
      notificationId: "comment_mentioned",
      payload: { author: "Bob", body: "test" },
    });

    const emailDelivery = result.deliveries.find((d) => d.channel === "email");
    expect(emailDelivery).toBeDefined();

    const deliveryTimeline = await notify.timeline(result.notification!.id, {
      deliveryId: emailDelivery!.id,
    });

    expect(deliveryTimeline.length).toBeGreaterThan(0);
    for (const event of deliveryTimeline) {
      expect(event.deliveryId).toBe(emailDelivery!.id);
    }
  });

  test("timeline events have correct metadata fields", async () => {
    const { notify } = setup();
    await notify.upsertRecipient({ id: "u1", email: "u1@test.com" });

    const result = await notify.send({
      recipientId: "u1",
      notificationId: "comment_mentioned",
      payload: { author: "Alice", body: "hello" },
    });

    const timeline = await notify.timeline(result.notification!.id);
    for (const event of timeline) {
      expect(event.notificationRecordId).toBe(result.notification!.id);
      expect(event.recipientId).toBe("u1");
      expect(event.notificationId).toBe("comment_mentioned");
      expect(event.id).toBeTruthy();
      expect(event.timestamp).toBeInstanceOf(Date);
    }
  });

  test("records quiet hours deferral", async () => {
    const db = memoryAdapter();
    const emailProvider = fakeEmailProvider();
    const def = notification({
      id: "alert",
      payload: { msg: "string" },
      channels: [
        inbox({ title: "{{msg}}" }),
        email({ subject: "{{msg}}", body: "{{msg}}" }),
      ],
    });
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: db,
      providers: { email: emailProvider },
    });

    const now = new Date();
    const startHour = now.getHours();
    const endHour = (startHour + 2) % 24;
    const start = `${String(startHour).padStart(2, "0")}:00`;
    const end = `${String(endHour).padStart(2, "0")}:00`;

    await notify.upsertRecipient({
      id: "u1",
      email: "u1@test.com",
      quietHours: { start, end, timezone: "UTC" },
    });

    const result = await notify.send({
      recipientId: "u1",
      notificationId: "alert",
      payload: { msg: "hi" },
    });

    const timeline = await notify.timeline(result.notification!.id);
    const deferEvent = timeline.find((e) => e.event === "quiet_hours.deferred");
    expect(deferEvent).toBeDefined();
    expect(deferEvent!.channel).toBe("email");
  });
});
